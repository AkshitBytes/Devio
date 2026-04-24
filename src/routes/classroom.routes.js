import express from "express";
import { protect, teachersonly, studentsonly } from "../middlewares/auth.middleware.js";

import {
  createClassroom,
  listTeacherClassrooms,
  listStudentClassrooms,
  joinClassroom,
  requestJoinClassroom,
  getClassroom,
  endClassroom,
  kickStudent,
} from "../controllers/classroom.controller.js";

const router = express.Router();

// -------------------- TEACHER ROUTES --------------------

// Create classroom (teacher only)
router.post("/", protect, teachersonly, createClassroom);

// Get all classrooms created by teacher
router.get("/teacher", protect, teachersonly, listTeacherClassrooms);

// End classroom
router.post("/:classroomId/end", protect, teachersonly, endClassroom);

// Kick a student
router.delete(
  "/:classroomId/students/:studentId",
  protect,
  teachersonly,
  kickStudent
);

// -------------------- STUDENT ROUTES --------------------

// Get all joined classrooms
router.get("/student", protect, studentsonly, listStudentClassrooms);

// Request to join a classroom (teacher approval required)
router.post("/request-join", protect, studentsonly, requestJoinClassroom);

// Join classroom
router.post("/join", protect, studentsonly, joinClassroom);

// -------------------- COMMON --------------------

// Get single classroom (both can access)
router.get("/:classroomId", protect, getClassroom);

export default router;