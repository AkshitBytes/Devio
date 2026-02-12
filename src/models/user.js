import mongoose from "mongoose"
const userschema = new mongoose.Schema({
    name:{
        type:String,
        required:true
    },
    email:{
        type:String,
        required:true,
        unique:true,
        lowercase:true
    },
    password:{
        type:String,
        required:true
    },
    role:{
        type:String,
        enum:["teacher","student"],
        required:true
    }

},{ timestamps: true })
const usermodel = mongoose.model("users",userschema)
export default usermodel