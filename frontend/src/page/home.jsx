import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const [roomCode, setRoomCode] = useState("");
  const navigate = useNavigate();

  const createRoom = () => {
    const newRoom = Math.random().toString(36).substring(2, 8);
    navigate(`/call/${newRoom}`);
  };

  const joinRoom = () => {
    if (!roomCode) return;
    navigate(`/call/${roomCode}`);
  };

  return (
    <div style={{ textAlign: "center", marginTop: "100px" }}>
      <h1>Demo WebRTC</h1>

      <button onClick={createRoom}>Create Room</button>

      <div>
        <input
          placeholder="Enter Room Code"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value)}
        />
        <button onClick={joinRoom}>Join</button>
      </div>
    </div>
  );
}