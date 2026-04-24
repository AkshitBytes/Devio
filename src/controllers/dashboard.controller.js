import Battle from "../models/battle.model.js";
import usermodel from "../models/user.js";
import { getAllQuestions } from "../services/questions.service.js";
import { markUserActive } from "../services/stats.service.js";

const normalizeId = (id) => String(id ?? "").trim();

const getDifficultyCount = (questions, solvedIds) => {
    const solvedSet = new Set(solvedIds || []);
    const counts = { Easy: 0, Medium: 0, Hard: 0 };
    questions.forEach((q) => {
        if (solvedSet.has(q.id) && counts[q.difficulty] !== undefined) counts[q.difficulty] += 1;
    });
    return counts;
};

export const studentDashboard = async (req, res) => {
    try {
        await markUserActive(req.user._id);
        const freshUser = await usermodel.findById(req.user._id).select("-password");
        const allQuestions = getAllQuestions();
        const solvedIds = freshUser?.solvedQuestionIds || [];
        const difficulty = getDifficultyCount(allQuestions, solvedIds);

        const userId = normalizeId(freshUser?._id);

        // Count ALL battles the user participated in (not just finished)
        const totalBattles = await Battle.countDocuments({
            "players.userId": userId,
            status: "finished",
        });

        const recentBattles = await Battle.find({
            "players.userId": userId,
            status: "finished",
        }).sort({ finishedAt: -1 }).limit(8);

        const matchHistory = recentBattles.map((battle) => {
            const me = battle.players.find((p) => normalizeId(p.userId) === userId);
            const opp = battle.players.find((p) => normalizeId(p.userId) !== userId);
            const result = normalizeId(battle.winnerId) === userId ? "win" : "loss";
            const started = battle.startedAt ? new Date(battle.startedAt) : null;
            const finished = battle.finishedAt ? new Date(battle.finishedAt) : null;
            const durationSecs = started && finished
                ? Math.max(0, Math.floor((finished - started) / 1000))
                : 0;

            return {
                id: battle._id,
                opponent: opp?.username || "Unknown",
                opponentAvatar: (opp?.username || "U").charAt(0).toUpperCase(),
                result,
                score: `${me?.solvedQuestions?.length || 0}/${battle.questions?.length || 0}`,
                oppScore: `${opp?.solvedQuestions?.length || 0}/${battle.questions?.length || 0}`,
                duration: `${String(Math.floor(durationSecs / 60)).padStart(2, "0")}:${String(durationSecs % 60).padStart(2, "0")}`,
                date: finished ? finished.toISOString() : null,
                xpGained: result === "win" ? 200 : 50,
                myPoints: me?.points || 0,
                oppPoints: opp?.points || 0,
            };
        });

        const recommendedProblems = allQuestions
            .filter((q) => !solvedIds.includes(q.id))
            .slice(0, 12)
            .map((q) => ({
                id: q.id,
                title: q.title,
                difficulty: q.difficulty,
                points: q.points,
                tag: q.tags?.[0] || "General",
            }));

        res.status(200).json({
            message: "welcome student",
            user: {
                id: freshUser._id,
                name: freshUser.name,
                role: freshUser.role,
                points: freshUser.points || 0,
                battlesWon: freshUser.battlesWon || 0,
                questionsSolved: freshUser.questionsSolved || 0,
                streak: freshUser.streak || 0,
                longestStreak: freshUser.longestStreak || 0,
                activityDates: freshUser.activityDates || [],
            },
            stats: {
                totalPoints: freshUser.points || 0,
                battlesWon: freshUser.battlesWon || 0,
                questionsSolved: freshUser.questionsSolved || 0,
                totalQuestionsAvailable: allQuestions.length,
                streak: freshUser.streak || 0,
                longestStreak: freshUser.longestStreak || 0,
                totalBattles,
                solvedByDifficulty: difficulty,
            },
            recommendedProblems,
            matchHistory,
        });
    } catch (e) {
        res.status(500).json({
            message: "Server error",
            error: e.message,
        });
    }
};

export const getLeaderboard = async (req, res) => {
    try {
        const sortBy = req.query.sortBy || "points";
        const range = req.query.range || "global";
        const now = new Date();
        let fromDate = null;
        if (range === "weekly") fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (range === "monthly") fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Fetch ALL students regardless of points
        const students = await usermodel
            .find({ role: { $ne: "teacher" } }) // exclude teachers if you have roles
            .select("name email points battlesWon questionsSolved streak activityDates createdAt");

        const ranked = students
            .map((s) => {
                const activeDates = (s.activityDates || []).filter((d) => {
                    if (!fromDate) return true;
                    return new Date(`${d}T00:00:00.000Z`) >= fromDate;
                });
                const rangeScore = fromDate
                    ? activeDates.length * 5 + (s.battlesWon || 0) * 20 + (s.questionsSolved || 0) * 3
                    : s.points || 0;
                return {
                    id: s._id,
                    name: s.name,
                    email: s.email,
                    avatar: (s.name || "U").charAt(0).toUpperCase(),
                    country: "IN",
                    points: s.points || 0,
                    wins: s.battlesWon || 0,
                    solved: s.questionsSolved || 0,
                    streak: s.streak || 0,
                    rangeScore,
                };
            })
            .sort((a, b) => {
                if (sortBy === "wins") return b.wins - a.wins || b.points - a.points;
                if (sortBy === "solved") return b.solved - a.solved || b.points - a.points;
                // Default: sort by rangeScore (points for global), then streak tiebreak
                return b.rangeScore - a.rangeScore || b.streak - a.streak;
            })
            .map((p, idx) => ({ ...p, rank: idx + 1 }));

        const me = ranked.find((p) => normalizeId(p.id) === normalizeId(req.user._id)) || null;

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        res.status(200).json({
            players: ranked,
            me,
            stats: {
                totalPlayers: ranked.length,
                topScore: ranked[0]?.points || 0,
                avgPoints: ranked.length
                    ? Math.round(ranked.reduce((sum, p) => sum + p.points, 0) / ranked.length)
                    : 0,
                battlesToday: await Battle.countDocuments({
                    createdAt: { $gte: todayStart },
                }),
            },
        });
    } catch (e) {
        res.status(500).json({ message: "Failed to load leaderboard", error: e.message });
    }
};

export const teacherDashboard = async (req, res) => {
    res.json({
        message: "welcome Teacher",
        user: req.user,
    });
};