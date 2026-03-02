import express from "express";
import RoomController from "../controllers/Room.js";

const router = express.Router();

router.post("/create", RoomController.createRoom);
router.post("/join", RoomController.joinRoom);
router.patch("/end/:roomCode", RoomController.endRoom);

export default router;