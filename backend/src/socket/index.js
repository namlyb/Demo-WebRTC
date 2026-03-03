import Room from "../models/Room.js";
import RandomNameService from "../services/RandomName.js";

const initSocket = (io) => {
  io.on("connection", (socket) => {

    socket.on("join-room", async ({ roomCode }) => {
      const displayName = RandomNameService.generate();
      socket.data.roomCode = roomCode;
      socket.data.displayName = displayName;

      socket.join(roomCode);

      const clients = [...io.sockets.adapter.rooms.get(roomCode) || []];

      const users = clients
        .filter(id => id !== socket.id)
        .map(id => {
          const s = io.sockets.sockets.get(id);
          return {
            id,
            name: s?.data?.displayName || "Guest"
          };
        });

      socket.emit("all-users", users);

      socket.to(roomCode).emit("user-joined", {
        id: socket.id,
        name: displayName
      });
    });

    socket.on("leave-room", async ({ roomCode }) => {
      if (roomCode && socket.data.roomCode === roomCode) {
        socket.leave(roomCode);
        socket.to(roomCode).emit("user-left", socket.id);

        try {
          await Room.decrementParticipants(roomCode);
        } catch (err) {
          console.error("Lỗi giảm participants khi leave:", err);
        }

        socket.data.roomCode = null;
      }
    });

    socket.on("offer", ({ target, offer }) => {
      io.to(target).emit("offer", { sender: socket.id, offer });
    });

    socket.on("answer", ({ target, answer }) => {
      io.to(target).emit("answer", { sender: socket.id, answer });
    });

    socket.on("ice-candidate", ({ target, candidate }) => {
      io.to(target).emit("ice-candidate", { sender: socket.id, candidate });
    });

    socket.on("disconnecting", () => {
      socket.rooms.forEach(room => {
        socket.to(room).emit("user-left", socket.id);
      });
    });

    socket.on("disconnect", async () => {
      const roomCode = socket.data.roomCode;
      if (roomCode) {
        try {
          await Room.decrementParticipants(roomCode);
        } catch (err) {
          console.error("Lỗi giảm participants khi disconnect:", err);
        }
      }
    });
  });
};

export default initSocket;