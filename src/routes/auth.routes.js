import express from "express"
import { signup, signin, dashboard } from "../controllers/auth.controller.js"
import { protect, teachersonly, studentsonly } from "../middlewares/auth.middleware.js"
const router = express.Router()

router.post('/signup',signup)
router.post('/signin',signin)
router.get('/dashboard',protect,dashboard)
router.get("/teacher-dashboard", protect, teachersonly, dashboard)
router.get("/student-dashboard", protect, studentsonly, dashboard)

export default router
