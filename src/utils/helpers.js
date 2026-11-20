const Counter = require("../models/Counter");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Wrap async route handlers so thrown errors reach the error middleware.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const str = (v, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const digitsOnly = (v) => String(v || "").replace(/\D/g, "");

// Compare phones on their last 10 digits so +91 / 0 prefixes don't matter.
const samePhone = (a, b) => {
  const x = digitsOnly(a).slice(-10);
  return x.length === 10 && x === digitsOnly(b).slice(-10);
};

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const slugify = (v) =>
  String(v)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";

// Date parts in India time, so order numbers roll over at IST midnight.
function istDateParts(date = new Date()) {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  return {
    yy: String(ist.getUTCFullYear()).slice(-2),
    mm: String(ist.getUTCMonth() + 1).padStart(2, "0"),
    dd: String(ist.getUTCDate()).padStart(2, "0"),
  };
}

async function nextOrderNo() {
  const { yy, mm, dd } = istDateParts();
  const key = `order-${yy}${mm}${dd}`;
  const c = await Counter.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `RP-${yy}${mm}${dd}-${String(c.seq).padStart(3, "0")}`;
}

const formatINR = (n) => (n == null ? "To be confirmed" : `₹${Number(n).toLocaleString("en-IN")}`);

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

module.exports = { HttpError, asyncHandler, str, digitsOnly, samePhone, isEmail, slugify, nextOrderNo, formatINR, escapeHtml };
