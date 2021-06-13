import { Server as HttpServer } from "http";
import { Emitter } from "@socket.io/redis-emitter";
import { createAdapter } from "@socket.io/redis-adapter";
import { RedisClient } from "redis";
import { Server, Socket } from "socket.io";
import { Container } from "typedi";
import { loadEventRules } from "./../eventRules";
import Logger from "./../logger";
import fetch from "node-fetch";
import { UsersService } from "../services/users";

function createEventClient(
  socket: Socket,
  url: string,
  extraHeaders?: string[]
) {
  async function send(path: string, payload?: any) {
    const requestPath = `${url}${path}`;
    Logger.debug("Requesting upstream", {
      url: requestPath,
    });
    return fetch(requestPath, {
      method: "POST",
      body: payload ? JSON.stringify(payload) : undefined,
      headers: {
        "Content-Type": "application/json",
        ...(extraHeaders
          ? extraHeaders.reduce<{ [key: string]: string }>((acc, header) => {
              const normalizedHeader = header.toLowerCase();
              if (socket.handshake.headers[normalizedHeader]) {
                acc[normalizedHeader] = socket.handshake.headers[
                  normalizedHeader
                ] as string;
              }
              return acc;
            }, {})
          : {}),
      },
    })
      .then((resp) => {
        if (!resp.ok) {
          Logger.debug("Error during request to upstream", {
            status: resp.status,
          });
        }
      })
      .catch((err) => {
        // TODO: add better logging
        Logger.debug("Error during request to upstream", {
          err,
        });
      });
  }
  return {
    onConnect: async () => {
      return send("connect/");
    },
    onEvent: async (eventName: string, payload?: any) => {
      return send(`event/${eventName}/`, payload);
    },
  };
}

export default async ({ httpServer }: { httpServer: HttpServer }) => {
  const io = new Server(httpServer, {
    path: "/ws/",
  });
  const redisClient = Container.get(RedisClient);
  const pubClient = redisClient.duplicate();
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  const ioEmitter = new Emitter(redisClient.duplicate());

  Container.set(Emitter, ioEmitter);

  const eventRules = await loadEventRules();

  for (const eventRule of eventRules) {
    io.of(eventRule.match.namespace).on("connection", (socket) => {
      const eventClient = createEventClient(
        socket,
        eventRule.upstream.url,
        eventRule.upstream.headers
      );
      const userId = socket.handshake.headers["x-user"] as string;
      const usersService = Container.get(UsersService);
      usersService.storeUserSocket(userId, socket.id);
      Logger.info("Socket connected", {
        userId,
        socketId: socket.id,
      });
      eventClient.onConnect();
      socket.onAny((eventName, payload) => {
        eventClient.onEvent(eventName, payload);
      });
    });
  }
};