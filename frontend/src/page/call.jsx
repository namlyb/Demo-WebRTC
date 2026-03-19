import { useSearchParams, useNavigate } from "react-router-dom";
import { CallProvider, useCall } from "../context/CallContext";
import { useRef, useEffect, useState, useCallback } from "react";
import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaSignOutAlt,
  FaLink,
} from "react-icons/fa";

// Component hiển thị video/audio của một người tham gia
function VideoTile({ stream, name, isLocal, audioEnabled, videoEnabled, onNameChange }) {
  const videoRef = useRef();
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(name);
  const [playFailed, setPlayFailed] = useState(false);
  const inputRef = useRef();

  // Hàm thử phát video (khi trình duyệt chặn tự động phát)
  const attemptPlay = useCallback(() => {
    if (videoRef.current && stream) {
      videoRef.current.play()
        .then(() => {
          console.log(`✅ Video playing for ${name}`);
          setPlayFailed(false);
        })
        .catch((e) => {
          console.warn(`⚠️ play failed for ${name}:`, e);
          setPlayFailed(true);
        });
    }
  }, [stream, name]);

  // Gán stream vào video element và thử phát
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      // Trên mobile, cần user gesture để play, nên thử ngay nhưng có thể bị chặn
      attemptPlay();
    } else {
      setPlayFailed(false);
    }
  }, [stream, attemptPlay]);

  // Debug: log thông tin stream
  useEffect(() => {
    if (stream) {
      console.log(`📹 VideoTile stream for ${name}:`, stream.id,
        stream.getTracks().map(t => `${t.kind}:${t.enabled}`));
    }
  }, [stream, name]);

  const showVideo = stream && videoEnabled && stream.getVideoTracks().length > 0;

  // Xử lý đổi tên (chỉ cho phép local)
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

  // Khi người dùng click vào video (nếu play failed), thử phát lại
  const handleVideoClick = () => {
    if (playFailed) {
      attemptPlay();
    }
  };

  return (
    <div className="relative w-full h-full bg-gray-800 rounded-lg overflow-hidden" onClick={handleVideoClick}>
      {/* Video element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover ${showVideo ? "" : "hidden"}`}
      />

      {/* Placeholder khi không có video */}
      {!showVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-700 text-white">
          <span className="text-lg font-semibold">{name || "Guest"}</span>
        </div>
      )}

      {/* Nút bấm phát lại nếu bị chặn */}
      {playFailed && showVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30">
          <button
            onClick={(e) => { e.stopPropagation(); attemptPlay(); }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            Bấm để phát video
          </button>
        </div>
      )}

      {/* Tên người dùng (có thể click để đổi nếu là local) */}
      <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-sm z-10">
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

      {/* Biểu tượng trạng thái mic/camera */}
      <div className="absolute top-2 right-2 flex gap-1 bg-black/50 p-1 rounded z-10">
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
    </div>
  );
}

// Giao diện chính của cuộc gọi
function CallUI() {
  const navigate = useNavigate();
  const {
    peers,
    localStream,
    toggleAudio,
    toggleVideo,
    leaveRoom,
    audioEnabled,
    videoEnabled,
    myName,
    changeName,
  } = useCall();

  const [copySuccess, setCopySuccess] = useState(false);
  const [cols, setCols] = useState(6);  // Số cột grid (responsive)
  const [rows, setRows] = useState(4);  // Số hàng grid

  // Điều chỉnh grid theo kích thước màn hình
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setCols(2);
        setRows(5);
      } else {
        setCols(6);
        setRows(4);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Copy link phòng vào clipboard
  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  // Danh sách nguồn video (local + các peer)
  const videoSources = [
    {
      type: "local",
      id: "local",
      stream: localStream,
      name: myName || "Me",
      audioEnabled,
      videoEnabled,
    },
    ...peers.map((p) => ({
      type: "peer",
      id: p.id,
      stream: p.stream,
      name: p.name || "Guest",
      audioEnabled: p.audioEnabled,
      videoEnabled: p.videoEnabled,
    })),
  ];

  return (
    <div className="fixed inset-0 bg-gray-900">
      {/* Nút copy link */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        {copySuccess && (
          <span className="text-green-400 bg-black/50 px-2 py-1 rounded text-sm">
            Copied!
          </span>
        )}
        <button
          onClick={copyLink}
          className="p-3 bg-blue-600 cursor-pointer hover:bg-blue-700 text-white rounded-full shadow-lg transition"
          title="Copy room link"
        >
          <FaLink size={20} />
        </button>
      </div>

      {/* Grid hiển thị video */}
      <div className="h-full p-4 pt-16">
        <div
          className="grid gap-4 h-full"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
        >
          {videoSources.map((src) => {
            // Xác định vị trí ô grid
            let row, col;
            if (src.type === "local") {
              // Local luôn ở góc dưới bên trái
              row = rows;
              col = 1;
            } else {
              // Các peer xếp lần lượt vào các ô còn lại
              const index = videoSources.filter((s) => s.type !== "local").findIndex((s) => s.id === src.id);
              const availableCells = [];
              for (let r = 1; r <= rows; r++) {
                for (let c = 1; c <= cols; c++) {
                  if (r === rows && c === 1) continue; // bỏ qua ô local
                  availableCells.push({ row: r, col: c });
                }
              }
              if (index >= 0 && index < availableCells.length) {
                const cell = availableCells[index];
                row = cell.row;
                col = cell.col;
              } else {
                return null; // không đủ ô (có thể scroll)
              }
            }

            return (
              <div
                key={src.id}
                className="relative bg-gray-800 rounded-lg overflow-hidden"
                style={{ gridColumn: col, gridRow: row }}
              >
                <VideoTile
                  stream={src.stream}
                  name={src.name}
                  isLocal={src.type === "local"}
                  audioEnabled={src.audioEnabled}
                  videoEnabled={src.videoEnabled}
                  onNameChange={changeName}
                />
                {/* Nút điều khiển cho local */}
                {src.type === "local" && (
                  <div className="absolute top-2 right-2 flex gap-2 z-20">
                    <button
                      onClick={toggleAudio}
                      className={`p-2 rounded-full ${
                        audioEnabled ? "bg-gray-600" : "bg-red-600"
                      } text-white hover:opacity-80 transition`}
                      title={audioEnabled ? "Tắt mic" : "Bật mic"}
                    >
                      {audioEnabled ? <FaMicrophone size={16} /> : <FaMicrophoneSlash size={16} />}
                    </button>
                    <button
                      onClick={toggleVideo}
                      className={`p-2 rounded-full ${
                        videoEnabled ? "bg-gray-600" : "bg-red-600"
                      } text-white hover:opacity-80 transition`}
                      title={videoEnabled ? "Tắt camera" : "Bật camera"}
                    >
                      {videoEnabled ? <FaVideo size={16} /> : <FaVideoSlash size={16} />}
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
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Component chính, bọc CallProvider
export default function Call() {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get("roomId");

  return (
    <CallProvider roomId={roomId}>
      <CallUI />
    </CallProvider>
  );
}