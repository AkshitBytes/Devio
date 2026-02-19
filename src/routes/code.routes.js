import express from "express"
import { runCode } from "../controllers/code.controller.js"
import { protect, studentsonly } from "../middlewares/auth.middleware.js"

const router = express.Router()

router.post("/run", protect, studentsonly, runCode)

export default router
