import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
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
  const audioEnabledRef = useRef(audioEnabled);
  const videoEnabledRef = useRef(videoEnabled);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  useEffect(() => {
    videoEnabledRef.current = videoEnabled;
  }, [videoEnabled]);

  // Socket connection
  useEffect(() => {
    const newSocket = io({ transports: ["websocket"] });
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
      console.log(`[peer-media-state] from ${userId}: audio=${audioEnabled}, video=${videoEnabled}`);
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
  const replaceVideoTrackForAll = useCallback((newTrack) => {
    console.log(`replaceVideoTrackForAll: newTrack id=${newTrack?.id}, enabled=${newTrack?.enabled}`);
    peersRef.current.forEach(({ peer, id }) => {
      const sender = peer._pc?.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        console.log(`Replacing track for peer ${id}, current track id=${sender.track?.id}`);
        sender.replaceTrack(newTrack).catch(err => console.error('replaceTrack error:', err));
      } else {
        console.warn(`No video sender found for peer ${id}`);
      }
    });
  }, []);

  // Refresh audio track for all peers
  const refreshAudioTrackForAll = useCallback(() => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;
    peersRef.current.forEach(({ peer, id }) => {
      const sender = peer._pc?.getSenders().find(s => s.track?.kind === 'audio');
      if (sender) {
        console.log(`Refreshing audio track for peer ${id}`);
        sender.replaceTrack(audioTrack).catch(err => 
          console.error('refresh audio replaceTrack error:', err)
        );
      } else {
        console.warn(`No audio sender for peer ${id} yet`);
      }
    });
  }, [localStream]);

  // Refresh video track for all peers
  const refreshVideoTrackForAll = useCallback(() => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;
    peersRef.current.forEach(({ peer, id }) => {
      const sender = peer._pc?.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        console.log(`Refreshing video track for peer ${id}`);
        sender.replaceTrack(videoTrack).catch(err => 
          console.error('refresh video replaceTrack error:', err)
        );
      } else {
        console.warn(`No video sender for peer ${id} yet`);
      }
    });
  }, [localStream]);

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
      console.log(`Received stream from ${userToSignal}`, remoteStream.id,
        remoteStream.getTracks().map(t => `${t.kind}:${t.enabled}`));
      peer.remoteStream = remoteStream;
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
      console.log(`Received stream from ${incomingID}`, remoteStream.id,
        remoteStream.getTracks().map(t => `${t.kind}:${t.enabled}`));
      peer.remoteStream = remoteStream;
      setPeers(prev => prev.map(p => p.id === incomingID ? { ...p } : p));
    });
    return peer;
  };

  // Toggle Audio
  const toggleAudio = useCallback(() => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;
    const newState = !audioTrack.enabled;
    audioTrack.enabled = newState;
    setAudioEnabled(newState);
    audioEnabledRef.current = newState;

    const videoTrack = localStream.getVideoTracks()[0];
    const currentVideoState = videoTrack ? videoTrack.enabled : videoEnabledRef.current;

    console.log(`[toggleAudio] audio: ${newState ? 'ON' : 'OFF'}, video: ${currentVideoState ? 'ON' : 'OFF'}`);
    console.log('Emitting media-state-change (audio):', { audioEnabled: newState, videoEnabled: currentVideoState });
    socket.emit("media-state-change", { 
      audioEnabled: newState, 
      videoEnabled: currentVideoState 
    });

    // Luôn refresh audio track khi bật hoặc tắt để đảm bảo sender hoạt động
    refreshAudioTrackForAll();
  }, [localStream, socket, refreshAudioTrackForAll]);

  // Toggle Video
  const toggleVideo = useCallback(() => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;
    const newState = !videoTrack.enabled;
    videoTrack.enabled = newState;
    setVideoEnabled(newState);
    videoEnabledRef.current = newState;

    // Lấy trạng thái audio hiện tại từ track (đã được cập nhật đồng bộ)
    const audioTrack = localStream.getAudioTracks()[0];
    const currentAudioState = audioTrack ? audioTrack.enabled : audioEnabledRef.current;

    console.log(`[toggleVideo] video: ${newState ? 'ON' : 'OFF'}, audio: ${currentAudioState ? 'ON' : 'OFF'}, videoTrack.id=${videoTrack.id}`);
    console.log('Emitting media-state-change (video):', { audioEnabled: currentAudioState, videoEnabled: newState });
    socket.emit("media-state-change", { 
      audioEnabled: currentAudioState, 
      videoEnabled: newState 
    });

    if (newState) {
      // Bật video: refresh video (nếu không share màn hình) và audio
      if (!screenSharing) {
        console.log('Calling refreshVideoTrackForAll');
        refreshVideoTrackForAll();
      }
      refreshAudioTrackForAll();
    } else {
      // Tắt video: chỉ refresh audio để duy trì âm thanh
      console.log('Tắt video, refresh audio để giữ âm thanh');
      refreshAudioTrackForAll();
    }
  }, [localStream, socket, screenSharing, refreshVideoTrackForAll, refreshAudioTrackForAll]);

  // Screen Share
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
    console.log('stopScreenShare: cameraTrack id=', cameraTrack.id, 'enabled=', cameraTrack.enabled);

    replaceVideoTrackForAll(cameraTrack);

    screenStream.getTracks().forEach(track => track.stop());
    setScreenStream(null);
    setScreenSharing(false);
  };

  const toggleScreenShare = useCallback(() => {
    if (screenSharing) stopScreenShare();
    else startScreenShare();
  }, [screenSharing]);

  const leaveRoom = useCallback(() => {
    socket.emit("leave-room", { roomCode: roomId });
    peersRef.current.forEach(({ peer }) => peer.destroy());
    peersRef.current = [];
    setPeers([]);
    if (localStream) localStream.getTracks().forEach((track) => track.stop());
    if (screenStream) screenStream.getTracks().forEach((track) => track.stop());
    socket.disconnect();
  }, [socket, roomId, localStream, screenStream]);

  const changeName = useCallback((newName) => {
    setMyName(newName);
    socket.emit("change-name", newName);
  }, [socket]);

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