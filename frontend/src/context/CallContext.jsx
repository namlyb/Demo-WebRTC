import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";

const CallContext = createContext();

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) throw new Error("useCall must be used within CallProvider");
  return context;
};

export const CallProvider = ({ children, roomId }) => {
  const [socket, setSocket] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [peers, setPeers] = useState([]);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [myName, setMyName] = useState("");

  const peersRef = useRef([]);
  const localVideoRef = useRef();

  // Socket connection
  useEffect(() => {
    const newSocket = io("http://localhost:5000", { transports: ["websocket"] });
    setSocket(newSocket);
    return () => newSocket.disconnect();
  }, []);

  // Get local media
  useEffect(() => {
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      } catch (err) {
        console.error("Failed to get local stream:", err);
      }
    };
    init();
  }, []);

  // Join room
  useEffect(() => {
    if (!socket || !roomId || !localStream) return;
    const joinRoom = () => socket.emit("join-room", { roomCode: roomId });
    if (socket.connected) joinRoom();
    socket.on("connect", joinRoom);
    return () => socket.off("connect", joinRoom);
  }, [socket, roomId, localStream]);

  // Listen for your-name
  useEffect(() => {
    if (!socket) return;
    socket.on("your-name", (name) => setMyName(name));
    return () => socket.off("your-name");
  }, [socket]);

  // Listen for initial media states
  useEffect(() => {
    if (!socket) return;
    socket.on("initial-media-states", (states) => {
      setPeers(prev => prev.map(p => {
        const state = states.find(s => s.userId === p.id);
        if (state) {
          return { ...p, audioEnabled: state.audioEnabled, videoEnabled: state.videoEnabled };
        }
        return p;
      }));
    });
    return () => socket.off("initial-media-states");
  }, [socket]);

  // Listen for peer media state changes
  useEffect(() => {
    if (!socket) return;
    socket.on("peer-media-state", ({ userId, audioEnabled, videoEnabled }) => {
      setPeers(prev => prev.map(p => 
        p.id === userId ? { ...p, audioEnabled, videoEnabled } : p
      ));
      const peerRef = peersRef.current.find(p => p.id === userId);
      if (peerRef) {
        peerRef.audioEnabled = audioEnabled;
        peerRef.videoEnabled = videoEnabled;
      }
    });
    return () => socket.off("peer-media-state");
  }, [socket]);

  // Listen for peer name changes
  useEffect(() => {
    if (!socket) return;
    socket.on("peer-name-changed", ({ userId, name }) => {
      setPeers(prev => prev.map(p => p.id === userId ? { ...p, name } : p));
      const peerRef = peersRef.current.find(p => p.id === userId);
      if (peerRef) peerRef.name = name;
    });
    return () => socket.off("peer-name-changed");
  }, [socket]);

  // Helper to replace video track for all peers (used in screen share)
  const replaceVideoTrackForAll = (newTrack) => {
    peersRef.current.forEach(({ peer }) => {
      const sender = peer._pc?.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        sender.replaceTrack(newTrack).catch(err => console.error('replaceTrack error:', err));
      }
    });
  };

  // Socket events for peers
  useEffect(() => {
    if (!socket || !localStream) return;

    socket.on("all-users", (users) => {
      const peersArr = [];
      users.forEach((user) => {
        const peer = createPeer(user.id, localStream);
        peersRef.current.push({ 
          id: user.id, 
          peer, 
          name: user.name,
          audioEnabled: true, 
          videoEnabled: true 
        });
        peersArr.push({ id: user.id, peer, name: user.name, audioEnabled: true, videoEnabled: true });
      });
      setPeers(peersArr);
    });

    socket.on("user-joined", ({ id, name }) => {
      const peer = addPeer(id, localStream);
      const newPeer = { id, peer, name, audioEnabled: true, videoEnabled: true };
      peersRef.current.push(newPeer);
      setPeers((prev) => [...prev, newPeer]);

      // Nếu đang share màn hình, thay track video của peer mới bằng screen track
      if (screenSharing && screenStream) {
        const screenTrack = screenStream.getVideoTracks()[0];
        const sender = peer._pc?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack).catch(err => console.error('replaceTrack for new peer error:', err));
        }
      }
    });

    socket.on("receiving-signal", ({ id, signal }) => {
      const item = peersRef.current.find((p) => p.id === id);
      if (item) item.peer.signal(signal);
    });

    socket.on("user-left", (id) => {
      const peerObj = peersRef.current.find((p) => p.id === id);
      if (peerObj) peerObj.peer.destroy();
      peersRef.current = peersRef.current.filter((p) => p.id !== id);
      setPeers((prev) => prev.filter((p) => p.id !== id));
    });

    return () => {
      socket.off("all-users");
      socket.off("user-joined");
      socket.off("receiving-signal");
      socket.off("user-left");
    };
  }, [socket, localStream, screenSharing, screenStream]);

  const createPeer = (userToSignal, stream) => {
    const peer = new Peer({ initiator: true, trickle: false, stream });
    peer.on("signal", (signal) => {
      socket.emit("sending-signal", { userToSignal, signal });
    });
    peer.on("stream", (remoteStream) => {
      // Force re-render khi có stream mới
      setPeers(prev => prev.map(p => p.id === userToSignal ? { ...p } : p));
    });
    return peer;
  };

  const addPeer = (incomingID, stream) => {
    const peer = new Peer({ initiator: false, trickle: false, stream });
    peer.on("signal", (signal) => {
      socket.emit("returning-signal", { userToSignal: incomingID, signal });
    });
    peer.on("stream", (remoteStream) => {
      setPeers(prev => prev.map(p => p.id === incomingID ? { ...p } : p));
    });
    return peer;
  };

  // Media controls
  const toggleAudio = () => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;
    const newState = !audioTrack.enabled;
    audioTrack.enabled = newState;
    setAudioEnabled(newState);
    socket.emit("media-state-change", { audioEnabled: newState, videoEnabled });
  };

  const toggleVideo = () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;
    const newState = !videoTrack.enabled;
    videoTrack.enabled = newState;
    setVideoEnabled(newState);
    socket.emit("media-state-change", { audioEnabled, videoEnabled: newState });
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = stream.getVideoTracks()[0];

      replaceVideoTrackForAll(screenTrack);

      setScreenStream(stream);
      setScreenSharing(true);

      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      console.error("Screen share failed:", err);
    }
  };

  const stopScreenShare = () => {
    if (!screenStream) return;
    const cameraTrack = localStream.getVideoTracks()[0];

    replaceVideoTrackForAll(cameraTrack);

    screenStream.getTracks().forEach(track => track.stop());
    setScreenStream(null);
    setScreenSharing(false);
  };

  const toggleScreenShare = () => {
    if (screenSharing) stopScreenShare();
    else startScreenShare();
  };

  const leaveRoom = () => {
    socket.emit("leave-room", { roomCode: roomId });
    peersRef.current.forEach(({ peer }) => peer.destroy());
    peersRef.current = [];
    setPeers([]);
    if (localStream) localStream.getTracks().forEach((track) => track.stop());
    if (screenStream) screenStream.getTracks().forEach((track) => track.stop());
    socket.disconnect();
  };

  const changeName = (newName) => {
    setMyName(newName);
    socket.emit("change-name", newName);
  };

  return (
    <CallContext.Provider
      value={{
        peers,
        localVideoRef,
        localStream,
        screenStream,
        toggleAudio,
        toggleVideo,
        toggleScreenShare,
        leaveRoom,
        audioEnabled,
        videoEnabled,
        screenSharing,
        myName,
        changeName,
      }}
    >
      {children}
    </CallContext.Provider>
  );
};