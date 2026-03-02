import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useSocket } from "../context/SocketContext";

export default function Call() {
  const { roomCode } = useParams();
  const socket = useSocket();
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const peerRef = useRef();

  useEffect(() => {
    if (!socket) return;

    navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    }).then(stream => {
      localVideoRef.current.srcObject = stream;

      const peer = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" }
        ]
      });

      stream.getTracks().forEach(track => {
        peer.addTrack(track, stream);
      });

      peer.ontrack = event => {
        remoteVideoRef.current.srcObject = event.streams[0];
      };

      peer.onicecandidate = event => {
        if (event.candidate) {
          socket.emit("ice-candidate", {
            candidate: event.candidate,
            to: socket.id
          });
        }
      };

      peerRef.current = peer;

      socket.emit("join-room", {
        roomCode,
        userId: socket.id
      });

      socket.on("user-joined", async ({ socketId }) => {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);

        socket.emit("webrtc-offer", {
          offer,
          to: socketId
        });
      });

      socket.on("webrtc-offer", async offer => {
        await peer.setRemoteDescription(offer);

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        socket.emit("webrtc-answer", {
          answer,
          to: socket.id
        });
      });

      socket.on("webrtc-answer", async answer => {
        await peer.setRemoteDescription(answer);
      });

      socket.on("ice-candidate", async candidate => {
        await peer.addIceCandidate(candidate);
      });
    });

  }, [socket, roomCode]);

  return (
    <div style={{ display: "flex", gap: "10px" }}>
      <video ref={localVideoRef} autoPlay muted width="400" />
      <video ref={remoteVideoRef} autoPlay width="400" />
    </div>
  );
}