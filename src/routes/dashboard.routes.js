import express from "express"
import { protect, studentsonly, teachersonly } from "../middlewares/auth.middleware.js"
import { studentDashboard, teacherDashboard } from "../controllers/dashboard.controller.js"

const router = express.Router();
router.get("/student",protect,studentsonly,studentDashboard)
router.get("/teacher",protect,teachersonly,teacherDashboard)

export default router;