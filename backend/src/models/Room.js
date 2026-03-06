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
       AND current_participants < max_participants
       AND status = 'ACTIVE'`, // chỉ tăng nếu phòng đang ACTIVE
      [roomCode]
    );

    if (result.affectedRows === 0) return 0;

    // Trả về số người hiện tại sau khi tăng
    const [rows] = await pool.execute(
      `SELECT current_participants FROM rooms WHERE room_code = ?`,
      [roomCode]
    );
    return rows[0]?.current_participants || 0;
  }

  static async decrementParticipants(roomCode) {
    await pool.execute(
      `UPDATE rooms 
       SET current_participants = current_participants - 1
       WHERE room_code = ? AND current_participants > 0`,
      [roomCode]
    );

    // Trả về số người hiện tại sau khi giảm
    const [rows] = await pool.execute(
      `SELECT current_participants FROM rooms WHERE room_code = ?`,
      [roomCode]
    );
    return rows[0]?.current_participants || 0;
  }

  static async endRoom(roomCode) {
    const [result] = await pool.execute(
      `UPDATE rooms 
       SET status = 'ENDED', ended_at = NOW()
       WHERE room_code = ? AND status = 'ACTIVE'`,
      [roomCode]
    );
    return result.affectedRows;
  }

  static async expireRoom(roomCode) {
    const [result] = await pool.execute(
      `UPDATE rooms 
       SET status = 'EXPIRED', expired_at = NOW()
       WHERE room_code = ? AND status = 'ENDED'`,
      [roomCode]
    );
    return result.affectedRows;
  }

  static async getParticipantCount(roomCode) {
    const [rows] = await pool.execute(
      `SELECT current_participants FROM rooms WHERE room_code = ?`,
      [roomCode]
    );
    return rows[0]?.current_participants || 0;
  }
}

export default Room;