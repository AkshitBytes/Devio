/**
 * classroom.controller.js  (FIXED)
 *
 * Key fixes:
 *  1. When a teacher joins, ALL pending requests are immediately re-emitted to them.
 *  2. `classroom:request_join` now stores the request FIRST, then tries to reach the
 *     teacher — so nothing is lost if the teacher joins later.
 *  3. Added `classroom:resend_request` so the student UI can retry without flooding.
 *  4. `classroom:approve_join` now casts userId to ObjectId before pushing + saving,
 *     and uses $addToSet via findByIdAndUpdate (atomic, no race) instead of push/save.
 */

import Classroom from "../models/classroom.model.js";
import mongoose from "mongoose";

// ─── In-memory real-time state ────────────────────────────────────────────────
const roomMembers     = new Map(); // Map<classroomId, Map<socketId, { userId, name, role }>>
const pendingRequests = new Map(); // Map<classroomId, Map<userId,  { name, socketId }>>
const teacherSockets  = new Map(); // Map<classroomId, socketId>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeJoinCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++)
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function generateUniqueCode() {
  for (let i = 0; i < 8; i++) {
    const code = makeJoinCode(6);
    if (!(await Classroom.findOne({ code }).select("_id").lean())) return code;
  }
  for (;;) {
    const code = makeJoinCode(8);
    if (!(await Classroom.findOne({ code }).select("_id").lean())) return code;
  }
}

function getRoom(classroomId) {
  if (!roomMembers.has(classroomId)) roomMembers.set(classroomId, new Map());
  return roomMembers.get(classroomId);
}

function broadcastPresence(io, classroomId) {
  const room = getRoom(classroomId);
  const members = [...room.values()].map(({ userId, name, role }) => ({
    userId,
    name,
    role,
  }));
  io.to(classroomId).emit("classroom:presence", { members });
}

/**
 * Flush every pending request for a classroom to the teacher's socket.
 * Called whenever a teacher (re-)joins so they never miss queued students.
 */
function flushPendingToTeacher(io, classroomId, teacherSocketId) {
  const pending = pendingRequests.get(classroomId);
  if (!pending || pending.size === 0) return;

  for (const [userId, req] of pending.entries()) {
    io.to(teacherSocketId).emit("classroom:join_request", {
      classroomId,
      userId,
      name: req.name,
      socketId: req.socketId,
    });
  }
}

function handleLeave(io, socket, classroomId) {
  const room = getRoom(classroomId);
  const info = room.get(socket.id);
  if (!info) return;

  room.delete(socket.id);

  if (info.role === "teacher" && teacherSockets.get(classroomId) === socket.id) {
    teacherSockets.delete(classroomId);
  }

  socket.leave(classroomId);

  io.to(classroomId).emit("classroom:notification", {
    type: "leave",
    message: `${info.name} left the class`,
    studentId: info.userId,
    studentName: info.name,
  });

  broadcastPresence(io, classroomId);
}

// ─── Socket handler ───────────────────────────────────────────────────────────

