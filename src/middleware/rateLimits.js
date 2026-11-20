const rateLimit = require("express-rate-limit");

const make = (windowMinutes, limit, message) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, message },
  });

module.exports = {
  loginLimiter: make(15, 10, "Too many login attempts. Try again in 15 minutes."),
  orderLimiter: make(15, 10, "Too many orders from this device. Please try again a little later."),
  trackLimiter: make(15, 60, "Too many requests. Please try again later."),
};
