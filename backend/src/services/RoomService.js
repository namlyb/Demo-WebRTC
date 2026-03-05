import Room from "../models/Room.js";
import bcrypt from "bcrypt";

class RoomService {

  static async createRoom(roomCode,password,maxParticipants){

    const hash = password
      ? await bcrypt.hash(password,10)
      : null;

    await Room.create(roomCode,hash,maxParticipants);

  }

  static async joinRoom(roomCode,password){

    const room = await Room.findByCode(roomCode);

    if(!room)
      throw new Error("Room not found");

    if(room.status !== "ACTIVE")
      throw new Error("Room inactive");

    if(room.password_hash){

      const valid = await bcrypt.compare(password,room.password_hash);

      if(!valid)
        throw new Error("Wrong password");

    }

    if(room.current_participants >= room.max_participants)
      throw new Error("Room full");

    await Room.incrementParticipants(roomCode);

    return room;

  }

}

export default RoomService;