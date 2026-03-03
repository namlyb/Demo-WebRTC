import { useSearchParams, useNavigate } from "react-router-dom";
import { CallProvider, useCall } from "../context/CallContext";
import { useRef, useEffect } from "react";
import { 
  FaMicrophone, 
  FaMicrophoneSlash, 
  FaVideo, 
  FaVideoSlash, 
  FaDesktop, 
  FaStop, 
  FaSignOutAlt 
} from 'react-icons/fa';

function Video({ stream, muted = false }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className="w-full h-full object-cover rounded-lg" />;
}

function CallUI() {
  const navigate = useNavigate();
  const {
    participants,
    loading,
    localStream,
    remoteStreams,
    localVideoRef,
    leaveRoom,
    mediaError,
    audioEnabled,
    videoEnabled,
    screenSharing,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
  } = useCall();

  const handleLeaveRoom = () => {
    leaveRoom();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-900 text-white">
        Đang kết nối...
      </div>
    );
  }

  if (mediaError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-900 text-white flex-col">
        <p className="mb-4">Không thể truy cập camera/mic: {mediaError}</p>
        <p>Vui lòng kiểm tra quyền truy cập và tải lại trang.</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-600 text-white px-4 py-2 rounded mt-4"
        >
          Tải lại
        </button>
      </div>
    );
  }

  const totalVideos = 1 + Object.keys(remoteStreams).length;

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col">
      {/* Video grid */}
      <div className="flex-1 p-4 overflow-auto">
        <div className={`grid gap-4 h-full ${totalVideos === 1 ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3'}`}>
          {/* Local video */}
          <div className="relative bg-gray-800 rounded-lg overflow-hidden">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
              Bạn {!videoEnabled && "(tắt camera)"}
            </div>
          </div>

          {/* Remote videos */}
          {Object.entries(remoteStreams).map(([id, stream]) => {
            const participant = participants.find((p) => p.id === id);
            return (
              <div key={id} className="relative bg-gray-800 rounded-lg overflow-hidden">
                <Video stream={stream} />
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                  {participant?.name || "Guest"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Control bar */}
      <div className="bg-gray-800 py-4 flex justify-center items-center gap-4">
        <button
          onClick={toggleAudio}
          className={`flex flex-col items-center p-2 rounded-lg ${audioEnabled ? 'bg-gray-600 hover:bg-gray-500' : 'bg-red-600 hover:bg-red-500'} text-white transition w-20`}
          title={audioEnabled ? "Tắt mic" : "Bật mic"}
        >
          {audioEnabled ? <FaMicrophone size={24} /> : <FaMicrophoneSlash size={24} />}
          <span className="text-xs mt-1">{audioEnabled ? 'Mic' : 'Tắt mic'}</span>
        </button>

        <button
          onClick={toggleVideo}
          className={`flex flex-col items-center p-2 rounded-lg ${videoEnabled ? 'bg-gray-600 hover:bg-gray-500' : 'bg-red-600 hover:bg-red-500'} text-white transition w-20`}
          title={videoEnabled ? "Tắt camera" : "Bật camera"}
        >
          {videoEnabled ? <FaVideo size={24} /> : <FaVideoSlash size={24} />}
          <span className="text-xs mt-1">{videoEnabled ? 'Camera' : 'Tắt cam'}</span>
        </button>

        <button
          onClick={toggleScreenShare}
          className={`flex flex-col items-center p-2 rounded-lg ${screenSharing ? 'bg-green-600 hover:bg-green-500' : 'bg-gray-600 hover:bg-gray-500'} text-white transition w-20`}
          title={screenSharing ? "Dừng chia sẻ màn hình" : "Chia sẻ màn hình"}
        >
          {screenSharing ? <FaStop size={24} /> : <FaDesktop size={24} />}
          <span className="text-xs mt-1">{screenSharing ? 'Dừng share' : 'Share'}</span>
        </button>

        <button
          onClick={handleLeaveRoom}
          className="flex flex-col items-center p-2 rounded-lg bg-red-600 hover:bg-red-500 text-white transition w-20"
          title="Rời phòng"
        >
          <FaSignOutAlt size={24} />
          <span className="text-xs mt-1">Rời phòng</span>
        </button>
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