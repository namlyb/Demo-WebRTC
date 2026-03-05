import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import { connectDB } from "./src/config/db.js";
import roomRoutes from "./src/routes/Room.js";
import initSocket from "./src/socket/socketHandler.js";

// Kết nối database
connectDB();

const app = express();
const server = http.createServer(app);

// Cấu hình CORS (giữ nguyên để hỗ trợ frontend riêng nếu cần)
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());

// Routes API
app.use("/api/rooms", roomRoutes);

// --- Phục vụ file tĩnh từ thư mục dist (frontend đã build) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware phục vụ file tĩnh (CSS, JS, ảnh,...)
app.use(express.static(path.join(__dirname, 'dist')));

// Tất cả các route còn lại trả về index.html để React Router xử lý
// Sửa '*' thành '/*' để tránh lỗi path-to-regexp
app.get((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// --- Khởi tạo Socket.IO ---
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

initSocket(io);

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});