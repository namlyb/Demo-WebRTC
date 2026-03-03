import { useState } from "react";
import axios from "../components/lib/axios";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const [createPassword, setCreatePassword] = useState("");
  const [maxParticipants, setMaxParticipants] = useState(10);

  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [joinPassword, setJoinPassword] = useState("");

  // Tạo phòng
  const createRoom = async () => {
    const newRoom = Math.random().toString(36).substring(2, 8);
    try {
      await axios.post("/rooms/create", {
        roomCode: newRoom,
        password: createPassword,
        maxParticipants
      });
      const params = new URLSearchParams({ roomId: newRoom });
      if (createPassword) params.set("password", createPassword);
      navigate(`/?${params.toString()}`);
    } catch (err) {
      alert(err.response?.data?.message);
    }
  };

  // Tham gia phòng – gọi API join trước khi chuyển trang
  const joinRoom = async () => {
    if (!joinRoomCode) {
      alert("Vui lòng nhập Room Code");
      return;
    }
    try {
      await axios.post("/rooms/join", {
        roomCode: joinRoomCode,
        password: joinPassword
      });
      const params = new URLSearchParams({ roomId: joinRoomCode });
      if (joinPassword) params.set("password", joinPassword);
      navigate(`/?${params.toString()}`);
    } catch (err) {
      alert(err.response?.data?.message || "Lỗi khi tham gia phòng");
    }
  };

  // Style modal (giữ nguyên)
  const modalOverlay = {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)", display: "flex",
    justifyContent: "center", alignItems: "center"
  };
  const modalContent = {
    background: "white", padding: 20, borderRadius: 8, width: 300
  };

  return (
    <div style={{ textAlign: "center", marginTop: 100 }}>
      <h1>Zoom Clone (mediasoup style)</h1>

      <button onClick={() => setShowCreateModal(true)}>Create Room</button>
      <button onClick={() => setShowJoinModal(true)} style={{ marginLeft: 10 }}>Join Room</button>

      {/* Modal tạo phòng */}
      {showCreateModal && (
        <div style={modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div style={modalContent} onClick={e => e.stopPropagation()}>
            <h3>Create Room</h3>
            <input
              placeholder="Password (optional)"
              type="password"
              value={createPassword}
              onChange={e => setCreatePassword(e.target.value)}
              style={{ width: "100%", marginBottom: 10 }}
            />
            <input
              placeholder="Max Participants"
              type="number"
              value={maxParticipants}
              onChange={e => setMaxParticipants(Number(e.target.value))}
              style={{ width: "100%", marginBottom: 10 }}
            />
            <button onClick={createRoom}>Create</button>
            <button onClick={() => setShowCreateModal(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Modal tham gia phòng */}
      {showJoinModal && (
        <div style={modalOverlay} onClick={() => setShowJoinModal(false)}>
          <div style={modalContent} onClick={e => e.stopPropagation()}>
            <h3>Join Room</h3>
            <input
              placeholder="Room Code"
              value={joinRoomCode}
              onChange={e => setJoinRoomCode(e.target.value)}
              style={{ width: "100%", marginBottom: 10 }}
            />
            <input
              placeholder="Password"
              type="password"
              value={joinPassword}
              onChange={e => setJoinPassword(e.target.value)}
              style={{ width: "100%", marginBottom: 10 }}
            />
            <button onClick={joinRoom}>Join</button>
            <button onClick={() => setShowJoinModal(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}