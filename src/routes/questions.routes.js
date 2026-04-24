import express from "express";
import { listQuestions, getQuestion, runQuestion, submitQuestion } from "../controllers/questions.controller.js";
import { protect, studentsonly } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", protect, studentsonly, listQuestions);
router.get("/:id", protect, studentsonly, getQuestion);
router.post("/:id/run", protect, studentsonly, runQuestion);
router.post("/:id/submit", protect, studentsonly, submitQuestion);

export default router;
