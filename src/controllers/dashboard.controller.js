export const studentDashboard = async(req,res)=>{
    try{
        res.status(200).json({
        message:"welcome student",
        user:{
      
        id: req.user._id,
        name: req.user.name,
        role: req.user.role
      
        }
    })
    }catch(e){
        res.status(500).json({
            message:"Server error",
            error:e.message
        })
    }
    
}

export const teacherDashboard = async(req,res)=>{
    res.json({
        message:"welcome Teacher",
        user:req.user
    })
}