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

// CORS - cho phép mọi origin
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

// Routes API
app.use("/api/rooms", roomRoutes);

// Phục vụ file tĩnh từ thư mục dist
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'dist')));

// Fallback: tất cả các request GET không phải API và không phải file tĩnh
// sẽ trả về index.html để React Router xử lý
app.use((req, res, next) => {
  if (req.method === 'GET') {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    res.status(404).send('Not found');
  }
});

// Khởi tạo Socket.IO với CORS linh hoạt
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST']
  }
});

initSocket(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});