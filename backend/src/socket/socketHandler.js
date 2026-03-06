import RandomNameService from "../services/RandomName.js";
import Room from "../models/Room.js";

// Lưu trữ các timer cho từng phòng
const roomTimers = new Map(); // key: roomCode, value: { endTimer, expireTimer }

export default function socketHandler(io) {
  io.on("connection", (socket) => {
    console.log("User connected", socket.id);

    // Khởi tạo trạng thái media mặc định
    socket.data.audioEnabled = true;
    socket.data.videoEnabled = true;
    socket.data.screenSharing = false;

    socket.on("join-room", async ({ roomCode }) => {
      // Thử tăng participants, nếu thất bại (phòng đầy hoặc không active) thì từ chối
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

      // Gửi trạng thái media hiện tại của tất cả user trong phòng cho người mới
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

      // Nếu phòng đang có timer chờ đóng thì hủy timer
      const timers = roomTimers.get(roomCode);
      if (timers) {
        clearTimeout(timers.endTimer);
        clearTimeout(timers.expireTimer);
        roomTimers.delete(roomCode);
        console.log(`Room ${roomCode}: cancelled expiration timers (user joined)`);
      }
    });

    socket.on("sending-signal", ({ userToSignal, signal }) => {
      io.to(userToSignal).emit("receiving-signal", {
        id: socket.id,
        signal
      });
    });

    socket.on("returning-signal", ({ userToSignal, signal }) => {
      io.to(userToSignal).emit("receiving-signal", {
        id: socket.id,
        signal
      });
    });

    socket.on("media-state-change", (data) => {
      // Cập nhật trạng thái trên server
      socket.data.audioEnabled = data.audioEnabled;
      socket.data.videoEnabled = data.videoEnabled;

      // Broadcast cho người khác trong phòng (không gửi lại cho chính mình)
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

    // Screen share events
    socket.on("screen-share-start", () => {
      socket.data.screenSharing = true;
      socket.to(socket.data.roomCode).emit("peer-screen-share-start", socket.id);
    });

    socket.on("screen-share-stop", () => {
      socket.data.screenSharing = false;
      socket.to(socket.data.roomCode).emit("peer-screen-share-stop", socket.id);
    });

    socket.on("disconnect", async () => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return;

      socket.to(roomCode).emit("user-left", socket.id);

      // Giảm số người tham gia và lấy số mới
      const newCount = await Room.decrementParticipants(roomCode);
      console.log(`Room ${roomCode} participants left: ${newCount}`);

      // Nếu không còn ai trong phòng, lên lịch đóng phòng
      if (newCount === 0) {
        // Kiểm tra xem đã có timer cho phòng này chưa (tránh trùng lặp)
        if (roomTimers.has(roomCode)) {
          const old = roomTimers.get(roomCode);
          clearTimeout(old.endTimer);
          clearTimeout(old.expireTimer);
        }

        // Timer 1: sau 10 giây chuyển sang ENDED
        const endTimer = setTimeout(async () => {
          try {
            const affected = await Room.endRoom(roomCode);
            if (affected > 0) {
              console.log(`Room ${roomCode} ended after inactivity`);

              // Timer 2: sau 10 giây nữa chuyển sang EXPIRED
              const expireTimer = setTimeout(async () => {
                const expired = await Room.expireRoom(roomCode);
                if (expired > 0) {
                  console.log(`Room ${roomCode} expired`);
                }
                roomTimers.delete(roomCode);
              }, 10000);

              // Lưu timer expire vào map
              const timers = roomTimers.get(roomCode) || {};
              timers.expireTimer = expireTimer;
              roomTimers.set(roomCode, timers);
            } else {
              // Phòng có thể đã được kết thúc trước đó (do API), xóa khỏi map
              roomTimers.delete(roomCode);
            }
          } catch (err) {
            console.error(`Error ending room ${roomCode}:`, err);
            roomTimers.delete(roomCode);
          }
        }, 10000);

        roomTimers.set(roomCode, { endTimer });
      }
    });
  });
}