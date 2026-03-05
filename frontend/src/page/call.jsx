import { useSearchParams, useNavigate } from "react-router-dom";
import { CallProvider, useCall } from "../context/CallContext";
import { useRef, useEffect, useState } from "react";
import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaDesktop,
  FaStop,
  FaSignOutAlt,
} from "react-icons/fa";

// Component dùng chung cho mỗi ô video
function VideoTile({ stream, name, isLocal, audioEnabled, videoEnabled, onNameChange }) {
  const videoRef = useRef();
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(name);
  const inputRef = useRef();

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const handleNameClick = () => {
    if (isLocal) {
      setEditing(true);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleNameSubmit = () => {
    if (newName.trim() && onNameChange) {
      onNameChange(newName);
    }
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleNameSubmit();
    if (e.key === "Escape") setEditing(false);
  };

  // Kiểm tra video có đang bật không
  // Local: dựa vào track thực tế; Remote: dựa vào props videoEnabled
  const hasVideo = isLocal
    ? stream && stream.getVideoTracks().some(track => track.enabled)
    : videoEnabled;

  return (
    <div className="relative w-full h-full bg-gray-800 rounded-lg overflow-hidden">
      {stream && hasVideo ? (
        <video ref={videoRef} autoPlay playsInline muted={isLocal} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-700 text-white">
          <span className="text-lg font-semibold">{name || "Guest"}</span>
        </div>
      )}

      {/* Tên hiển thị ở góc dưới bên trái */}
      <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-sm">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={handleKeyDown}
            className="bg-transparent border-b border-white outline-none text-white w-24"
          />
        ) : (
          <span onClick={handleNameClick} className="cursor-pointer">
            {name || "Guest"}
          </span>
        )}
      </div>

      {/* Trạng thái mic/camera cho peer */}
      {!isLocal && (
        <div className="absolute top-2 right-2 flex gap-1 bg-black/50 p-1 rounded">
          {audioEnabled ? (
            <FaMicrophone className="text-white" size={14} />
          ) : (
            <FaMicrophoneSlash className="text-red-500" size={14} />
          )}
          {videoEnabled ? (
            <FaVideo className="text-white" size={14} />
          ) : (
            <FaVideoSlash className="text-red-500" size={14} />
          )}
        </div>
      )}
    </div>
  );
}

