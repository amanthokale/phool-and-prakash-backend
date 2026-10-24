
const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.PHOOL_PRAKASH_MONGODB_URI;

  if (!uri) {
    throw new Error("PHOOL_PRAKASH_MONGODB_URI is missing from environment variables");
  }

  await mongoose.connect(uri);
  console.log("MongoDB connected successfully");
}

module.exports = connectDB;
