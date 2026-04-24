import submission from "../models/submission.model.js"
export const getHistory = async(req,res) =>{
    try{
        const submissions = await submission.find({
            user:req.user._id,
        }).sort({createdAt:-1})

        res.json(submissions)
    }catch(e){
        res.status(500).json({message:e.message})
    }
}

