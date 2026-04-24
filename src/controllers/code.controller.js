import { runjudge0 } from "../services/judge0.service.js";
import submissionModel from "../models/submission.model.js";
export const runCode = async(req,res) =>{

    try{
        const {source_code,language_id,stdin} = req.body;

        if(!source_code || !language_id){
            res.status(400).json({
                message:"missing fields"
            })
        }

        const result = await runjudge0(source_code, language_id, stdin)

        await submissionModel.create({
            user:req.user._id,
            source_code,
            language_id,
            ...result
        })

        res.status(200).json(result)
    }catch(e){
        res.status(500).json({
            message:"code execution failed",
            error:e.message
        })
    }
}

