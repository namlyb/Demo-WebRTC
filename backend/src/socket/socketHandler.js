import RandomNameService from "../services/RandomName.js";
import Room from "../models/Room.js";
import { getOrCreateRouter, getRoomData, rooms } from "../services/mediasoup.js";
import { getIceServers } from "../services/xirsys.js";

const ANNOUNCED_IP = process.env.ANNOUNCED_IP || '10.122.146.60';

// Global ICE servers (STUN/TURN) sẽ được load khi server start
let globalIceServers = null;

const roomTimers = new Map();

/**
 * Khởi tạo ICE servers (gọi khi server start)
 */
export async function initIceServers() {
  try {
    const iceServers = await getIceServers();
    if (iceServers && iceServers.length) {
      globalIceServers = iceServers;
      console.log('✅ ICE servers initialized from Xirsys');
    } else {
      throw new Error('No ICE servers from Xirsys');
    }
  } catch (err) {
    console.warn('⚠️ Xirsys failed, using fallback ICE servers');
    globalIceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ];
  }
}

export default function socketHandler(io) {
  io.on("connection", (socket) => {
    console.log("🔌 User connected", socket.id);

    socket.data.audioEnabled = true;
    socket.data.videoEnabled = true;
    socket.data.screenSharing = false;

    // --- JOIN ROOM ---
    socket.on("join-room", async ({ roomCode }) => {
      const newCount = await Room.incrementParticipants(roomCode);
      if (newCount === 0) {
        socket.emit("error", "Cannot join room: full or inactive");
        socket.disconnect();
        return;
      }

      const name = RandomNameService.generate();
      socket.data.roomCode = roomCode;
      socket.data.name = name;
      socket.join(roomCode);

      socket.emit("your-name", name);

      const clients = [...(io.sockets.adapter.rooms.get(roomCode) || [])];
      const users = clients
        .filter(id => id !== socket.id)
        .map(id => {
          const s = io.sockets.sockets.get(id);
          return {
            id,
            name: s?.data?.name,
            screenSharing: s?.data?.screenSharing || false
          };
        });
      socket.emit("all-users", users);

      const mediaStates = clients
        .filter(id => id !== socket.id)
        .map(id => {
          const s = io.sockets.sockets.get(id);
          return {
            userId: id,
            audioEnabled: s?.data?.audioEnabled ?? true,
            videoEnabled: s?.data?.videoEnabled ?? true
          };
        });
      socket.emit("initial-media-states", mediaStates);

      socket.to(roomCode).emit("user-joined", {
        id: socket.id,
        name,
        screenSharing: socket.data.screenSharing
      });

      // Huỷ timer nếu có
      const timers = roomTimers.get(roomCode);
      if (timers) {
        clearTimeout(timers.endTimer);
        clearTimeout(timers.expireTimer);
        roomTimers.delete(roomCode);
        console.log(`⏱️ Room ${roomCode}: cancelled expiration timers (user joined)`);
      }

      // --- Gửi thông tin mediasoup router và danh sách producer hiện có ---
      try {
        const router = await getOrCreateRouter(roomCode);
        socket.emit("router-rtp-capabilities", router.rtpCapabilities);

        const roomData = getRoomData(roomCode);
        if (roomData) {
          const existingProducers = [];
          for (const [producerId, entry] of roomData.producers) {
            if (entry.socketId !== socket.id) {
              existingProducers.push({
                producerId,
                kind: entry.kind,
                peerId: entry.socketId,
                appData: entry.appData,
              });
            }
          }
          if (existingProducers.length > 0) {
            socket.emit("existing-producers", existingProducers);
          }
        }
      } catch (err) {
        console.error("❌ Error creating router:", err);
        socket.emit("error", "Failed to initialize media router");
      }
    });

    // --- Tạo WebRTC transport ---
    socket.on("create-transport", async ({ direction }, callback) => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return callback({ error: "Not in a room" });

      try {
        const router = await getOrCreateRouter(roomCode);
        let transport;

        // Chỉ dùng 0.0.0.0 với announcedIp là IP LAN
        const listenIps = [
          { ip: '0.0.0.0', announcedIp: ANNOUNCED_IP }
        ];

        if (direction === 'send') {
          transport = await router.createWebRtcTransport({
            listenIps,
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
          });
          socket.data.sendTransport = transport;
        } else {
          transport = await router.createWebRtcTransport({
            listenIps,
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
          });
          socket.data.recvTransport = transport;
        }

        console.log(`🚀 Created ${direction} transport for room ${roomCode}`);
        console.log(`   Transport ID: ${transport.id}`);
        console.log(`   Announced IPs: ${listenIps.map(ip => ip.announcedIp).join(', ')}`);
        console.log(`   Initial ICE candidates:`, transport.iceCandidates);

        // ========== SỬA: Gửi tất cả ICE candidate, chỉ lọc loopback & link-local ==========
        transport.on('icecandidate', (candidate) => {
          if (candidate && candidate.candidate) {
            // Bỏ qua candidate localhost (127.0.0.1, ::1) và link-local IPv6 (fe80::)
            const isLoopback = candidate.candidate.includes('127.0.0.1') || candidate.candidate.includes('::1');
            const isLinkLocalIPv6 = candidate.candidate.includes('fe80::');
            if (!isLoopback && !isLinkLocalIPv6) {
              console.log(`   Server ICE candidate (${direction}): ${candidate.candidate}`);
              socket.emit('ice-candidate', {
                transportId: transport.id,
                candidate,
                direction
              });
            } else {
              console.log(`   Ignored loopback/link-local ICE candidate: ${candidate.candidate}`);
            }
          }
        });

        transport.on('dtlsstatechange', (dtlsState) => {
          console.log(`🔐 ${direction} transport DTLS state: ${dtlsState}`);
          if (dtlsState === 'closed') transport.close();
        });

        callback({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
          iceServers: globalIceServers || [{ urls: 'stun:stun.l.google.com:19302' }],
        });
      } catch (err) {
        console.error("❌ Error creating transport:", err);
        callback({ error: err.message });
      }
    });

    // --- Kết nối transport ---
    socket.on("connect-transport", async ({ transportId, dtlsParameters, direction }, callback) => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return callback({ error: "Not in a room" });

      try {
        const transport = direction === 'send' ? socket.data.sendTransport : socket.data.recvTransport;
        if (!transport || transport.id !== transportId) {
          return callback({ error: "Transport not found" });
        }

        await transport.connect({ dtlsParameters });
        console.log(`✅ ${direction} transport connected successfully`);
        callback({});
      } catch (err) {
        console.error(`❌ Error connecting ${direction} transport:`, err);
        callback({ error: err.message });
      }
    });

    // --- Nhận ICE candidate từ client và thêm vào transport ---
    socket.on("ice-candidate", async ({ transportId, candidate, direction }) => {
      const transport = direction === 'send' ? socket.data.sendTransport : socket.data.recvTransport;
      if (transport && transport.id === transportId) {
        try {
          await transport.addIceCandidate(candidate);
          console.log(`✅ Added client ICE candidate to ${direction} transport`);
        } catch (err) {
          console.warn(`⚠️ Failed to add ICE candidate: ${err.message}`);
        }
      } else {
        console.warn(`⚠️ Transport not found for candidate (${direction}, id=${transportId})`);
      }
    });

    // --- Producer ---
    socket.on("produce", async ({ kind, rtpParameters, appData }, callback) => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return callback({ error: "Not in a room" });

      try {
        const transport = socket.data.sendTransport;
        if (!transport) return callback({ error: "Send transport not created" });

        const producer = await transport.produce({ kind, rtpParameters, appData });
        const roomData = getRoomData(roomCode);
        if (!roomData) return callback({ error: "Room data not found" });
        roomData.producers.set(producer.id, { producer, socketId: socket.id, kind, appData });

        console.log(`📤 Producer created: ${producer.id} (${kind}) by socket ${socket.id}`);

        socket.to(roomCode).emit("new-producer", {
          producerId: producer.id,
          kind,
          peerId: socket.id,
          appData,
        });

        callback({ id: producer.id });
      } catch (err) {
        console.error("❌ Error producing:", err);
        callback({ error: err.message });
      }
    });

    // --- Consumer ---
    socket.on("consume", async ({ producerId, rtpCapabilities }, callback) => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return callback({ error: "Not in a room" });

      try {
        const roomData = getRoomData(roomCode);
        if (!roomData) return callback({ error: "Room data not found" });

        const producerEntry = roomData.producers.get(producerId);
        if (!producerEntry) return callback({ error: "Producer not found" });

        const producer = producerEntry.producer;
        const router = roomData.router;

        const transport = socket.data.recvTransport;
        if (!transport) return callback({ error: "Receive transport not created" });

        const consumer = await transport.consume({
          producerId,
          rtpCapabilities,
          paused: false,
        });

        roomData.consumers.set(consumer.id, { consumer, socketId: socket.id, producerId });

        console.log(`📥 Consumer created: ${consumer.id} for producer ${producerId} by socket ${socket.id}`);

        consumer.on('transportclose', () => {
          roomData.consumers.delete(consumer.id);
          console.log(`🚫 Consumer ${consumer.id} closed due to transport close`);
        });

        callback({
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        });
      } catch (err) {
        console.error("❌ Error consuming:", err);
        callback({ error: err.message });
      }
    });

    // --- Resume consumer ---
    socket.on("resume-consumer", async ({ consumerId }, callback) => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return callback({ error: "Not in a room" });

      try {
        const roomData = getRoomData(roomCode);
        if (!roomData) return callback({ error: "Room data not found" });

        const consumerEntry = roomData.consumers.get(consumerId);
        if (!consumerEntry) return callback({ error: "Consumer not found" });

        await consumerEntry.consumer.resume();
        console.log(`▶️ Consumer ${consumerId} resumed`);
        callback({});
      } catch (err) {
        console.error("❌ Error resuming consumer:", err);
        callback({ error: err.message });
      }
    });

    // --- Media state change ---
    socket.on("media-state-change", (data) => {
      socket.data.audioEnabled = data.audioEnabled;
      socket.data.videoEnabled = data.videoEnabled;
      socket.to(socket.data.roomCode).emit("peer-media-state", {
        userId: socket.id,
        ...data
      });
    });

    socket.on("change-name", (newName) => {
      socket.data.name = newName;
      socket.to(socket.data.roomCode).emit("peer-name-changed", {
        userId: socket.id,
        name: newName
      });
    });

    socket.on("screen-share-start", () => {
      socket.data.screenSharing = true;
      socket.to(socket.data.roomCode).emit("peer-screen-share-start", socket.id);
    });

    socket.on("screen-share-stop", () => {
      socket.data.screenSharing = false;
      socket.to(socket.data.roomCode).emit("peer-screen-share-stop", socket.id);
    });

    // --- Disconnect ---
    socket.on("disconnect", async () => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return;

      console.log(`🔌 User disconnected: ${socket.id} from room ${roomCode}`);
      socket.to(roomCode).emit("user-left", socket.id);

      const roomData = getRoomData(roomCode);
      if (roomData) {
        for (const [producerId, entry] of roomData.producers) {
          if (entry.socketId === socket.id) {
            entry.producer.close();
            roomData.producers.delete(producerId);
            socket.to(roomCode).emit("producer-closed", { producerId });
            console.log(`🗑️ Producer ${producerId} closed`);
          }
        }
        for (const [consumerId, entry] of roomData.consumers) {
          if (entry.socketId === socket.id) {
            entry.consumer.close();
            roomData.consumers.delete(consumerId);
            console.log(`🗑️ Consumer ${consumerId} closed`);
          }
        }
      }

      const newCount = await Room.decrementParticipants(roomCode);
      if (newCount === 0) {
        if (roomTimers.has(roomCode)) {
          const old = roomTimers.get(roomCode);
          clearTimeout(old.endTimer);
          clearTimeout(old.expireTimer);
        }
        const endTimer = setTimeout(async () => {
          try {
            const affected = await Room.endRoom(roomCode);
            if (affected > 0) {
              console.log(`⏱️ Room ${roomCode} ended after inactivity`);
              const roomData = getRoomData(roomCode);
              if (roomData) {
                roomData.router.close();
                rooms.delete(roomCode);
              }
              const expireTimer = setTimeout(async () => {
                const expired = await Room.expireRoom(roomCode);
                if (expired > 0) {
                  console.log(`⏱️ Room ${roomCode} expired`);
                }
                roomTimers.delete(roomCode);
              }, 10000);
              const timers = roomTimers.get(roomCode) || {};
              timers.expireTimer = expireTimer;
              roomTimers.set(roomCode, timers);
            } else {
              roomTimers.delete(roomCode);
            }
          } catch (err) {
            console.error(`❌ Error ending room ${roomCode}:`, err);
            roomTimers.delete(roomCode);
          }
        }, 10000);
        roomTimers.set(roomCode, { endTimer });
      }
    });
  });
}