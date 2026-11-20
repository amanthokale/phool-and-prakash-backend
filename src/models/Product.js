const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema(
  { url: { type: String, required: true }, publicId: { type: String, default: "" } },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    category: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: "", maxlength: 3000 },
    note: { type: String, default: "", maxlength: 300 },
    // null = "DM for price" (customer sends a quote request)
    price: { type: Number, default: null, min: 0 },
    images: { type: [imageSchema], default: [] },
    emoji: { type: String, default: "🎁", maxlength: 8 },
    label: { type: String, default: "", maxlength: 30 },
    // null = made to order (no stock limit)
    stock: { type: Number, default: null, min: 0 },
    leadTimeDays: { type: Number, default: 3, min: 0, max: 90 },
    customisable: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model("Product", productSchema);
