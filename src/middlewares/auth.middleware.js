import jwt from "jsonwebtoken"
import usermodel from "../models/user.js"

export const protect = async(req,res,next)=>{
    try{
        let token;
        if(
            req.headers.authorization &&
            req.headers.authorization.startsWith("Bearer")
        ){
            token = req.headers.authorization.split(" ")[1]
            const decoded = jwt.verify(token,process.env.JWT_SECRET)

            req.user = await usermodel.findById(decoded.id).select("-password")
            if(!req.user){
                return res.status(401).json({
                    message:"user not found"
                })
            }

            next();

        }
        else {
            return res.status(401).json({ message: "No token provided" })
        }

    }catch(e){
        return res.status(403).json({
            message:"Not authorized"
        })
    }
}

export const teachersonly = (req,res,next)=>{
    if(req.user.role !== "teacher"){
        return res.status(403).json({
            message:"Access denied, teachers only"
        })
    }
    next()
}

export const studentsonly = (req,res,next)=>{
    if(req.user.role !== "student"){
        return res.status(403).json({
            message:"Access denied, Students only"
        })
    }
    next()
}