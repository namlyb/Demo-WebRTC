import RandomNameService from "../services/RandomName.js";
import Room from "../models/Room.js";

export default function socketHandler(io) {
  io.on("connection", (socket) => {
    console.log("User connected", socket.id);

    // Khởi tạo trạng thái media mặc định
    socket.data.audioEnabled = true;
    socket.data.videoEnabled = true;

    socket.on("join-room", async ({ roomCode }) => {
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
            name: s?.data?.name
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
        name
      });
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

    socket.on("disconnect", async () => {
      const room = socket.data.roomCode;
      if (room) {
        socket.to(room).emit("user-left", socket.id);
        await Room.decrementParticipants(room);
      }
    });
  });
}