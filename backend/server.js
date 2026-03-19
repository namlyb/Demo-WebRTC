import dotenv from "dotenv";
dotenv.config();

import express from "express";
import https from "https";          // thay vì http
import fs from "fs";                // để đọc file chứng chỉ
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import { connectDB } from "./src/config/db.js";
import roomRoutes from "./src/routes/Room.js";
import initSocket from "./src/socket/socketHandler.js";
import { startMediasoup } from "./src/services/mediasoup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Đọc chứng chỉ SSL
const privateKey = fs.readFileSync(path.join(__dirname, 'key.pem'), 'utf8');
const certificate = fs.readFileSync(path.join(__dirname, 'cert.pem'), 'utf8');
const credentials = { key: privateKey, cert: certificate };

// Kết nối database
connectDB().then(() => {
  startMediasoup();
});

const app = express();

// CORS - cho phép mọi origin (có thể giới hạn lại nếu cần)
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

// Routes API
app.use("/api/rooms", roomRoutes);

// Phục vụ file tĩnh từ thư mục dist
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback SPA
app.use((req, res, next) => {
  if (req.method === 'GET') {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    res.status(404).send('Not found');
  }
});

// Tạo server HTTPS
const server = https.createServer(credentials, app);

// Khởi tạo Socket.IO với server HTTPS
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
  console.log(`📱 Access via: https://${process.env.ANNOUNCED_IP || 'localhost'}:${PORT}`);
});