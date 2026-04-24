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
    },
    points: {
        type: Number,
        default: 0,
    },
    battlesWon: {
        type: Number,
        default: 0,
    },
    questionsSolved: {
        type: Number,
        default: 0,
    },
    solvedQuestionIds: {
        type: [String],
        default: [],
    },
    streak: {
        type: Number,
        default: 0,
    },
    longestStreak: {
        type: Number,
        default: 0,
    },
    lastActiveDate: {
        type: String,
        default: null,
    },
    activityDates: {
        type: [String],
        default: [],
    }

},{ timestamps: true })
const usermodel = mongoose.model("users",userschema)
export default usermodel