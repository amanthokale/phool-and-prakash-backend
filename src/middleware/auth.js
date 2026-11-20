const jwt = require("jsonwebtoken");
const { HttpError } = require("../utils/helpers");

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) throw new HttpError(500, "JWT_SECRET is not configured on the server");
  return secret;
}

function signToken(admin) {
  return jwt.sign({ sub: String(admin._id), email: admin.email }, getSecret(), { expiresIn: "12h" });
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, "Please log in"));
  try {
    req.admin = jwt.verify(token, getSecret());
    next();
  } catch (err) {
    next(err instanceof HttpError ? err : new HttpError(401, "Session expired, please log in again"));
  }
}

module.exports = { signToken, requireAdmin };
