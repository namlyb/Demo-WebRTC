import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";

const CallContext = createContext();

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) throw new Error("useCall must be used within CallProvider");
  return context;
};

export const CallProvider = ({ children, roomId }) => {
  const [socket, setSocket] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState([]);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [myName, setMyName] = useState("");

  const deviceRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const producersRef = useRef({ audio: null, video: null });
  const consumersMapRef = useRef(new Map());
  const pendingProducersRef = useRef([]);

  // --- Helper log ICE events với chi tiết hơn ---
  const addTransportLogging = (transport, name) => {
    transport.on('icecandidate', (candidate) => {
      if (candidate) {
        console.log(`🔹 ${name} ICE candidate:`, candidate.candidate);
        if (candidate.candidate) {
          const parts = candidate.candidate.split(' ');
          const type = parts[7];
          const protocol = parts[2];
          const ip = parts[4];
          const port = parts[5];
          console.log(`   ➡️ type: ${type}, protocol: ${protocol}, ip: ${ip}, port: ${port}`);
        }
      } else {
        console.log(`🔹 ${name} ICE gathering complete`);
      }
    });
    transport.on('icecandidateerror', (error) => {
      console.error(`❌ ${name} ICE candidate error:`, error.errorText, error.address, error.port);
    });
    transport.on('icegatheringstatechange', (state) => {
      console.log(`🔹 ${name} ICE gathering state:`, state);
      if (state === 'gathering') {
        console.log('   Current ICE candidates:', transport.iceCandidates);
      }
    });
    transport.on('iceconnectionstatechange', (state) => {
      console.log(`🔹 ${name} ICE connection state:`, state);
      if (state === 'failed') {
        console.error('❌ ICE connection failed – kiểm tra firewall/STUN/TURN');
        console.log('ICE servers used:', transport.iceServers);
        console.log('Local candidates:', transport.iceCandidates);
      }
      if (state === 'connected') {
        console.log('✅ ICE connected successfully!');
      }
    });
    transport.on('connectionstatechange', (state) => {
      console.log(`🔹 ${name} connection state:`, state);
    });
  };

  // --- Khởi tạo socket ---
  useEffect(() => {
    const s = io({ transports: ["websocket"] });
    setSocket(s);
    return () => s.disconnect();
  }, []);

  // --- Lấy local media ---
  useEffect(() => {
    const initLocalStream = async () => {
      try {
        if (!window.isSecureContext) {
          console.error('❌ Not a secure context (HTTPS required)');
          alert('Trang web không được truy cập qua HTTPS. Vui lòng dùng HTTPS.');
          return;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          console.error('❌ navigator.mediaDevices not supported', navigator.mediaDevices);
          const isHttps = window.location.protocol === 'https:';
          const isLocalhost = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
          if (!isHttps && !isLocalhost) {
            alert('Truy cập bằng HTTP từ xa không được phép. Hãy dùng HTTPS.');
          } else {
            alert('Trình duyệt không hỗ trợ camera/microphone. Hãy dùng Chrome hoặc Firefox mới nhất.');
          }
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: true,
        });
        console.log('✅ Local stream obtained', stream.id, 
          stream.getTracks().map(t => `${t.kind}:${t.enabled}`));
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) videoTrack.enabled = false; // tắt video mặc định
        setLocalStream(stream);
      } catch (err) {
        console.error('❌ getUserMedia error', err.name, err.message);
        if (err.name === 'NotAllowedError') {
          alert('Bạn đã từ chối quyền truy cập camera/micro. Vui lòng cấp quyền và thử lại.');
        } else if (err.name === 'NotFoundError') {
          alert('Không tìm thấy camera/micro trên thiết bị.');
        } else if (err.name === 'NotReadableError') {
          alert('Camera/micro đang được ứng dụng khác sử dụng.');
        } else {
          alert('Không thể truy cập camera/micro: ' + err.message);
        }
      }
    };
    initLocalStream();
  }, []);

  // --- Join room khi sẵn sàng ---
  useEffect(() => {
    if (!socket || !roomId || !localStream) return;
    const joinRoom = () => socket.emit("join-room", { roomCode: roomId });
    if (socket.connected) joinRoom();
    socket.on("connect", joinRoom);
    return () => socket.off("connect", joinRoom);
  }, [socket, roomId, localStream]);

  // --- Helper: thêm track vào peer stream ---
  const addTrackToPeer = useCallback((peerId, track, kind) => {
    setPeers(prev => {
      let peer = prev.find(p => p.id === peerId);
      if (!peer) {
        peer = { 
          id: peerId, 
          name: 'Unknown', 
          stream: new MediaStream(), 
          audioEnabled: true, 
          videoEnabled: true 
        };
        peer.stream.addTrack(track);
        console.log(`➕ New peer ${peerId} created with ${kind} track`);
        console.log(`   Stream now has tracks:`, peer.stream.getTracks().map(t => `${t.kind}:${t.enabled}`));
        return [...prev, peer];
      }
      if (!peer.stream) peer.stream = new MediaStream();
      const existingTrack = peer.stream.getTracks().find(t => t.kind === kind);
      if (existingTrack) {
        console.log(`⚠️ Replacing existing ${kind} track for peer ${peerId}`);
        peer.stream.removeTrack(existingTrack);
        existingTrack.stop();
      }
      peer.stream.addTrack(track);
      console.log(`➕ Added ${kind} track to peer ${peerId}`);
      console.log(`   Stream now has tracks:`, peer.stream.getTracks().map(t => `${t.kind}:${t.enabled}`));
      return [...prev];
    });
  }, []);

  // --- Helper: xoá track khỏi peer stream ---
  const removeTrackFromPeer = useCallback((peerId, kind) => {
    setPeers(prev => {
      const peer = prev.find(p => p.id === peerId);
      if (!peer || !peer.stream) return prev;
      const track = peer.stream.getTracks().find(t => t.kind === kind);
      if (track) {
        track.stop();
        peer.stream.removeTrack(track);
        console.log(`➖ Removed ${kind} track from peer ${peerId}`);
        console.log(`   Stream now has tracks:`, peer.stream.getTracks().map(t => `${t.kind}:${t.enabled}`));
      }
      return [...prev];
    });
  }, []);

  // --- Hàm consume một producer ---
  const consumeProducer = useCallback(async (producerId, kind, peerId, appData) => {
    if (!deviceRef.current || !recvTransportRef.current) {
      console.warn("⏳ Receive transport not ready yet, cannot consume, pushing to pending");
      pendingProducersRef.current.push({ producerId, kind, peerId, appData });
      return;
    }
    if (consumersMapRef.current.has(producerId)) return;

    const rtpCapabilities = deviceRef.current.rtpCapabilities;
    socket.emit("consume", { producerId, rtpCapabilities }, async (response) => {
      if (response.error) {
        console.error("❌ Error consuming:", response.error);
        return;
      }
      const { id, producerId, kind, rtpParameters } = response;

      try {
        console.log(`🔄 Creating consumer for producer ${producerId} (${kind})`);
        const consumer = await recvTransportRef.current.consume({
          id,
          producerId,
          kind,
          rtpParameters,
        });

        consumersMapRef.current.set(producerId, { consumer, peerId, kind });

        // Thêm track vào peer stream
        addTrackToPeer(peerId, consumer.track, kind);

        // Resume consumer
        socket.emit("resume-consumer", { consumerId: id }, (res) => {
          if (res?.error) console.error("❌ Resume consumer error:", res.error);
          else console.log(`▶️ Consumer ${id} resumed`);
        });
      } catch (err) {
        console.error("❌ Error creating consumer:", err);
      }
    });
  }, [socket, addTrackToPeer]);

  // --- Hàm tạo video producer ---
  const createVideoProducer = useCallback(async () => {
    if (!localStream) {
      console.log('⏸️ Cannot create video producer: localStream not ready');
      return;
    }
    const track = localStream.getVideoTracks()[0];
    if (!track) {
      console.log('⏸️ Cannot create video producer: no video track');
      return;
    }
    if (!sendTransportRef.current) {
      console.log('⏸️ Cannot create video producer: sendTransport not ready');
      return;
    }
    if (producersRef.current.video) {
      console.log('⏸️ Video producer already exists');
      return;
    }

    console.log('🎥 Creating video producer...');
    try {
      const videoProducer = await sendTransportRef.current.produce({ track });
      producersRef.current.video = videoProducer;
      console.log('✅ Video producer created with id:', videoProducer.id);
    } catch (err) {
      console.error('❌ Error creating video producer:', err);
    }
  }, [localStream]);

  // --- Xử lý router capabilities và thiết lập mediasoup ---
  useEffect(() => {
    if (!socket || !roomId) return;

    const onRouterCapabilities = async (rtpCapabilities) => {
      try {
        console.log('📦 Received router RTP capabilities');
        const device = new mediasoupClient.Device();
        await device.load({ routerRtpCapabilities: rtpCapabilities });
        deviceRef.current = device;
        console.log('✅ Mediasoup device loaded');

        // Tạo send transport
        socket.emit("create-transport", { direction: "send" }, async (transportParams) => {
          if (transportParams.error) {
            console.error("❌ Error creating send transport:", transportParams.error);
            return;
          }
          console.log("📤 Send transport params received, iceServers:", transportParams.iceServers);
          const sendTransport = device.createSendTransport(transportParams);
          sendTransportRef.current = sendTransport;
          console.log('Send transport created with id:', sendTransport.id);
          console.log('ICE servers for send transport:', sendTransport.iceServers);

          sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
            console.log("🔌 Send transport connect event");
            socket.emit("connect-transport", {
              transportId: sendTransport.id,
              dtlsParameters,
              direction: "send",
            }, (response) => {
              if (response.error) {
                console.error("❌ Send transport connect error:", response.error);
                errback(response.error);
              } else {
                console.log("✅ Send transport connected successfully");
                callback();
              }
            });
          });

          sendTransport.on("produce", ({ kind, rtpParameters, appData }, callback, errback) => {
            console.log(`🎥 Send transport produce event for ${kind}`);
            socket.emit("produce", { kind, rtpParameters, appData }, (response) => {
              if (response.error) errback(response.error);
              else {
                console.log(`✅ Producer created with id: ${response.id}`);
                callback({ id: response.id });
              }
            });
          });

          addTransportLogging(sendTransport, 'Send');

          // Tạo audio producer ngay lập tức
          if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack && !producersRef.current.audio) {
              console.log('🎤 Producing audio track...');
              const audioProducer = await sendTransport.produce({
                track: audioTrack,
                codecOptions: { opusStereo: 1 },
                appData: { kind: 'audio' }
              });
              producersRef.current.audio = audioProducer;
              console.log('✅ Audio producer created');
            }

            // Nếu videoEnabled = true, tự động tạo video producer ngay
            if (videoEnabled && !producersRef.current.video) {
              await createVideoProducer();
            }
          }
        });

        // Tạo receive transport
        socket.emit("create-transport", { direction: "recv" }, async (recvParams) => {
          if (recvParams.error) {
            console.error("❌ Error creating recv transport:", recvParams.error);
            return;
          }
          console.log("📥 Recv transport params received, iceServers:", recvParams.iceServers);
          const recvTransport = device.createRecvTransport(recvParams);
          recvTransportRef.current = recvTransport;
          console.log('Recv transport created with id:', recvTransport.id);
          console.log('ICE servers for recv transport:', recvTransport.iceServers);

          recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
            console.log("🔌 Recv transport connect event");
            socket.emit("connect-transport", {
              transportId: recvTransport.id,
              dtlsParameters,
              direction: "recv",
            }, (response) => {
              if (response.error) {
                console.error("❌ Recv transport connect error:", response.error);
                errback(response.error);
              } else {
                console.log("✅ Recv transport connected successfully");
                callback();
              }
            });
          });

          addTransportLogging(recvTransport, 'Recv');

          // Sau khi receive transport sẵn sàng, xử lý các producer đang chờ
          if (pendingProducersRef.current.length > 0) {
            console.log(`⚙️ Processing ${pendingProducersRef.current.length} pending producers`);
            pendingProducersRef.current.forEach(({ producerId, kind, peerId, appData }) => {
              consumeProducer(producerId, kind, peerId, appData);
            });
            pendingProducersRef.current = [];
          }
        });

      } catch (err) {
        console.error("❌ Error setting up mediasoup:", err);
      }
    };

    socket.on("router-rtp-capabilities", onRouterCapabilities);
    return () => {
      socket.off("router-rtp-capabilities", onRouterCapabilities);
    };
  }, [socket, roomId, localStream, videoEnabled, consumeProducer, createVideoProducer]);

  // --- Lắng nghe các sự kiện từ server ---
  useEffect(() => {
    if (!socket) return;

    socket.on("user-joined", ({ id, name }) => {
      setPeers(prev => {
        if (prev.some(p => p.id === id)) return prev;
        console.log(`👤 User joined: ${id} (${name})`);
        return [...prev, { id, name, stream: null, audioEnabled: true, videoEnabled: true }];
      });
    });

    socket.on("user-left", (id) => {
      console.log(`👤 User left: ${id}`);
      for (const [producerId, { consumer, peerId }] of consumersMapRef.current.entries()) {
        if (peerId === id) {
          consumer.close();
          consumersMapRef.current.delete(producerId);
        }
      }
      pendingProducersRef.current = pendingProducersRef.current.filter(p => p.peerId !== id);
      setPeers(prev => prev.filter(p => p.id !== id));
    });

    socket.on("new-producer", ({ producerId, kind, peerId, appData }) => {
      console.log(`🎥 New producer: ${producerId} kind=${kind} peer=${peerId}`);
      if (recvTransportRef.current) {
        consumeProducer(producerId, kind, peerId, appData);
      } else {
        pendingProducersRef.current.push({ producerId, kind, peerId, appData });
        console.log(`⏳ Producer pending (recv transport not ready)`);
      }
    });

    socket.on("existing-producers", (producers) => {
      console.log(`📦 Received ${producers.length} existing producers`);
      producers.forEach(({ producerId, kind, peerId, appData }) => {
        if (recvTransportRef.current) {
          consumeProducer(producerId, kind, peerId, appData);
        } else {
          pendingProducersRef.current.push({ producerId, kind, peerId, appData });
          console.log(`⏳ Existing producer pending (recv transport not ready)`);
        }
      });
    });

    socket.on("producer-closed", ({ producerId }) => {
      pendingProducersRef.current = pendingProducersRef.current.filter(p => p.producerId !== producerId);
      const entry = consumersMapRef.current.get(producerId);
      if (entry) {
        entry.consumer.close();
        consumersMapRef.current.delete(producerId);
        removeTrackFromPeer(entry.peerId, entry.kind);
        console.log(`❌ Producer closed: ${producerId}`);
      }
    });

    socket.on("peer-media-state", ({ userId, audioEnabled, videoEnabled }) => {
      setPeers(prev =>
        prev.map(p => (p.id === userId ? { ...p, audioEnabled, videoEnabled } : p))
      );
    });

    socket.on("peer-name-changed", ({ userId, name }) => {
      setPeers(prev => prev.map(p => (p.id === userId ? { ...p, name } : p)));
    });

    socket.on("all-users", (users) => {
      console.log("👥 All users in room:", users);
      setPeers(users.map(u => ({
        id: u.id,
        name: u.name,
        stream: null,
        audioEnabled: true,
        videoEnabled: true,
      })));
    });

    socket.on("initial-media-states", (states) => {
      setPeers(prev =>
        prev.map(p => {
          const state = states.find(s => s.userId === p.id);
          return state ? { ...p, audioEnabled: state.audioEnabled, videoEnabled: state.videoEnabled } : p;
        })
      );
    });

    socket.on("your-name", (name) => {
      console.log("👤 My name:", name);
      setMyName(name);
    });

    return () => {
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("new-producer");
      socket.off("existing-producers");
      socket.off("producer-closed");
      socket.off("peer-media-state");
      socket.off("peer-name-changed");
      socket.off("all-users");
      socket.off("initial-media-states");
      socket.off("your-name");
    };
  }, [socket, consumeProducer, removeTrackFromPeer]);

  // --- Toggle audio ---
  const toggleAudio = useCallback(() => {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (!track) return;
    const newState = !track.enabled;
    track.enabled = newState;
    setAudioEnabled(newState);
    socket.emit("media-state-change", { audioEnabled: newState, videoEnabled });
    if (producersRef.current.audio) {
      if (newState) producersRef.current.audio.resume();
      else producersRef.current.audio.pause();
    }
  }, [localStream, socket, videoEnabled]);

  // --- Toggle video ---
  const toggleVideo = useCallback(async () => {
    console.log('🎥 toggleVideo called, current enabled:', videoEnabled);
    if (!localStream) {
      console.log('⏸️ localStream not ready');
      return;
    }
    const track = localStream.getVideoTracks()[0];
    console.log('📹 video track exists?', !!track);
    if (!track) return;

    const newState = !track.enabled;
    track.enabled = newState;
    setVideoEnabled(newState);
    socket.emit("media-state-change", { audioEnabled, videoEnabled: newState });

    console.log('🔍 sendTransport exists?', !!sendTransportRef.current);
    console.log('🔍 existing video producer?', !!producersRef.current.video);

    if (producersRef.current.video) {
      // Đã có producer, chỉ pause/resume
      if (newState) {
        await producersRef.current.video.resume();
        console.log('▶️ Video producer resumed');
      } else {
        await producersRef.current.video.pause();
        console.log('⏸️ Video producer paused');
      }
    } else {
      // Chưa có producer, cần tạo mới nếu video được bật
      if (newState) {
        if (!sendTransportRef.current) {
          console.log('⏸️ sendTransport not ready, cannot create video producer');
          return;
        }
        try {
          console.log('🎥 Creating video producer...');
          const videoProducer = await sendTransportRef.current.produce({ track });
          producersRef.current.video = videoProducer;
          console.log('✅ Video producer created with id:', videoProducer.id);
        } catch (err) {
          console.error('❌ Error creating video producer:', err);
        }
      }
    }
  }, [localStream, socket, audioEnabled, videoEnabled]);

  // --- Đổi tên ---
  const changeName = useCallback((newName) => {
    setMyName(newName);
    socket.emit("change-name", newName);
  }, [socket]);

  // --- Rời phòng và dọn dẹp ---
  const leaveRoom = useCallback(() => {
    if (producersRef.current.audio) producersRef.current.audio.close();
    if (producersRef.current.video) producersRef.current.video.close();
    if (sendTransportRef.current) sendTransportRef.current.close();
    if (recvTransportRef.current) recvTransportRef.current.close();
    for (const { consumer } of consumersMapRef.current.values()) {
      consumer.close();
    }
    consumersMapRef.current.clear();
    pendingProducersRef.current = [];
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    socket.disconnect();
  }, [localStream, socket]);

  const value = {
    peers,
    localStream,
    toggleAudio,
    toggleVideo,
    leaveRoom,
    audioEnabled,
    videoEnabled,
    myName,
    changeName,
  };

  return (
    <CallContext.Provider value={value}>
      {children}
    </CallContext.Provider>
  );
};