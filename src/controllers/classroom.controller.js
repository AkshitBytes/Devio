import Classroom from "../models/classroom.model.js";

function makeJoinCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // avoid confusing chars
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function generateUniqueCode() {
  // retry a few times (collision is extremely unlikely)
  for (let i = 0; i < 8; i++) {
    const code = makeJoinCode(6);
    const exists = await Classroom.findOne({ code }).select("_id").lean();
    if (!exists) return code;
  }
  // fallback: add extra length
  for (;;) {
    const code = makeJoinCode(8);
    const exists = await Classroom.findOne({ code }).select("_id").lean();
    if (!exists) return code;
  }
}

export const createClassroom = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Class name is required" });
    }

    const code = await generateUniqueCode();
    const classroom = await Classroom.create({
      name: String(name).trim(),
      code,
      teacherId: req.user._id,
      studentIds: [],
    });

    return res.status(201).json({
      message: "Classroom created",
      classroom,
    });
  } catch (e) {
    return res.status(500).json({ message: "some server error", error: e.message });
  }
};

export const listTeacherClassrooms = async (req, res) => {
  try {
    const classrooms = await Classroom.find({ teacherId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ classrooms });
  } catch (e) {
    return res.status(500).json({ message: "some server error", error: e.message });
  }
};

export const listStudentClassrooms = async (req, res) => {
  try {
    const classrooms = await Classroom.find({ studentIds: req.user._id })
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ classrooms });
  } catch (e) {
    return res.status(500).json({ message: "some server error", error: e.message });
  }
};

export const joinClassroom = async (req, res) => {
  try {
    const { code } = req.body;
    const joinCode = String(code || "").trim().toUpperCase();
    if (!joinCode) return res.status(400).json({ message: "Classroom code is required" });

    const classroom = await Classroom.findOne({ code: joinCode });
    if (!classroom) return res.status(404).json({ message: "Invalid classroom code" });

    const already = classroom.studentIds.some((id) => String(id) === String(req.user._id));
    if (!already) {
      classroom.studentIds.push(req.user._id);
      await classroom.save();
    }

    return res.json({ message: "Joined classroom", classroom });
  } catch (e) {
    return res.status(500).json({ message: "some server error", error: e.message });
  }
};

export const getClassroom = async (req, res) => {
  try {
    const { classroomId } = req.params;
    const classroom = await Classroom.findById(classroomId).lean();
    if (!classroom) return res.status(404).json({ message: "Classroom not found" });

    const isTeacher = String(classroom.teacherId) === String(req.user._id);
    const isStudent = (classroom.studentIds || []).some((id) => String(id) === String(req.user._id));
    if (!isTeacher && !isStudent) return res.status(403).json({ message: "Access denied" });

    return res.json({ classroom });
  } catch (e) {
    return res.status(500).json({ message: "some server error", error: e.message });
  }
};

