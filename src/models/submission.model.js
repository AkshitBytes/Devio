import mongoose, { mongo } from "mongoose"

const submissionSchema = new mongoose.Schema({
    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"users",
        required:true
    },
    source_code:{
        type:String,
        required:true
    },
    language_id:{
        type:Number,
        required:true
    },
    stdout: String,
    stderr: String,
    compile_output: String,
    time: String,
    memory: Number,
    status: Object
},{timestamps:true})

export default mongoose.model("submission",submissionSchema)

