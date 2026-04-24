import express from "express"
import authroutes from "./routes/auth.routes.js"
import dashboardroutes from "./routes/dashboard.routes.js"
import codeRoutes from "./routes/code.routes.js"
import historyRoutes from "./routes/submission.routes.js"
import questionsRoutes from "./routes/questions.routes.js"
import battleRoutes from "./routes/battle.routes.js"
import classroomRoutes from "./routes/classroom.routes.js"
import cors from "cors";

const app = express()
app.use(express.json())
app.use(cors({ origin: "*" }))
app.use("/auth", authroutes)
app.use("/dashboard", dashboardroutes)
app.use("/code", codeRoutes)
app.use("/submission", historyRoutes)
app.use("/questions", questionsRoutes)
app.use("/battles", battleRoutes)
app.use("/classrooms", classroomRoutes)
export default app