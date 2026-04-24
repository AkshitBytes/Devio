import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "../data");

export const getAllQuestions = () => {
    return JSON.parse(readFileSync(join(DATA, "questions.json"), "utf-8"));
};

export const getQuestionById = (id) => {
    const questions = getAllQuestions();
    return questions.find((q) => q.id === id) || null;
};

export const getTestcase = (questionId) => {
    const testcases = JSON.parse(readFileSync(join(DATA, "testcases.json"), "utf-8"));
    return testcases.find((tc) => tc.question_id === questionId) || null;
};
// G19-BEE-PID14