export function attachClassroomSocket(io) {
  io.on("connection", (socket) => {

    // ── Join room ─────────────────────────────────────────────────────────
    socket.on("classroom:join", ({ classroomId, userId, name, role }) => {
      const room = getRoom(classroomId);
      room.set(socket.id, { userId, name, role });
      socket.join(classroomId);

      if (role === "teacher") {
        teacherSockets.set(classroomId, socket.id);
        // Immediately send every queued student request to the teacher
        flushPendingToTeacher(io, classroomId, socket.id);
      }

      io.to(classroomId).emit("classroom:notification", {
        type: "join",
        message: `${name} joined the class`,
        studentId: userId,
        studentName: name,
      });

      broadcastPresence(io, classroomId);
    });

    // ── Student requests entry ────────────────────────────────────────────
    socket.on("classroom:request_join", ({ classroomId, userId, name }) => {
      if (!pendingRequests.has(classroomId))
        pendingRequests.set(classroomId, new Map());

      pendingRequests.get(classroomId).set(String(userId), {
        name,
        socketId: socket.id,
      });

      const teacherSocketId = teacherSockets.get(classroomId);
      if (teacherSocketId) {
        io.to(teacherSocketId).emit("classroom:join_request", {
          classroomId,
          userId,
          name,
          socketId: socket.id,
        });
      }
      // If teacher isn't connected yet, the request sits in pendingRequests
      // and will be flushed via flushPendingToTeacher when the teacher joins.
    });

    // ── Student re-sends request (retry button in UI) ─────────────────────
    socket.on("classroom:resend_request", ({ classroomId, userId, name }) => {
      if (!pendingRequests.has(classroomId))
        pendingRequests.set(classroomId, new Map());

      pendingRequests.get(classroomId).set(String(userId), {
        name,
        socketId: socket.id,
      });

      const teacherSocketId = teacherSockets.get(classroomId);
      if (teacherSocketId) {
        io.to(teacherSocketId).emit("classroom:join_request", {
          classroomId,
          userId,
          name,
          socketId: socket.id,
        });
      }
    });

    // ── Teacher approves entry ────────────────────────────────────────────
    socket.on("classroom:approve_join", async ({ classroomId, userId }) => {
      const pending = pendingRequests.get(classroomId);
      if (!pending) return;

      const req = pending.get(String(userId));
      if (!req) return;
      pending.delete(String(userId));

      try {
        // ✅ FIX: Use findByIdAndUpdate with $addToSet so the write is atomic
        // and avoids any ObjectId vs string mismatch from push(userId).
        let objectId;
        try {
          objectId = new mongoose.Types.ObjectId(String(userId));
        } catch (_) {
          io.to(req.socketId).emit("classroom:join_denied", {
            classroomId,
            message: "Invalid user ID",
          });
          return;
        }

        const updated = await Classroom.findByIdAndUpdate(
          classroomId,
          { $addToSet: { studentIds: objectId } },
          { new: true }
        );

        if (!updated) {
          io.to(req.socketId).emit("classroom:join_denied", {
            classroomId,
            message: "Classroom not found",
          });
          return;
        }

        // ✅ FIX: Small delay to ensure the write has propagated before the
        // student's frontend fetches GET /classrooms/:id. Mongo writes are
        // synchronous within a single node but this guards against any
        // replica-lag or connection-pool timing on the read side.
        await new Promise((res) => setTimeout(res, 150));

        io.to(req.socketId).emit("classroom:join_approved", { classroomId });
      } catch (err) {
        console.error("classroom:approve_join error:", err);
        io.to(req.socketId).emit("classroom:join_denied", {
          classroomId,
          message: "Approval failed",
        });
      }
    });

    // ── Teacher denies entry ──────────────────────────────────────────────
    socket.on("classroom:deny_join", ({ classroomId, userId }) => {
      const pending = pendingRequests.get(classroomId);
      if (!pending) return;
      const req = pending.get(String(userId));
      if (!req) return;
      pending.delete(String(userId));
      io.to(req.socketId).emit("classroom:join_denied", { classroomId });
    });

    // ── Activity broadcast ────────────────────────────────────────────────
    socket.on("classroom:activity", ({ classroomId, studentName, action }) => {
      socket.to(classroomId).emit("classroom:activity", { studentName, action });
    });

    // ── Chat relay ────────────────────────────────────────────────────────
    socket.on("chat:join", ({ classroomId }) => {
      if (classroomId) socket.join(classroomId);
    });

    socket.on("chat:message", (msg) => {
      if (!msg?.classroomId) return;
      try {
        socket.to(msg.classroomId).emit("chat:message", msg);
      } catch (_) {}
    });

    // ── Teacher kicks a student ───────────────────────────────────────────
    socket.on("classroom:kick", ({ classroomId, studentId }) => {
      const room = getRoom(classroomId);
      for (const [sid, info] of room.entries()) {
        if (String(info.userId) === String(studentId)) {
          io.to(sid).emit("classroom:kicked", { studentId });
          const targetSocket = io.sockets.sockets.get(sid);
          if (targetSocket) targetSocket.leave(classroomId);
          room.delete(sid);
          break;
        }
      }
      io.to(classroomId).emit("classroom:notification", {
        type: "kick",
        message: "A student was removed from the class",
        studentId,
      });
      broadcastPresence(io, classroomId);
    });

    // ── Teacher ends the class ────────────────────────────────────────────
    socket.on("classroom:end", ({ classroomId }) => {
      io.to(classroomId).emit("classroom:ended", { classroomId });
      io.to(classroomId).emit("classroom:notification", {
        type: "end",
        message: "The teacher has ended this class session.",
      });
      roomMembers.delete(classroomId);
      teacherSockets.delete(classroomId);
      pendingRequests.delete(classroomId);
    });

    // ── Explicit leave ────────────────────────────────────────────────────
    socket.on("classroom:leave", ({ classroomId }) => {
      handleLeave(io, socket, classroomId);
    });

    // ── Disconnect ────────────────────────────────────────────────────────
    socket.on("disconnecting", () => {
      for (const classroomId of socket.rooms) {
        if (classroomId === socket.id) continue;
        handleLeave(io, socket, classroomId);
      }
    });
  });
}

