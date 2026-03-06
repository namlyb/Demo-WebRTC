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
  FaExpand,
  FaCompress,
  FaLink,
} from "react-icons/fa";

function VideoTile({ stream, name, isLocal, audioEnabled, videoEnabled, screenSharing = false, onNameChange, expanded = false }) {
  const videoRef = useRef();
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(name);
  const inputRef = useRef();

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, audioEnabled, videoEnabled]);

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

  // Hiển thị video nếu có stream và (videoEnabled true hoặc đang screen share)
  const showVideo = stream && (videoEnabled || screenSharing);

  const objectFitClass = expanded ? "object-contain" : "object-cover";

  return (
    <div className="relative w-full h-full bg-gray-800 rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full ${objectFitClass} ${showVideo ? '' : 'hidden'}`}
      />
      
      {!showVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-700 text-white">
          <span className="text-lg font-semibold">{name || "Guest"}</span>
        </div>
      )}

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

  const [expandedId, setExpandedId] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Responsive grid (for normal mode)
  const [cols, setCols] = useState(6);
  const [rows, setRows] = useState(4);

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

  const toggleExpand = (id) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const videoSources = [
    { type: "local", id: "local", stream: localStream, name: myName, audioEnabled, videoEnabled, screenSharing: false },
    ...(screenSharing && screenStream ? [{ type: "screen", id: "screen", stream: screenStream, name: "Screen Share", audioEnabled: false, videoEnabled: true, screenSharing: false }] : []),
    ...peers.map(p => ({
      type: "peer",
      id: p.id,
      stream: p.peer?.remoteStream,
      name: p.name,
      audioEnabled: p.audioEnabled,
      videoEnabled: p.videoEnabled,
      screenSharing: p.screenSharing || false
    }))
  ];

  useEffect(() => {
    if (expandedId && !videoSources.some(s => s.id === expandedId)) {
      setExpandedId(null);
    }
  }, [videoSources, expandedId]);

  const expandedSource = expandedId ? videoSources.find(s => s.id === expandedId) : null;
  const otherSources = videoSources.filter(s => s.id !== expandedId);

  return (
    <div className="fixed inset-0 bg-gray-900">
      {/* Copy link button - fixed top right */}
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

      <div className="h-full p-4 pt-16">
        {!expandedSource ? (
          // Normal grid layout
          <div 
            className="grid gap-4 h-full"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`
            }}
          >
            {videoSources.map((src) => {
              // Local always at bottom-left corner
              let row, col;
              if (src.type === "local") {
                row = rows;
                col = 1;
              } else {
                const index = otherSources.findIndex(s => s.id === src.id);
                const availableCells = [];
                for (let r = 1; r <= rows; r++) {
                  for (let c = 1; c <= cols; c++) {
                    if (r === rows && c === 1) continue;
                    availableCells.push({ row: r, col: c });
                  }
                }
                if (index >= 0 && index < availableCells.length) {
                  const cell = availableCells[index];
                  row = cell.row;
                  col = cell.col;
                } else {
                  return null;
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
                    screenSharing={src.screenSharing}
                    onNameChange={changeName}
                  />
                  {/* Expand button for remote peers and screen share */}
                  {src.type !== "local" && (
                    <button
                      onClick={() => toggleExpand(src.id)}
                      className="absolute top-2 left-2 z-20 p-2 bg-black/50 rounded-full text-white hover:bg-black/70"
                      title="Phóng to"
                    >
                      <FaExpand size={16} />
                    </button>
                  )}
                  {/* Local controls */}
                  {src.type === "local" && (
                    <div className="absolute top-2 right-2 flex gap-2 z-20">
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
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          // Expanded layout: top area (height 3 rows) for expanded tile, bottom row (1 row) for others
          <div className="grid h-full gap-4" style={{ gridTemplateRows: "3fr 1fr" }}>
            {/* Top area - expanded tile, căn giữa, chiều rộng tự động theo tỷ lệ video */}
            <div className="relative w-full h-full bg-gray-800 rounded-lg overflow-hidden flex items-center justify-center">
              <div className="h-full" style={{ width: 'fit-content' }}>
                <VideoTile
                  stream={expandedSource.stream}
                  name={expandedSource.name}
                  isLocal={expandedSource.type === "local"}
                  audioEnabled={expandedSource.audioEnabled}
                  videoEnabled={expandedSource.videoEnabled}
                  screenSharing={expandedSource.screenSharing}
                  onNameChange={changeName}
                  expanded={true}
                />
              </div>
              {/* Collapse button */}
              <button
                onClick={() => toggleExpand(expandedSource.id)}
                className="absolute top-2 left-2 z-20 p-2 bg-black/50 rounded-full text-white hover:bg-black/70"
                title="Thu nhỏ"
              >
                <FaCompress size={16} />
              </button>
              {/* If expanded tile is local, show media controls */}
              {expandedSource.type === "local" && (
                <div className="absolute top-2 right-2 flex gap-2 z-20">
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
              )}
            </div>

            {/* Bottom row - horizontal scrollable list of other tiles */}
            <div className="overflow-x-auto">
              <div className="flex gap-4 h-full" style={{ minWidth: "max-content" }}>
                {otherSources.map(src => (
                  <div
                    key={src.id}
                    className="relative bg-gray-800 rounded-lg overflow-hidden"
                    style={{ width: "200px", height: "100%" }}
                  >
                    <VideoTile
                      stream={src.stream}
                      name={src.name}
                      isLocal={src.type === "local"}
                      audioEnabled={src.audioEnabled}
                      videoEnabled={src.videoEnabled}
                      screenSharing={src.screenSharing}
                      onNameChange={changeName}
                    />
                    {/* Expand button for remote peers and screen share */}
                    {src.type !== "local" && (
                      <button
                        onClick={() => toggleExpand(src.id)}
                        className="absolute top-2 left-2 z-20 p-2 bg-black/50 rounded-full text-white hover:bg-black/70"
                        title="Phóng to"
                      >
                        <FaExpand size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
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