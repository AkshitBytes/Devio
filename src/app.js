import express from "express"
import authroutes from "./routes/auth.routes.js"
import dashboardroutes from "./routes/dashboard.routes.js"
import codeRoutes from "./routes/code.routes.js"
import cors from "cors";

const app = express()
app.use(express.json())
app.use(cors())
app.use("/auth",authroutes)
app.use("/dashboard",dashboardroutes)
app.use("/code",codeRoutes)
export default app