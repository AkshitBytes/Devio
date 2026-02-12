import usermodel from "../models/user";
import generateToken from "../utils/generatetoken";
import bcrypt from "bcrypt"

export const signup = async(req,res)=>{
    try{
    const {name, email, password, role} = req.body
    const userexists = await usermodel.findOne({
        email:email
    })

    if(userexists){
        return res.status(400).json({
            message:"user already exists"
        })
    }
    const hashedpass = await bcrypt.hash(password,10)
    const user = await usermodel.create({
        name:name,
        email:email,
        password:hashedpass,
        role:role
    })
    res.status(201).json({
        message:"you have registered succesfully",
        user:{
            id:user._id,
            name:user.name,
            email:user.email,
            role:user.role
        }
    })
}catch(e){
    res.status(500).json({
        message:"some server error",
        error:e.message
    })
}
}

export const signin = async(req,res)=>{
    try{
        const {email, password} = req.body
        const user = await usermodel.findOne({
            email:email
        })
        if(!user){
            return res.status(400).json({
                message:"Invalid username or password"
            })
        }
        const ismatch = await bcrypt.compare(password, user.password)
        if(!ismatch){
            return res.status(400).json({
                message:"Invalid username or password"
            })
        }

        const token = generateToken(user)
        res.status(200).json({
            message:"user logged-in succesfully",
            user:{
                id:user._id,
                name:user.name,
                role:user.role
            },
            token:token
        })
    }catch(e){
        res.status(500).json({
            message:"some server error",
            error:e.message
        })
    }
}

