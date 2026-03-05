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

// CORS - cho phép mọi origin (phù hợp với môi trường dùng ngrok)
app.use(cors({
  origin: true,                         // chấp nhận origin hiện tại của request
  credentials: true
}));

app.use(express.json());

// Routes API
app.use("/api/rooms", roomRoutes);

// Phục vụ file tĩnh từ thư mục dist (frontend đã build)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'dist')));

// Tất cả các route còn lại trả về index.html (cho React Router)
app.get((req, res) => {            // chú ý dấu *
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Khởi tạo Socket.IO với CORS linh hoạt
const io = new Server(server, {
  cors: {
    origin: true,                        // chấp nhận origin hiện tại
    methods: ['GET', 'POST']
  }
});

initSocket(io);

const PORT = process.env.PORT || 5000;   // nên dùng biến môi trường PORT
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});