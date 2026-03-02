import { pool } from "../config/db.js";

class Room {
  static async create({ roomCode, passwordHash, maxParticipants = 10 }) {
    const [result] = await pool.query(
      `
      INSERT INTO rooms 
      (room_code, password_hash, max_participants, status)
      VALUES (?, ?, ?, 'ACTIVE')
      `,
      [roomCode, passwordHash, maxParticipants]
    );

    return result.insertId;
  }

  static async findByCode(roomCode) {
    const [rows] = await pool.query(
      `SELECT * FROM rooms WHERE room_code = ? LIMIT 1`,
      [roomCode]
    );

    return rows[0];
  }

  static async endRoom(roomCode) {
    const [result] = await pool.query(
      `
      UPDATE rooms 
      SET status = 'ENDED', ended_at = NOW() 
      WHERE room_code = ? AND status = 'ACTIVE'
      `,
      [roomCode]
    );

    return result.affectedRows;
  }
}

export default Room;