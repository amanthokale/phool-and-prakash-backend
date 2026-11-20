require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const multer = require("multer");
const connectDB = require("./src/config/db");
const routes = require("./src/routes");

const app = express();

// Behind Vercel / Render / Nginx: needed for correct client IPs in rate limiting.
app.set("trust proxy", 1);

app.use(helmet());

// FRONTEND_URL may list several origins separated by commas.
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
  })
);
app.use(express.json({ limit: "100kb" }));

app.get("/", (req, res) => {
  res.json({ success: true, message: "RangPop API is running" });
});

app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "healthy" });
});

// Connect (or reuse the cached connection) before any route that needs the DB.
app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("Database connection failed:", err.message);
    res.status(503).json({ success: false, message: "Service temporarily unavailable" });
  }
});

app.use("/api", routes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "Each image must be under 4 MB" : "Too many images";
    return res.status(400).json({ success: false, message });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ success: false, message: "Request is too large" });
  }
  if (err.name === "ValidationError") {
    return res.status(400).json({ success: false, message: Object.values(err.errors)[0].message });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  console.error(err);
  res.status(err.status || 500).json({ success: false, message: err.status ? err.message : "Internal server error" });
});

// Local / long-running hosts: `node server.js`. Serverless hosts (Vercel) import `app`.
if (require.main === module) {
  connectDB()
    .then(() => {
      const PORT = process.env.PORT || 5000;
      app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch((error) => {
      console.error("Failed to start server:", error.message);
      process.exit(1);
    });
}

module.exports = app;
