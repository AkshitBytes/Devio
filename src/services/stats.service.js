import usermodel from "../models/user.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const normalizeId = (value) => String(value ?? "").trim();

const toDateKey = (date = new Date()) => date.toISOString().slice(0, 10);

const dayDiff = (fromKey, toKey) => {
    const from = new Date(`${fromKey}T00:00:00.000Z`);
    const to = new Date(`${toKey}T00:00:00.000Z`);
    return Math.round((to.getTime() - from.getTime()) / DAY_MS);
};

export const markUserActive = async (userId, at = new Date()) => {
    const user = await usermodel.findById(userId);
    if (!user) return null;

    const todayKey = toDateKey(at);
    const wasAlreadyMarkedToday = user.lastActiveDate === todayKey;

    if (!wasAlreadyMarkedToday) {
        if (!user.lastActiveDate) {
            user.streak = 1;
        } else {
            const diff = dayDiff(user.lastActiveDate, todayKey);
            if (diff === 1) user.streak += 1;
            else if (diff > 1) user.streak = 1;
        }

        if (!user.activityDates.includes(todayKey)) {
            user.activityDates.push(todayKey);
        }
        user.lastActiveDate = todayKey;
        user.longestStreak = Math.max(user.longestStreak || 0, user.streak || 0);
        await user.save();
    }

    return user;
};

export const awardQuestionSolve = async (userId, questionId, points) => {
    await markUserActive(userId);
    const user = await usermodel.findById(userId);
    if (!user) return null;
    const normalizedQid = normalizeId(questionId);
    const solvedSet = new Set((user.solvedQuestionIds || []).map(normalizeId));

    if (!solvedSet.has(normalizedQid)) {
        user.solvedQuestionIds.push(normalizedQid);
        user.questionsSolved += 1;
        user.points += points;
        await user.save();
    }

    return user;
};

export const awardBattleWin = async (userId, bonusPoints = 100) => {
    await markUserActive(userId);
    const user = await usermodel.findById(userId);
    if (!user) return null;

    user.battlesWon += 1;
    user.points += bonusPoints;
    await user.save();

    return user;
};
