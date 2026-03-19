import * as mediasoup from 'mediasoup';

const workerSettings = {
  logLevel: 'debug',
  rtcMinPort: 40000,
  rtcMaxPort: 49999,
};

export const rooms = new Map(); // key: roomCode, value: { worker, router, producers, consumers }

let worker = null;

export async function startMediasoup() {
  worker = await mediasoup.createWorker(workerSettings);
  console.log('✅ Mediasoup worker created');
  
  // Thêm log cho các sự kiện của worker
  worker.on('died', () => {
    console.error('❌ Mediasoup worker died, exiting...');
    process.exit(1);
  });
  worker.on('subprocessclose', () => console.log('🔧 Worker subprocess closed'));
  worker.on('subprocessexit', (code) => console.log(`🔧 Worker subprocess exited with code ${code}`));
}

export function getWorker() {
  return worker;
}

export async function getOrCreateRouter(roomCode) {
  if (rooms.has(roomCode)) {
    return rooms.get(roomCode).router;
  }
  if (!worker) await startMediasoup();
  const router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/H264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',
          'level-asymmetry-allowed': 1,
        },
      },
    ],
  });
  rooms.set(roomCode, { worker, router, producers: new Map(), consumers: new Map() });
  console.log(`🆕 Router created for room ${roomCode}`);
  return router;
}

export function getRoomData(roomCode) {
  return rooms.get(roomCode);
}