import mongoose from "mongoose";

const playerSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    username: { type: String, required: true },
    socketId: { type: String, default: "" },
    solvedQuestions: { type: [String], default: [] },
    points: { type: Number, default: 0 },
    finishedAt: { type: Date, default: null },
    ready: { type: Boolean, default: false },
});

const battleSchema = new mongoose.Schema({
    inviteCode: { type: String, required: true, unique: true },
    status: {
        type: String,
        enum: ["waiting", "active", "finished"],
        default: "waiting",
    },
    players: { type: [playerSchema], default: [] },
    questions: { type: [String], default: [] },
    winnerId: { type: String, default: null },
    winnerAwarded: { type: Boolean, default: false },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },

    // ── Battle config ──
    // Accepts frontend labels (Novice/Master/Elite) OR question-level labels (Easy/Medium/Hard)
    difficulty: {
        type: String,
        default: "Novice",
        enum: ["Novice", "Master", "Elite", "Easy", "Medium", "Hard"],
    },
    problemCount: { type: Number, default: 3, min: 1, max: 10 },
    timeLimit: { type: Number, default: 30, min: 5, max: 60 }, // minutes
    streakBooster: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

const Battle = mongoose.model("Battle", battleSchema);
export default Battle;