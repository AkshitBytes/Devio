import Battle from "../models/battle.model.js";
import { getAllQuestions } from "../services/questions.service.js";
import { handleBattleSubmit } from "../controllers/battle.controller.js";
import { awardBattleResult, markUserActive } from "../services/stats.service.js";

const normalizeId = (id) => String(id ?? "").trim();

// ── Only used as fallback if battle was created without questions ──
const DIFF_MAP = {
    Novice: ["Easy"],
    Master: ["Easy", "Medium"],
    Elite:  ["Medium", "Hard"],
    Easy:   ["Easy"],
    Medium: ["Easy", "Medium"],
    Hard:   ["Medium", "Hard"],
};

function pickBattleQuestions(count = 3, difficulty = "Novice") {
    const all = getAllQuestions();
    const allowed = DIFF_MAP[difficulty] || ["Easy"];
    let pool = all.filter((q) => allowed.includes(q.difficulty));
    if (pool.length < count) pool = all;
    const take = Math.min(count, pool.length);
    return pool
        .sort(() => 0.5 - Math.random())
        .slice(0, take)
        .map((q) => q.id);
}

export function registerBattleSocket(io) {
    const battleNs = io.of("/battle");

    battleNs.on("connection", (socket) => {
        console.log("Battle socket connected:", socket.id);

        // ── Helper: finish a battle, award points, emit result ──
        async function finishBattle(battle, winnerId, { forfeit = false } = {}) {
            if (battle.winnerAwarded) return; // already processed

            const normalizedWinnerId = normalizeId(winnerId);
            const loser = battle.players.find(p => normalizeId(p.userId) !== normalizedWinnerId);
            const normalizedLoserId = loser ? normalizeId(loser.userId) : null;

            battle.status        = "finished";
            battle.winnerId      = normalizedWinnerId;
            battle.finishedAt    = new Date();
            battle.winnerAwarded = true;
            await battle.save();

            // Award points — booster comes from the battle record itself
            const { winPoints, lossPoints } = await awardBattleResult(
                normalizedWinnerId,
                normalizedLoserId,
                battle.streakBooster  // ← reads the flag saved at battle creation
            );

            battleNs.to(battle._id.toString()).emit("battle_finished", {
                winnerId: normalizedWinnerId,
                battle,
                pointsAwarded: { winPoints, lossPoints },
                forfeit,
            });
        }

        // ── start_battle (manual trigger from creator, kept for safety) ──
        socket.on("start_battle", async ({ battleId }) => {
            try {
                const battle = await Battle.findById(battleId);
                if (!battle) return socket.emit("error", { message: "Battle not found" });

                const activePlayers = battle.players.filter((p) => p.socketId);
                if (activePlayers.length < 2)
                    return socket.emit("error", { message: "Opponent not connected yet" });

                // Already active — just re-sync clients
                if (battle.status === "active" && battle.questions?.length > 0) {
                    battleNs.to(battleId).emit("battle_started", { battle });
                    return;
                }

                if (battle.status !== "waiting")
                    return socket.emit("error", { message: "Battle already started or finished" });

                // Only pick questions if not already assigned by createBattle
                if (!battle.questions?.length) {
                    battle.questions = pickBattleQuestions(
                        battle.problemCount || 3,
                        battle.difficulty || "Novice"
                    );
                }
                battle.status    = "active";
                battle.startedAt = new Date();
                await battle.save();

                battleNs.to(battleId).emit("battle_started", { battle });
            } catch (e) {
                console.error("start_battle error:", e);
                socket.emit("error", { message: e.message });
            }
        });

        // ── join_battle_room ──
        socket.on("join_battle_room", async ({ battleId, userId }) => {
            try {
                const battle = await Battle.findById(battleId);
                if (!battle) return socket.emit("error", { message: "Battle not found" });

                const normalizedUserId = normalizeId(userId);
                let player = battle.players.find((p) => normalizeId(p.userId) === normalizedUserId);

                if (player) {
                    player.socketId = socket.id;
                } else {
                    battle.players.push({
                        userId: normalizedUserId,
                        username: "Player",
                        socketId: socket.id,
                        solvedQuestions: [],
                        points: 0,
                    });
                    player = battle.players.find((p) => normalizeId(p.userId) === normalizedUserId);
                }
                await battle.save();

                socket.join(battleId);
                socket.emit("joined", { battle });

                // Notify others
                socket.to(battleId).emit("player_joined", {
                    userId: normalizedUserId,
                    username: player?.username,
                });

                // Auto-start when 2 players are connected
                const fresh = await Battle.findById(battleId);
                const activePlayers = (fresh?.players || []).filter((p) => p.socketId);

                if (fresh && fresh.status === "waiting" && activePlayers.length >= 2) {
                    // Reuse questions picked at createBattle; only pick if missing
                    if (!fresh.questions?.length) {
                        fresh.questions = pickBattleQuestions(
                            fresh.problemCount || 3,
                            fresh.difficulty || "Novice"
                        );
                    }
                    fresh.status    = "active";
                    fresh.startedAt = new Date();
                    await fresh.save();
                    battleNs.to(battleId).emit("battle_started", { battle: fresh });
                    return;
                }

                // Sync a reconnecting player into an already-active battle
                if (fresh && fresh.status === "active" && fresh.questions?.length > 0) {
                    socket.emit("battle_started", { battle: fresh });
                }
            } catch (e) {
                console.error("join_battle_room error:", e);
                socket.emit("error", { message: e.message });
            }
        });

        // ── submit_code ──
        socket.on("submit_code", async ({ battleId, userId, questionId, source_code, language_id }) => {
            try {
                await markUserActive(userId);
                socket.to(battleId).emit("opponent_submitting", { questionId });

                const result = await handleBattleSubmit(
                    battleId, userId, questionId, source_code, language_id
                );

                if (result.error)
                    return socket.emit("submit_result", { error: result.error });

                socket.emit("submit_result", {
                    questionId,
                    passed:    result.passed,
                    total:     result.total,
                    allPassed: result.allPassed,
                    details:   result.details,
                });

                battleNs.to(battleId).emit("battle_update", { battle: result.battle });

                // If the submission finished the battle, award points
                if (result.battle.status === "finished" && result.battle.winnerId) {
                    await finishBattle(result.battle, result.battle.winnerId);
                }
            } catch (e) {
                console.error("submit_code error:", e);
                socket.emit("error", { message: e.message });
            }
        });

        // ── chat_message ──
        socket.on("chat_message", ({ battleId, userId, username, message }) => {
            battleNs.to(battleId).emit("chat_message", {
                userId,
                username,
                message,
                timestamp: new Date().toISOString(),
            });
        });

        // ── forfeit_battle ──
        socket.on("forfeit_battle", async ({ battleId, userId }) => {
            try {
                const battle = await Battle.findById(battleId);
                if (!battle || battle.status !== "active") return;

                const normalizedForfeiter = normalizeId(userId);
                await markUserActive(normalizedForfeiter);

                const winner = battle.players.find(
                    (p) => normalizeId(p.userId) !== normalizedForfeiter
                );
                if (!winner) return;

                await finishBattle(battle, normalizeId(winner.userId), { forfeit: true });
            } catch (e) {
                console.error("forfeit_battle error:", e);
                socket.emit("error", { message: e.message });
            }
        });

        // ── disconnect ──
        socket.on("disconnect", async () => {
            try {
                const battle = await Battle.findOne({
                    "players.socketId": socket.id,
                    status: { $in: ["waiting", "active"] },
                });
                if (battle) {
                    const player = battle.players.find((p) => p.socketId === socket.id);
                    if (player) {
                        player.socketId = "";
                        await battle.save();
                        battleNs
                            .to(battle._id.toString())
                            .emit("player_disconnected", { userId: player.userId });
                    }
                }
            } catch (e) {
                console.error("Disconnect cleanup error:", e.message);
            }
        });
    });
}