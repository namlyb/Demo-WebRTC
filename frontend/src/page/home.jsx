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

  const createRoom = async () => {
    const newRoom = Math.random().toString(36).substring(2, 8);
    try {
      await axios.post("/rooms/create", {
        roomCode: newRoom,
        password: createPassword,
        maxParticipants,
      });
      const params = new URLSearchParams({ roomId: newRoom });
      if (createPassword) params.set("password", createPassword);
      navigate(`/?${params.toString()}`);
    } catch (err) {
      alert(err.response?.data?.message);
    }
  };

  const joinRoom = async () => {
    if (!joinRoomCode) {
      alert("Vui lòng nhập Room Code");
      return;
    }
    try {
      await axios.post("/rooms/join", {
        roomCode: joinRoomCode,
        password: joinPassword,
      });
      const params = new URLSearchParams({ roomId: joinRoomCode });
      if (joinPassword) params.set("password", joinPassword);
      navigate(`/?${params.toString()}`);
    } catch (err) {
      alert(err.response?.data?.message || "Lỗi khi tham gia phòng");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20 max-w-md w-full">
        <h1 className="text-3xl font-bold text-white text-center mb-8">
          Zoom Clone
        </h1>
        <div className="space-y-4">
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-200"
          >
            Create Room
          </button>
          <button
            onClick={() => setShowJoinModal(true)}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-200"
          >
            Join Room
          </button>
        </div>
      </div>

      {/* Modal tạo phòng */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="bg-gray-800 rounded-xl p-6 w-96 border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-white mb-4">Create Room</h3>
            <input
              type="password"
              placeholder="Password (optional)"
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              placeholder="Max Participants"
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(Number(e.target.value))}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex space-x-3">
              <button
                onClick={createRoom}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition"
              >
                Create
              </button>
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal tham gia phòng */}
      {showJoinModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowJoinModal(false)}
        >
          <div
            className="bg-gray-800 rounded-xl p-6 w-96 border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-white mb-4">Join Room</h3>
            <input
              type="text"
              placeholder="Room Code"
              value={joinRoomCode}
              onChange={(e) => setJoinRoomCode(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <input
              type="password"
              placeholder="Password"
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="flex space-x-3">
              <button
                onClick={joinRoom}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg transition"
              >
                Join
              </button>
              <button
                onClick={() => setShowJoinModal(false)}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}