import dotenv from "dotenv"
import app from "./src/app.js"
import connectDB from "./src/config/db.js"
dotenv.config()

connectDB()

const PORT = process.env.PORT || 3000
app.listen(PORT,()=>{
    console.log("server started on ${PORT}")
})

