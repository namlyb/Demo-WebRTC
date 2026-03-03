import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { useSocket } from "./SocketContext";
import SimplePeer from "simple-peer";

const CallContext = createContext(null);

export const CallProvider = ({ children, roomId }) => {
  const { socket } = useSocket();

  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [mediaError, setMediaError] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  const peersRef = useRef({});
  const joinedRef = useRef(false);
  const localVideoRef = useRef();
  const screenStreamRef = useRef(null);

  // Chờ socket kết nối
  if (!socket) {
    return <div>Đang kết nối đến server...</div>;
  }

  // Lấy media (cam + mic)
  useEffect(() => {
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
        setAudioEnabled(stream.getAudioTracks()[0]?.enabled ?? true);
        setVideoEnabled(stream.getVideoTracks()[0]?.enabled ?? true);
        setMediaError(null);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Failed to get media", err);
        setMediaError(err.message);
      }
    };
    getMedia();
  }, []);

  // Gán localStream vào video element khi có
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Tạo peer connection
  const createPeer = useCallback(
    (targetId, initiator) => {
      const peer = new SimplePeer({
        initiator,
        stream: localStream || undefined,
        trickle: true,
        config: {
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        },
      });

      peer.on("signal", (data) => {
        if (initiator) {
          socket.emit("offer", { target: targetId, offer: data });
        } else {
          socket.emit("answer", { target: targetId, answer: data });
        }
      });

      peer.on("stream", (remoteStream) => {
        setRemoteStreams((prev) => ({ ...prev, [targetId]: remoteStream }));
      });

      peer.on("close", () => {
        setRemoteStreams((prev) => {
          const newStreams = { ...prev };
          delete newStreams[targetId];
          return newStreams;
        });
        delete peersRef.current[targetId];
      });

      peer.on("error", (err) => {
        console.error("Peer error", err);
      });

      return peer;
    },
    [localStream, socket]
  );

  // Thay thế video track cho tất cả peers (dùng khi chia sẻ màn hình)
  const replaceVideoTrackForAllPeers = useCallback((newTrack) => {
    Object.values(peersRef.current).forEach((peer) => {
      if (peer && peer._pc) {
        const senders = peer._pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === "video");
        if (videoSender) {
          videoSender.replaceTrack(newTrack);
        }
      }
    });
  }, []);

  // Bật/tắt mic
  const toggleAudio = useCallback(() => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setAudioEnabled(audioTrack.enabled);
    }
  }, [localStream]);

  // Bật/tắt camera
  const toggleVideo = useCallback(() => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setVideoEnabled(videoTrack.enabled);
    }
  }, [localStream]);

  // Bật/tắt chia sẻ màn hình
  const toggleScreenShare = useCallback(async () => {
    if (!localStream) return;

    if (screenSharing) {
      // Dừng chia sẻ màn hình, quay lại camera
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
      }

      try {
        const newVideoTrack = await navigator.mediaDevices
          .getUserMedia({ video: true })
          .then((stream) => stream.getVideoTracks()[0]);

        const oldVideoTrack = localStream.getVideoTracks()[0];
        if (oldVideoTrack) {
          localStream.removeTrack(oldVideoTrack);
          oldVideoTrack.stop();
        }
        localStream.addTrack(newVideoTrack);

        setLocalStream(new MediaStream([localStream.getAudioTracks()[0], newVideoTrack]));
        setVideoEnabled(true);
        setScreenSharing(false);
        replaceVideoTrackForAllPeers(newVideoTrack);
      } catch (err) {
        console.error("Failed to switch back to camera", err);
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        const screenTrack = screenStream.getVideoTracks()[0];

        screenTrack.onended = () => {
          toggleScreenShare();
        };

        const oldVideoTrack = localStream.getVideoTracks()[0];
        if (oldVideoTrack) {
          localStream.removeTrack(oldVideoTrack);
          oldVideoTrack.stop();
        }
        localStream.addTrack(screenTrack);

        screenStreamRef.current = screenStream;
        setLocalStream(new MediaStream([localStream.getAudioTracks()[0], screenTrack]));
        setVideoEnabled(true);
        setScreenSharing(true);
        replaceVideoTrackForAllPeers(screenTrack);
      } catch (err) {
        console.error("Failed to share screen", err);
        alert("Không thể chia sẻ màn hình: " + err.message);
      }
    }
  }, [localStream, screenSharing, replaceVideoTrackForAllPeers]);

  // Join room
  useEffect(() => {
    if (!socket || !roomId) return;
    if (!socket.connected) return;
    if (joinedRef.current) return;

    console.log("Joining room:", roomId);
    socket.emit("join-room", { roomCode: roomId });
    joinedRef.current = true;
  }, [socket, roomId]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const handleAllUsers = (users) => {
      setParticipants(users);
      users.forEach((user) => {
        if (user.id !== socket.id && !peersRef.current[user.id]) {
          const peer = createPeer(user.id, true);
          if (peer) peersRef.current[user.id] = peer;
        }
      });
      setLoading(false);
    };

    const handleUserJoined = (user) => {
      setParticipants((prev) => {
        if (prev.find((p) => p.id === user.id)) return prev;
        return [...prev, user];
      });
      if (user.id !== socket.id && !peersRef.current[user.id]) {
        const peer = createPeer(user.id, true);
        if (peer) peersRef.current[user.id] = peer;
      }
    };

    const handleUserLeft = (userId) => {
      setParticipants((prev) => prev.filter((p) => p.id !== userId));
      if (peersRef.current[userId]) {
        peersRef.current[userId].destroy();
        delete peersRef.current[userId];
      }
    };

    const handleOffer = ({ sender, offer }) => {
      if (peersRef.current[sender]) return;
      const peer = createPeer(sender, false);
      if (peer) {
        peersRef.current[sender] = peer;
        peer.signal(offer);
      }
    };

    const handleAnswer = ({ sender, answer }) => {
      const peer = peersRef.current[sender];
      if (peer) peer.signal(answer);
    };

    const handleIceCandidate = ({ sender, candidate }) => {
      const peer = peersRef.current[sender];
      if (peer) peer.signal(candidate);
    };

    socket.on("all-users", handleAllUsers);
    socket.on("user-joined", handleUserJoined);
    socket.on("user-left", handleUserLeft);
    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleIceCandidate);

    return () => {
      socket.off("all-users", handleAllUsers);
      socket.off("user-joined", handleUserJoined);
      socket.off("user-left", handleUserLeft);
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice-candidate", handleIceCandidate);
    };
  }, [socket, createPeer]);

  // Rời phòng
  const leaveRoom = useCallback(() => {
    if (!socket || !roomId) return;
    console.log("Leaving room:", roomId);
    socket.emit("leave-room", { roomCode: roomId });

    Object.values(peersRef.current).forEach((peer) => peer.destroy());
    peersRef.current = {};

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }

    setRemoteStreams({});
    setParticipants([]);
    joinedRef.current = false;
  }, [socket, roomId, localStream]);

  const value = {
    participants,
    loading,
    localStream,
    remoteStreams,
    localVideoRef,
    leaveRoom,
    mediaError,
    audioEnabled,
    videoEnabled,
    screenSharing,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) throw new Error("useCall must be used inside CallProvider");
  return context;
};