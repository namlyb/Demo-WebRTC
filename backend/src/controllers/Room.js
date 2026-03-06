import bcrypt from "bcrypt";
import Room from "../models/Room.js";

class RoomController {
  static async createRoom(req, res) {
    try {
      const { roomCode, password, maxParticipants } = req.body;

      if (!roomCode) {
        return res.status(400).json({ message: "Room code is required" });
      }

      const existingRoom = await Room.findByCode(roomCode);
      if (existingRoom) {
        return res.status(400).json({ message: "Room already exists" });
      }

      let passwordHash = null;

      if (password) {
        passwordHash = await bcrypt.hash(password, 10);
      }

      const roomId = await Room.create({
        roomCode,
        passwordHash,
        maxParticipants,
      });

      return res.status(201).json({
        message: "Room created successfully",
        roomId,
      });

    } catch (error) {
      console.error("Create room error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }

  static async endRoom(req, res) {
    try {
      const { roomCode } = req.params;

      if (!roomCode) {
        return res.status(400).json({ message: "Room code is required" });
      }

      const affectedRows = await Room.endRoom(roomCode);

      if (affectedRows === 0) {
        return res.status(404).json({
          message: "Room not found or already ended",
        });
      }

      return res.json({
        message: "Room ended successfully",
      });

    } catch (error) {
      console.error("End room error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }

  static async joinRoom(req, res) {
    try {
      const { roomCode, password } = req.body;

      console.log('Join request:', { roomCode, password });

      const room = await Room.findByCode(roomCode);
      console.log('Room found:', room);

      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      if (room.status !== "ACTIVE") {
        return res.status(400).json({ message: "Room is not active" });
      }

      if (room.password_hash) {
        const isMatch = await bcrypt.compare(password || "", room.password_hash);
        if (!isMatch) {
          return res.status(401).json({ message: "Wrong password" });
        }
      }

      // Không tăng participants ở đây nữa – việc này sẽ do socket handler thực hiện
      return res.json({ message: "Join success" });

    } catch (error) {
      console.error("Join room error DETAIL:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
}

export default RoomController;