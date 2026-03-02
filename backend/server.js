import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { connectDB } from "./src/config/db.js";
import roomRoutes from "./src/routes/Room.js";
import initSocket from "./src/socket/index.js";

connectDB();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/rooms", roomRoutes);

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

initSocket(io);

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});