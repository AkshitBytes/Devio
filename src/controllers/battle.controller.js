import Battle from "../models/battle.model.js";
import { getTestcase } from "../services/questions.service.js";
import { runjudge0 } from "../services/judge0.service.js";
import { getAllQuestions } from "../services/questions.service.js";
import { awardQuestionSolve } from "../services/stats.service.js";
import usermodel from "../models/user.js";

const normalize = (str) => str.trim().replace(/\s+/g, " ");
const normalizeId = (id) => String(id ?? "").trim();

function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Map frontend difficulty labels → question difficulty values
const DIFF_MAP = {
    Novice: ["Easy"],
    Master: ["Easy", "Medium"],
    Elite:  ["Medium", "Hard"],
    // passthrough in case backend values are sent directly
    Easy:   ["Easy"],
    Medium: ["Easy", "Medium"],
    Hard:   ["Medium", "Hard"],
};

function pickBattleQuestions(count = 3, difficulty = "Novice") {
    const all = getAllQuestions();
    if (!all || all.length === 0) {
        throw new Error("No questions available in the question bank");
    }

    const allowed = DIFF_MAP[difficulty] || ["Easy"];
    let pool = all.filter((q) => allowed.includes(q.difficulty));

    // Fallback: if pool is too small, use all questions
    if (pool.length < count) {
        console.warn(
            `Not enough questions for difficulty "${difficulty}" (need ${count}, have ${pool.length}). Falling back to full pool.`
        );
        pool = all;
    }

    // Still not enough? just take what we have
    const take = Math.min(count, pool.length);

    return pool
        .sort(() => 0.5 - Math.random())
        .slice(0, take)
        .map((q) => q.id);
}

// ─── REST endpoints ──────────────────────────────────────────────
export const createBattle = async (req, res) => {
    try {
        const {
            userId,
            username,
            difficulty = "Novice",
            problemCount = 3,
            timeLimit = 30,
            streakBooster = false,
        } = req.body;

        if (!userId || !username)
            return res.status(400).json({ message: "userId and username required" });

        const inviteCode = generateCode();

        // Pick questions up-front so they're ready when battle starts
        let questions;
        try {
            questions = pickBattleQuestions(Number(problemCount), difficulty);
        } catch (qErr) {
            console.error("pickBattleQuestions error:", qErr.message);
            return res.status(500).json({ message: qErr.message });
        }

        if (!questions.length) {
            return res.status(500).json({ message: "Could not select questions for this battle" });
        }

        const battle = await Battle.create({
            inviteCode,
            players: [{ userId: normalizeId(userId), username, ready: false }],
            questions,
            difficulty,
            problemCount: Number(problemCount),
            timeLimit: Number(timeLimit),
            streakBooster: Boolean(streakBooster),
        });

        res.status(201).json({ battle });
    } catch (e) {
        console.error("createBattle error:", e);
        res.status(500).json({ message: "Failed to create battle", error: e.message });
    }
};

export const joinBattle = async (req, res) => {
    try {
        const { userId, username, inviteCode } = req.body;
        if (!userId || !username || !inviteCode)
            return res.status(400).json({ message: "userId, username, inviteCode required" });

        const battle = await Battle.findOne({ inviteCode, status: "waiting" });
        if (!battle) return res.status(404).json({ message: "Battle not found or already started" });

        const normalizedUserId = normalizeId(userId);
        const alreadyIn = battle.players.find((p) => normalizeId(p.userId) === normalizedUserId);
        if (!alreadyIn) {
            battle.players.push({ userId: normalizedUserId, username, ready: false });
        }

        await battle.save();
        res.status(200).json({ battle });
    } catch (e) {
        console.error("joinBattle error:", e);
        res.status(500).json({ message: "Failed to join battle", error: e.message });
    }
};

export const getBattle = async (req, res) => {
    try {
        const battle = await Battle.findById(req.params.id);
        if (!battle) return res.status(404).json({ message: "Battle not found" });
        res.status(200).json({ battle });
    } catch (e) {
        res.status(500).json({ message: "Failed to get battle", error: e.message });
    }
};

export const getBattleByCode = async (req, res) => {
    try {
        const battle = await Battle.findOne({ inviteCode: req.params.code });
        if (!battle) return res.status(404).json({ message: "Battle not found" });
        res.status(200).json({ battle });
    } catch (e) {
        res.status(500).json({ message: "Failed to get battle", error: e.message });
    }
};

// ─── Used by socket layer to submit a question ───────────────────
export async function handleBattleSubmit(battleId, userId, questionId, source_code, language_id) {
    const battle = await Battle.findById(battleId);
    if (!battle || battle.status !== "active") return { error: "Battle not active" };

    const normalizedUserId = normalizeId(userId);
    const player = battle.players.find((p) => normalizeId(p.userId) === normalizedUserId);
    if (!player) return { error: "Player not in battle" };
    if (player.solvedQuestions.includes(questionId)) return { error: "Already solved" };

    const tc = getTestcase(questionId);
    if (!tc) return { error: "Testcase not found" };

    let passed = 0;
    const details = [];
    for (const hidden of tc.hidden) {
        const result = await runjudge0(source_code, language_id, hidden.input);
        const got = result.stdout || result.stderr || result.compile_output || "";
        const ok = normalize(got) === normalize(hidden.output);
        if (ok) passed++;
        details.push({ input: hidden.input, expected: hidden.output, got: got.trim(), passed: ok });
    }

    const allPassed = passed === tc.hidden.length;

    if (allPassed) {
        const q = getAllQuestions().find((q) => q.id === questionId);
        player.solvedQuestions.push(questionId);
        player.points += q?.points || 50;
        await awardQuestionSolve(normalizedUserId, questionId, q?.points || 50);

        const allSolved = battle.questions.every((qId) => player.solvedQuestions.includes(qId));
        if (allSolved && !battle.winnerId) {
            battle.winnerId = normalizedUserId;
            battle.status = "finished";
            battle.finishedAt = new Date();
            player.finishedAt = new Date();
            battle.winnerAwarded = true;
        }

        await battle.save();
    }

    return { passed, total: tc.hidden.length, allPassed, details, battle };
}