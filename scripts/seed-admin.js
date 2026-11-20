// Creates the admin account, or resets its password.
// Usage: set ADMIN_EMAIL and ADMIN_PASSWORD in .env, then `npm run seed:admin`.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const Admin = require("../src/models/Admin");

(async () => {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!email || password.length < 8) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters) in .env first.");
    process.exit(1);
  }
  await connectDB();
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await Admin.findOne({ email });
  await Admin.updateOne({ email }, { email, passwordHash }, { upsert: true });
  console.log(existing ? `Password reset for ${email}` : `Admin created: ${email}`);
  console.log("Tip: remove ADMIN_PASSWORD from .env now that the account exists.");
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
