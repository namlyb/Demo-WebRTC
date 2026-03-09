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

function VideoTile({ stream, name, isLocal, audioEnabled, videoEnabled, onNameChange }) {
  const videoRef = useRef();
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(name);
  const [playFailed, setPlayFailed] = useState(false);
  const inputRef = useRef();

  const attemptPlay = useCallback(() => {
    if (videoRef.current && stream) {
      videoRef.current.play()
        .then(() => setPlayFailed(false))
        .catch((e) => {
          console.warn("⚠️ play failed:", e);
          setPlayFailed(true);
        });
    }
  }, [stream]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      attemptPlay();
    } else {
      setPlayFailed(false);
    }
  }, [stream, attemptPlay]);

  // Log stream info để debug
  useEffect(() => {
    if (stream) {
      console.log(`📹 VideoTile stream for ${name}:`, stream.id,
        stream.getTracks().map(t => `${t.kind}:${t.enabled}`));
    }
  }, [stream, name]);

  const showVideo = stream && videoEnabled;

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

  return (
    <div className="relative w-full h-full bg-gray-800 rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover ${showVideo ? "" : "hidden"}`}
      />

      {!showVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-700 text-white">
          <span className="text-lg font-semibold">{name || "Guest"}</span>
        </div>
      )}

      {playFailed && showVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30">
          <button
            onClick={attemptPlay}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            Bấm để phát video
          </button>
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
    toggleAudio,
    toggleVideo,
    leaveRoom,
    audioEnabled,
    videoEnabled,
    myName,
    changeName,
  } = useCall();

  const [copySuccess, setCopySuccess] = useState(false);

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

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

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
      stream: p.peer?.remoteStream,
      name: p.name || "Guest",
      audioEnabled: p.audioEnabled,
      videoEnabled: p.videoEnabled,
    })),
  ];

  return (
    <div className="fixed inset-0 bg-gray-900">
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
        <div
          className="grid gap-4 h-full"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
        >
          {videoSources.map((src) => {
            let row, col;
            if (src.type === "local") {
              row = rows;
              col = 1;
            } else {
              const index = videoSources.filter((s) => s.type !== "local").findIndex((s) => s.id === src.id);
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
                  onNameChange={changeName}
                />
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

export default function Call() {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get("roomId");

  return (
    <CallProvider roomId={roomId}>
      <CallUI />
    </CallProvider>
  );
}