// ─── REST Controllers ─────────────────────────────────────────────────────────

export const createClassroom = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim())
      return res.status(400).json({ message: "Class name is required" });

    const code = await generateUniqueCode();
    const classroom = await Classroom.create({
      name: String(name).trim(),
      code,
      teacherId: req.user._id,
      studentIds: [],
      isActive: true,
    });
    return res.status(201).json({ message: "Classroom created", classroom });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const listTeacherClassrooms = async (req, res) => {
  try {
    const classrooms = await Classroom.find({ teacherId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ classrooms });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const listStudentClassrooms = async (req, res) => {
  try {
    const classrooms = await Classroom.find({ studentIds: req.user._id })
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ classrooms });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const joinClassroom = async (req, res) => {
  try {
    const { code } = req.body;
    const joinCode = String(code || "").trim().toUpperCase();
    if (!joinCode)
      return res.status(400).json({ message: "Classroom code is required" });

    const classroom = await Classroom.findOne({ code: joinCode });
    if (!classroom)
      return res.status(404).json({ message: "Invalid classroom code" });

    const already = classroom.studentIds.some(
      (id) => String(id) === String(req.user._id)
    );
    if (!already) {
      classroom.studentIds.push(req.user._id);
      await classroom.save();
    }
    return res.json({ message: "Joined classroom", classroom });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const requestJoinClassroom = async (req, res) => {
  try {
    const { code } = req.body;
    const joinCode = String(code || "").trim().toUpperCase();
    if (!joinCode)
      return res.status(400).json({ message: "Classroom code is required" });

    const classroom = await Classroom.findOne({ code: joinCode }).lean();
    if (!classroom)
      return res.status(404).json({ message: "Invalid classroom code" });

    const isTeacher =
      String(classroom.teacherId) === String(req.user._id);
    const isStudent = (classroom.studentIds || []).some(
      (id) => String(id) === String(req.user._id)
    );
    if (isTeacher || isStudent)
      return res.json({ message: "Already a member", classroom });

    return res.json({
      classroom: {
        _id: classroom._id,
        name: classroom.name,
        code: classroom.code,
      },
    });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const getClassroom = async (req, res) => {
  try {
    const { classroomId } = req.params;
    const classroom = await Classroom.findById(classroomId).lean();
    if (!classroom)
      return res.status(404).json({ message: "Classroom not found" });

    const isTeacher =
      String(classroom.teacherId) === String(req.user._id);
    const isStudent = (classroom.studentIds || []).some(
      (id) => String(id) === String(req.user._id)
    );
    if (!isTeacher && !isStudent)
      return res.status(403).json({ message: "Access denied" });

    return res.json({ classroom });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const endClassroom = async (req, res) => {
  try {
    const { classroomId } = req.params;
    const classroom = await Classroom.findById(classroomId);
    if (!classroom)
      return res.status(404).json({ message: "Classroom not found" });
    if (String(classroom.teacherId) !== String(req.user._id))
      return res
        .status(403)
        .json({ message: "Only the teacher can end the class" });

    classroom.isActive = false;
    await classroom.save();
    return res.json({ message: "Class ended" });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: e.message });
  }
};

export const kickStudent = async (req, res) => {
  try {
    const { classroomId, studentId } = req.params;
    const classroom = await Classroom.findById(classroomId);
    if (!classroom)
      return res.status(404).json({ message: "Classroom not found" });
    if (String(classroom.teacherId) !== String(req.user._id))
      return res
        .status(403)
        .json({ message: "Only the teacher can kick students" });

    classroom.studentIds = classroom.studentIds.filter(
      (id) => String(id) !== String(studentId)
    );
    await classroom.save();
    return res.json({ message: "Student kicked" });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: e.message });
  }
};