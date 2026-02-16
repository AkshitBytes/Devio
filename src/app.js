import express from "express"
import authroutes from "./routes/auth.routes.js"
import cors from "cors";

const app = express()
app.use(express.json())
app.use(cors())
app.use("/auth",authroutes)
export default app