import React from "react";
import { useStore } from "../../libs/store/useStore";
import { PeerView } from "./PeerView";

export function SelfView() {
  const { audioProducer, videoProducer } = useStore((state) => {
    return {
      audioProducer: state.micProducer,
      videoProducer: state.webcamProducer,
    };
  });

  return (
    <div>
      <PeerView
        isMe
        audioTrack={audioProducer ? audioProducer.track : null}
        videoTrack={videoProducer ? videoProducer.track : null}
      />
    </div>
  );
}