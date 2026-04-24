import express from "express"
import { protect, studentsonly } from "../middlewares/auth.middleware.js"
import { getHistory } from "../controllers/submission.controller.js"

const router = express.Router()

router.get("/history", protect, studentsonly, getHistory)

export default router
