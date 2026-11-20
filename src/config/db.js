const mongoose = require("mongoose");

// Cache the connection so serverless invocations (Vercel) reuse it.
let connectionPromise = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  const uri = process.env.PHOOL_PRAKASH_MONGODB_URI;
  if (!uri) {
    throw new Error("PHOOL_PRAKASH_MONGODB_URI is missing from environment variables");
  }

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 10000 })
      .then((conn) => {
        console.log("MongoDB connected successfully");
        return conn;
      })
      .catch((err) => {
        connectionPromise = null;
        throw err;
      });
  }
  return connectionPromise;
}

module.exports = connectDB;
