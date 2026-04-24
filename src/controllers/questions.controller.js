import { getAllQuestions, getQuestionById, getTestcase } from "../services/questions.service.js";
import { runjudge0 } from "../services/judge0.service.js";
import { awardQuestionSolve } from "../services/stats.service.js";

const normalize = (str) => str.trim().replace(/\s+/g, " ");

export const listQuestions = (req, res) => {
    try {
        const questions = getAllQuestions();
        const solved = new Set(req.user?.solvedQuestionIds || []);
        const enriched = questions.map((q) => ({
            ...q,
            isSolved: solved.has(q.id),
        }));
        res.status(200).json(enriched);
    } catch (e) {
        res.status(500).json({ message: "Failed to load questions", error: e.message });
    }
};

export const getQuestion = (req, res) => {
    try {
        const question = getQuestionById(req.params.id);
        if (!question) return res.status(404).json({ message: "Question not found" });

        const tc = getTestcase(req.params.id);
        const solved = (req.user?.solvedQuestionIds || []).includes(req.params.id);
        res.status(200).json({ ...question, isSolved: solved, visible: tc?.visible || [] });
    } catch (e) {
        res.status(500).json({ message: "Failed to load question", error: e.message });
    }
};
export const runQuestion = async (req, res) => {
    try {
        const { source_code, language_id } = req.body;
        if (!source_code || !language_id)
            return res.status(400).json({ message: "source_code and language_id are required" });

        const tc = getTestcase(req.params.id);
        if (!tc) return res.status(404).json({ message: "Testcase not found" });

        const input = tc.visible[0]?.input || "";
        const result = await runjudge0(source_code, language_id, input);

        const output = result.stdout || result.stderr || result.compile_output || "No output";
        res.status(200).json({ output, time: result.time, memory: result.memory, status: result.status });
    } catch (e) {
        res.status(500).json({ message: "Code execution failed", error: e.message });
    }
};
export const submitQuestion = async (req, res) => {
    try {
        const { source_code, language_id } = req.body;
        if (!source_code || !language_id)
            return res.status(400).json({ message: "source_code and language_id are required" });

        const tc = getTestcase(req.params.id);
        if (!tc) return res.status(404).json({ message: "Testcase not found" });

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
        let updatedStats = null;
        if (allPassed) {
            const q = getQuestionById(req.params.id);
            const updated = await awardQuestionSolve(req.user._id, req.params.id, q?.points || 50);
            if (updated) {
                updatedStats = {
                    points: updated.points || 0,
                    questionsSolved: updated.questionsSolved || 0,
                    streak: updated.streak || 0,
                };
            }
        }

        res.status(200).json({
            passed,
            total: tc.hidden.length,
            allPassed,
            details,
            awardedPoints: allPassed ? (getQuestionById(req.params.id)?.points || 50) : 0,
            updatedStats,
        });
    } catch (e) {
        res.status(500).json({ message: "Submission failed", error: e.message });
    }
};