function CallUI() {
  const navigate = useNavigate();
  const {
    peers,
    localStream,
    screenStream,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    leaveRoom,
    audioEnabled,
    videoEnabled,
    screenSharing,
    myName,
    changeName,
  } = useCall();

  const totalCols = 6;
  const totalRows = 4;
  const localCol = 1;
  const localRow = 4;
  const localIndex = (localRow - 1) * totalCols + (localCol - 1); // 18

  // Danh sách các nguồn video
  const videoSources = [
    { type: "local", id: "local", stream: localStream, name: myName, audioEnabled, videoEnabled },
    ...(screenSharing && screenStream ? [{ type: "screen", id: "screen", stream: screenStream, name: "Screen Share", audioEnabled: false, videoEnabled: true }] : []),
    ...peers.map(p => ({ 
      type: "peer", 
      id: p.id, 
      stream: p.peer?.streams[0], 
      name: p.name, 
      audioEnabled: p.audioEnabled, 
      videoEnabled: p.videoEnabled 
    }))
  ];

  // Vùng trung tâm ưu tiên: cột 2-5, hàng 2-3 (8 ô)
  const centerCells = [];
  for (let r = 2; r <= 3; r++) {
    for (let c = 2; c <= 5; c++) {
      centerCells.push((r - 1) * totalCols + (c - 1));
    }
  }

  // Các ô còn lại (trừ ô local)
  const allOtherCells = [];
  for (let i = 0; i < totalCols * totalRows; i++) {
    const row = Math.floor(i / totalCols) + 1;
    const col = (i % totalCols) + 1;
    if (row === localRow && col === localCol) continue;
    allOtherCells.push(i);
  }

  // Gán vị trí: local cố định, các nguồn khác lần lượt vào center rồi other
  const positions = new Map();
  videoSources.forEach((src, idx) => {
    if (src.type === "local") {
      positions.set(src.id, localIndex);
    } else {
      const peerIdx = idx - 1; // bỏ qua local
      if (peerIdx < centerCells.length) {
        positions.set(src.id, centerCells[peerIdx]);
      } else {
        const otherIdx = peerIdx - centerCells.length;
        if (otherIdx < allOtherCells.length) {
          positions.set(src.id, allOtherCells[otherIdx]);
        }
      }
    }
  });

  return (
    <div className="fixed inset-0 bg-gray-900">
      <div className="h-full p-4">
        <div className="grid grid-cols-6 grid-rows-4 gap-4 h-full">
          {videoSources.map((src) => {
            const cellIndex = positions.get(src.id);
            if (cellIndex === undefined) return null;

            const row = Math.floor(cellIndex / totalCols) + 1;
            const col = (cellIndex % totalCols) + 1;

            // Local camera
            if (src.type === "local") {
              return (
                <div
                  key={src.id}
                  className="relative bg-gray-800 rounded-lg overflow-hidden"
                  style={{ gridColumn: col, gridRow: row }}
                >
                  <VideoTile
                    stream={localStream}
                    name={myName}
                    isLocal
                    audioEnabled={audioEnabled}
                    videoEnabled={videoEnabled}
                    onNameChange={changeName}
                  />
                  {/* Overlay các nút điều khiển */}
                  <div className="absolute top-2 right-2 flex gap-2">
                    <button
                      onClick={toggleAudio}
                      className={`p-2 rounded-full ${audioEnabled ? "bg-gray-600" : "bg-red-600"} text-white hover:opacity-80 transition`}
                      title={audioEnabled ? "Tắt mic" : "Bật mic"}
                    >
                      {audioEnabled ? <FaMicrophone size={16} /> : <FaMicrophoneSlash size={16} />}
                    </button>
                    <button
                      onClick={toggleVideo}
                      className={`p-2 rounded-full ${videoEnabled ? "bg-gray-600" : "bg-red-600"} text-white hover:opacity-80 transition`}
                      title={videoEnabled ? "Tắt camera" : "Bật camera"}
                    >
                      {videoEnabled ? <FaVideo size={16} /> : <FaVideoSlash size={16} />}
                    </button>
                    <button
                      onClick={toggleScreenShare}
                      className={`p-2 rounded-full ${screenSharing ? "bg-green-600" : "bg-gray-600"} text-white hover:opacity-80 transition`}
                      title={screenSharing ? "Dừng chia sẻ" : "Chia sẻ màn hình"}
                    >
                      {screenSharing ? <FaStop size={16} /> : <FaDesktop size={16} />}
                    </button>
                    <button
                      onClick={() => {
                        leaveRoom();
                        navigate("/");
                      }}
                      className="p-2 rounded-full bg-red-600 text-white hover:opacity-80 transition"
                      title="Rời phòng"
                    >
                      <FaSignOutAlt size={16} />
                    </button>
                  </div>
                </div>
              );
            }

            // Screen share
            if (src.type === "screen") {
              return (
                <div
                  key={src.id}
                  className="relative bg-gray-800 rounded-lg overflow-hidden"
                  style={{ gridColumn: col, gridRow: row }}
                >
                  <VideoTile
                    stream={screenStream}
                    name="Screen Share"
                    isLocal={false}
                    audioEnabled={false}
                    videoEnabled={true}
                  />
                </div>
              );
            }

            // Peer
            return (
              <div
                key={src.id}
                className="relative bg-gray-800 rounded-lg overflow-hidden"
                style={{ gridColumn: col, gridRow: row }}
              >
                <VideoTile
                  stream={src.stream}
                  name={src.name}
                  isLocal={false}
                  audioEnabled={src.audioEnabled}
                  videoEnabled={src.videoEnabled}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Call() {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get("roomId");

  return (
    <CallProvider roomId={roomId}>
      <CallUI />
    </CallProvider>
  );
}