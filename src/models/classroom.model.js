import mongoose from "mongoose";

const classroomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "users" }],
    status: { type: String, enum: ["active", "ended"], default: "active" },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Classroom = mongoose.model("classrooms", classroomSchema);
export default Classroom;

