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

function VideoTile({ stream, name, isLocal, audioEnabled, videoEnabled, onNameChange, localStream }) {
  const videoRef = useRef();
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(name);
  const inputRef = useRef();

  useEffect(() => {
    if (videoRef.current) {
      if (stream) {
        if (!isLocal && stream === localStream) {
          console.error("Remote tile received local stream!");
          return;
        }
        videoRef.current.srcObject = stream;
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream, isLocal, localStream]);

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

      {/* Trạng thái mic/camera cho tất cả (local và remote) */}
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

      {/* Các nút điều khiển chỉ hiện cho local */}
      {isLocal && (
        <div className="absolute top-2 left-2 flex gap-2">
          {/* Các nút điều khiển được render bên ngoài component này từ CallUI */}
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

  // Responsive: xác định số cột và số hàng dựa trên kích thước màn hình
  const [cols, setCols] = useState(6); // desktop
  const [rows, setRows] = useState(4); // desktop: 6x4 = 24 ô

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setCols(2);
        setRows(5); // mobile: 2x5 = 10 ô
      } else {
        setCols(6);
        setRows(4);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Vị trí local luôn ở góc dưới bên trái (hàng cuối, cột 1)
  const localRow = rows;
  const localCol = 1;
  const localIndex = (localRow - 1) * cols + (localCol - 1);

  // Danh sách các nguồn video
  const videoSources = [
    { type: "local", id: "local", stream: localStream, name: myName, audioEnabled, videoEnabled },
    ...(screenSharing && screenStream ? [{ type: "screen", id: "screen", stream: screenStream, name: "Screen Share", audioEnabled: false, videoEnabled: true }] : []),
    ...peers.map(p => ({
      type: "peer",
      id: p.id,
      stream: p.peer?.remoteStream,
      name: p.name,
      audioEnabled: p.audioEnabled,
      videoEnabled: p.videoEnabled
    }))
  ];

  // Tạo danh sách tất cả các ô (trừ ô local) để xếp các nguồn khác
  const availableCells = [];
  for (let i = 0; i < cols * rows; i++) {
    const r = Math.floor(i / cols) + 1;
    const c = (i % cols) + 1;
    if (r === localRow && c === localCol) continue; // bỏ qua ô local
    availableCells.push(i);
  }

  // Gán vị trí: local cố định, các nguồn khác lấy lần lượt từ availableCells
  const positions = new Map();
  videoSources.forEach((src, idx) => {
    if (src.type === "local") {
      positions.set(src.id, localIndex);
    } else {
      const peerIdx = idx - 1; // bỏ qua local
      if (peerIdx < availableCells.length) {
        positions.set(src.id, availableCells[peerIdx]);
      } else {
        console.warn("Not enough grid cells for all peers");
      }
    }
  });

  return (
    <div className="fixed inset-0 bg-gray-900">
      <div className="h-full p-4">
        <div 
          className="grid gap-4 h-full"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`
          }}
        >
          {videoSources.map((src) => {
            const cellIndex = positions.get(src.id);
            if (cellIndex === undefined) return null;

            const row = Math.floor(cellIndex / cols) + 1;
            const col = (cellIndex % cols) + 1;

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
                    localStream={localStream}
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
                    localStream={localStream}
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
                  localStream={localStream}
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