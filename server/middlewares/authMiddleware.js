export const protect = async (req,res,next) => {
    try {
        const {userId} = await req.auth()

        if(!userId){
            return res.status(401).json({message: "Unauthorized"})
        }
        return next()

    } catch (error) {
        console.error(error)
        return res.status(500).json({message: "Internal Server Error"})
    }
    
}