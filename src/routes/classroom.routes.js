import express from "express";
import { protect, studentsonly, teachersonly } from "../middlewares/auth.middleware.js";
import {
  createClassroom,
  getClassroom,
  joinClassroom,
  listStudentClassrooms,
  listTeacherClassrooms,
} from "../controllers/classroom.controller.js";

const router = express.Router();

router.post("/", protect, teachersonly, createClassroom);
router.get("/teacher", protect, teachersonly, listTeacherClassrooms);

router.post("/join", protect, studentsonly, joinClassroom);
router.get("/student", protect, studentsonly, listStudentClassrooms);

router.get("/:classroomId", protect, getClassroom);

export default router;

