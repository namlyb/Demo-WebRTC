import { pool } from "../config/db.js";

class Room {

  static async create({ roomCode, passwordHash, maxParticipants }) {
    const [result] = await pool.execute(
      `INSERT INTO rooms 
      (room_code, password_hash, max_participants) 
      VALUES (?, ?, ?)`,
      [roomCode, passwordHash, maxParticipants || 10]
    );

    return result.insertId;
  }

  static async findByCode(roomCode) {
    const [rows] = await pool.execute(
      `SELECT * FROM rooms WHERE room_code = ?`,
      [roomCode]
    );
    return rows[0];
  }

  static async incrementParticipants(roomCode) {
    const [result] = await pool.execute(
      `UPDATE rooms 
       SET current_participants = current_participants + 1
       WHERE room_code = ?
       AND current_participants < max_participants`,
      [roomCode]
    );

    return result.affectedRows;
  }

  static async decrementParticipants(roomCode) {
    await pool.execute(
      `UPDATE rooms 
       SET current_participants = current_participants - 1
       WHERE room_code = ? AND current_participants > 0`,
      [roomCode]
    );
  }
}

export default Room;