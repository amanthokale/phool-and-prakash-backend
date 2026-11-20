const mongoose = require("mongoose");
const Product = require("../models/Product");
const cloudinary = require("../services/cloudinary");
const { HttpError, str, slugify } = require("../utils/helpers");

const PUBLIC_FIELDS = "name slug category description note price images emoji label stock leadTimeDays customisable isFeatured sortOrder";

// ---------- Public ----------

async function listPublic(req, res) {
  const products = await Product.find({ isActive: true }).select(PUBLIC_FIELDS).sort({ isFeatured: -1, sortOrder: 1, createdAt: -1 }).lean();
  res.json({ success: true, products });
}

async function getPublic(req, res) {
  const product = await Product.findOne({ slug: req.params.slug, isActive: true }).select(PUBLIC_FIELDS).lean();
  if (!product) throw new HttpError(404, "Product not found");
  res.json({ success: true, product });
}

// ---------- Admin ----------

const numOrNull = (v, { int = false } = {}) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, "Numbers must be zero or more");
  return int ? Math.floor(n) : Math.round(n * 100) / 100;
};

function readBody(body, partial = false) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  if (!partial || has("name")) {
    out.name = str(body.name, 120);
    if (!out.name) throw new HttpError(400, "Name is required");
  }
  if (!partial || has("category")) {
    out.category = str(body.category, 60);
    if (!out.category) throw new HttpError(400, "Category is required");
  }
  if (has("description")) out.description = str(body.description, 3000);
  if (has("note")) out.note = str(body.note, 300);
  if (has("emoji")) out.emoji = str(body.emoji, 8) || "🎁";
  if (has("label")) out.label = str(body.label, 30);
  if (has("price")) out.price = numOrNull(body.price);
  if (has("stock")) out.stock = numOrNull(body.stock, { int: true });
  if (has("leadTimeDays")) out.leadTimeDays = Math.min(numOrNull(body.leadTimeDays, { int: true }) ?? 0, 90);
  if (has("sortOrder")) out.sortOrder = Number(body.sortOrder) || 0;
  for (const k of ["isActive", "isFeatured", "customisable"]) if (has(k)) out[k] = Boolean(body[k]);
  if (has("images")) {
    if (!Array.isArray(body.images)) throw new HttpError(400, "images must be a list");
    out.images = body.images
      .slice(0, 8)
      .map((i) => ({ url: str(i && i.url, 600), publicId: str(i && i.publicId, 200) }))
      .filter((i) => /^(https:\/\/|\/)/.test(i.url));
  }
  return out;
}

async function uniqueSlug(name, excludeId) {
  const base = slugify(name);
  let slug = base;
  for (let n = 2; await Product.exists({ slug, _id: { $ne: excludeId } }); n++) slug = `${base}-${n}`;
  return slug;
}

function checkId(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, "Product not found");
}

async function listAdmin(req, res) {
  const products = await Product.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
  res.json({ success: true, products });
}

async function getAdmin(req, res) {
  checkId(req.params.id);
  const product = await Product.findById(req.params.id).lean();
  if (!product) throw new HttpError(404, "Product not found");
  res.json({ success: true, product });
}

async function create(req, res) {
  const data = readBody(req.body);
  data.slug = await uniqueSlug(data.name);
  const product = await Product.create(data);
  res.status(201).json({ success: true, product });
}

async function update(req, res) {
  checkId(req.params.id);
  const product = await Product.findById(req.params.id);
  if (!product) throw new HttpError(404, "Product not found");
  const data = readBody(req.body, true);

  // Remove Cloudinary images that were taken off the product.
  if (data.images) {
    const keep = new Set(data.images.map((i) => i.publicId).filter(Boolean));
    await Promise.all(product.images.filter((i) => i.publicId && !keep.has(i.publicId)).map((i) => cloudinary.destroy(i.publicId)));
  }
  if (data.name && data.name !== product.name) data.slug = await uniqueSlug(data.name, product._id);

  product.set(data);
  await product.save();
  res.json({ success: true, product });
}

async function remove(req, res) {
  checkId(req.params.id);
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw new HttpError(404, "Product not found");
  await Promise.all(product.images.map((i) => cloudinary.destroy(i.publicId)));
  res.json({ success: true });
}

async function uploadImages(req, res) {
  if (!cloudinary.isConfigured()) {
    throw new HttpError(503, "Image uploads are not set up yet (add the Cloudinary keys). You can paste an image URL instead.");
  }
  const files = req.files || [];
  if (!files.length) throw new HttpError(400, "No images received");
  const folder = req.query.folder === "settings" ? "settings" : "products";
  const images = await Promise.all(files.map((f) => cloudinary.uploadBuffer(f.buffer, folder)));
  res.status(201).json({ success: true, images });
}

module.exports = { listPublic, getPublic, listAdmin, getAdmin, create, update, remove, uploadImages };
