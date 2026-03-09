import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";

const CallContext = createContext();

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) throw new Error("useCall must be used within CallProvider");
  return context;
};

// ICE servers – nếu test giữa Wifi và 4G, cần TURN server (liên hệ mình để biết thêm)
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    // Bạn có thể thêm TURN server ở đây nếu cần
  ],
};

export const CallProvider = ({ children, roomId }) => {
  const [socket, setSocket] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState([]);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [myName, setMyName] = useState("");

  const peersRef = useRef([]);

  // --- Socket initialization ---
  useEffect(() => {
    const s = io({ transports: ["websocket"] });
    setSocket(s);
    return () => s.disconnect();
  }, []);

  // --- Get local media ---
  useEffect(() => {
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: true,
        });
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) videoTrack.enabled = false; // tắt video lúc đầu
        setLocalStream(stream);
        console.log("Local stream obtained", stream.id,
          stream.getTracks().map(t => `${t.kind}:${t.enabled}`));
      } catch (err) {
        console.error("❌ getUserMedia error", err);
      }
    };
    init();
  }, []);

  // --- Join room when ready ---
  useEffect(() => {
    if (!socket || !roomId || !localStream) return;
    const joinRoom = () => socket.emit("join-room", { roomCode: roomId });
    if (socket.connected) joinRoom();
    socket.on("connect", joinRoom);
    return () => socket.off("connect", joinRoom);
  }, [socket, roomId, localStream]);

  // --- Helper xử lý stream từ peer ---
  const handlePeerStream = useCallback((peerId, remoteStream) => {
    console.log(`🎥 [${peerId}] received stream`, remoteStream.id,
      remoteStream.getTracks().map(t => `${t.kind}:${t.enabled}`));

    const peerRef = peersRef.current.find(p => p.id === peerId);
    if (peerRef) {
      peerRef.peer.remoteStream = remoteStream;
    }

    setPeers(prev => prev.map(p =>
      p.id === peerId ? { ...p, peer: { ...p.peer, remoteStream } } : p
    ));
  }, []);

  // --- Socket event listeners ---
  useEffect(() => {
    if (!socket || !localStream) return;

    socket.on("your-name", (name) => setMyName(name));

    socket.on("all-users", (users) => {
      console.log("📡 all-users", users);
      const peersArr = [];
      users.forEach((user) => {
        const peer = createPeer(user.id, localStream);
        peersRef.current.push({
          id: user.id,
          peer,
          name: user.name,
          audioEnabled: true,
          videoEnabled: true,
        });
        peersArr.push({ id: user.id, peer, name: user.name, audioEnabled: true, videoEnabled: true });
      });
      setPeers(peersArr);
    });

    socket.on("user-joined", ({ id, name }) => {
      console.log("➕ user-joined", id, name);
      const peer = addPeer(id, localStream);
      const newPeer = { id, peer, name, audioEnabled: true, videoEnabled: true };
      peersRef.current.push(newPeer);
      setPeers((prev) => [...prev, newPeer]);
    });

    socket.on("receiving-signal", ({ id, signal }) => {
      console.log("📨 receiving-signal from", id);
      const item = peersRef.current.find((p) => p.id === id);
      if (item && item.peer && !item.peer.destroyed) {
        item.peer.signal(signal);
      }
    });

    socket.on("user-left", (id) => {
      console.log("➖ user-left", id);
      const peerObj = peersRef.current.find((p) => p.id === id);
      if (peerObj && peerObj.peer && !peerObj.peer.destroyed) {
        peerObj.peer.destroy();
      }
      peersRef.current = peersRef.current.filter((p) => p.id !== id);
      setPeers((prev) => prev.filter((p) => p.id !== id));
    });

    socket.on("initial-media-states", (states) => {
      console.log("📊 initial-media-states", states);
      setPeers((prev) =>
        prev.map((p) => {
          const state = states.find((s) => s.userId === p.id);
          return state ? { ...p, audioEnabled: state.audioEnabled, videoEnabled: state.videoEnabled } : p;
        })
      );
      states.forEach(({ userId, audioEnabled, videoEnabled }) => {
        const peerRef = peersRef.current.find((p) => p.id === userId);
        if (peerRef) {
          peerRef.audioEnabled = audioEnabled;
          peerRef.videoEnabled = videoEnabled;
        }
      });
    });

    socket.on("peer-media-state", ({ userId, audioEnabled, videoEnabled }) => {
      console.log("🔄 peer-media-state", userId, audioEnabled, videoEnabled);
      setPeers((prev) => prev.map((p) => (p.id === userId ? { ...p, audioEnabled, videoEnabled } : p)));
      const peerRef = peersRef.current.find((p) => p.id === userId);
      if (peerRef) {
        peerRef.audioEnabled = audioEnabled;
        peerRef.videoEnabled = videoEnabled;
      }
    });

    socket.on("peer-name-changed", ({ userId, name }) => {
      setPeers((prev) => prev.map((p) => (p.id === userId ? { ...p, name } : p)));
      const peerRef = peersRef.current.find((p) => p.id === userId);
      if (peerRef) peerRef.name = name;
    });

    return () => {
      socket.off("your-name");
      socket.off("all-users");
      socket.off("user-joined");
      socket.off("receiving-signal");
      socket.off("user-left");
      socket.off("initial-media-states");
      socket.off("peer-media-state");
      socket.off("peer-name-changed");
    };
  }, [socket, localStream]);

  // --- Tạo peer (initiator) ---
  const createPeer = (userToSignal, stream) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
      config: ICE_SERVERS,
    });

    peer.on("signal", (signal) => {
      console.log("📤 sending-signal to", userToSignal);
      socket.emit("sending-signal", { userToSignal, signal });
    });

    peer.on("stream", (remoteStream) => {
      handlePeerStream(userToSignal, remoteStream);
    });

    peer.on("connect", () => console.log("✅ peer connected to", userToSignal));
    peer.on("error", (err) => {
      console.error("❌ peer error", userToSignal, err);
      // Xóa peer khỏi danh sách nếu lỗi nghiêm trọng
      if (err.message.includes("Close called") || err.message.includes("Connection failed")) {
        const peerRef = peersRef.current.find(p => p.id === userToSignal);
        if (peerRef && !peerRef.peer.destroyed) {
          peerRef.peer.destroy();
        }
        peersRef.current = peersRef.current.filter(p => p.id !== userToSignal);
        setPeers(prev => prev.filter(p => p.id !== userToSignal));
      }
    });

    return peer;
  };

  // --- Thêm peer (non-initiator) ---
  const addPeer = (incomingID, stream) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
      config: ICE_SERVERS,
    });

    peer.on("signal", (signal) => {
      console.log("📤 returning-signal to", incomingID);
      socket.emit("returning-signal", { userToSignal: incomingID, signal });
    });

    peer.on("stream", (remoteStream) => {
      handlePeerStream(incomingID, remoteStream);
    });

    peer.on("connect", () => console.log("✅ peer connected to", incomingID));
    peer.on("error", (err) => {
      console.error("❌ peer error", incomingID, err);
      if (err.message.includes("Close called") || err.message.includes("Connection failed")) {
        const peerRef = peersRef.current.find(p => p.id === incomingID);
        if (peerRef && !peerRef.peer.destroyed) {
          peerRef.peer.destroy();
        }
        peersRef.current = peersRef.current.filter(p => p.id !== incomingID);
        setPeers(prev => prev.filter(p => p.id !== incomingID));
      }
    });

    return peer;
  };

  // --- Toggle audio ---
  const toggleAudio = useCallback(() => {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (!track) return;
    const newState = !track.enabled;
    track.enabled = newState;
    setAudioEnabled(newState);
    socket.emit("media-state-change", { audioEnabled: newState, videoEnabled });
  }, [localStream, socket, videoEnabled]);

  // --- Toggle video ---
  const toggleVideo = useCallback(() => {
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (!track) return;
    const newState = !track.enabled;
    track.enabled = newState;
    setVideoEnabled(newState);
    socket.emit("media-state-change", { audioEnabled, videoEnabled: newState });
  }, [localStream, socket, audioEnabled]);

  // --- Đổi tên ---
  const changeName = useCallback((newName) => {
    setMyName(newName);
    socket.emit("change-name", newName);
  }, [socket]);

  // --- Rời phòng ---
  const leaveRoom = useCallback(() => {
    peersRef.current.forEach(({ peer }) => {
      if (peer && !peer.destroyed) peer.destroy();
    });
    peersRef.current = [];
    setPeers([]);
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    socket.disconnect();
  }, [localStream, socket]);

  return (
    <CallContext.Provider
      value={{
        peers,
        localStream,
        toggleAudio,
        toggleVideo,
        leaveRoom,
        audioEnabled,
        videoEnabled,
        myName,
        changeName,
      }}
    >
      {children}
    </CallContext.Provider>
  );
};