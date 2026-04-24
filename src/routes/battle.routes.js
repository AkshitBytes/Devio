import express from "express";
import { createBattle, joinBattle, getBattle, getBattleByCode } from "../controllers/battle.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/create", protect, createBattle);
router.post("/join", protect, joinBattle);
router.get("/code/:code", protect, getBattleByCode);
router.get("/:id", protect, getBattle);

export default router;
