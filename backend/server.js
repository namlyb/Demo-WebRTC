import dotenv from "dotenv";
dotenv.config();

import express from "express";
import https from "https";          // thay vì http
import fs from "fs";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import { connectDB } from "./src/config/db.js";
import roomRoutes from "./src/routes/Room.js";
import initSocket, { initIceServers } from "./src/socket/socketHandler.js";
import { startMediasoup } from "./src/services/mediasoup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Kết nối database
connectDB().then(async () => {
  await startMediasoup();
  await initIceServers();
});

const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

app.use("/api/rooms", roomRoutes);

app.use(express.static(path.join(__dirname, 'dist')));

app.use((req, res, next) => {
  if (req.method === 'GET') {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    res.status(404).send('Not found');
  }
});

// Đọc chứng chỉ
const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

// Tạo server HTTPS
const server = https.createServer(options, app);

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST']
  }
});

initSocket(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ HTTPS Server running at https://0.0.0.0:${PORT}`);
});