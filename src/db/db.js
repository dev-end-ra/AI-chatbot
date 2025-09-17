const mongoose = require("mongoose");

const connectDB = async ()=>{
    await mongoose.connect(process.env.MONGODB_URI)  // we can also connect using try catch method
    .then(()=>{
        console.log("Connected to DB");
    })
    .catch((error)=>{
        console.log("Error connecting to DB", error);
    })
}

module.exports = connectDB;