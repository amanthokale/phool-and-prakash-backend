const mongoose = require("mongoose");

const STATUSES = ["new", "confirmed", "in_progress", "ready", "shipped", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["unpaid", "pending_verification", "paid", "refunded"];

const itemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    name: { type: String, required: true },
    image: { type: String, default: "" },
    price: { type: Number, default: null }, // null = quote needed
    qty: { type: Number, required: true, min: 1 },
    customisation: { type: String, default: "" },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNo: { type: String, required: true, unique: true },
    type: { type: String, enum: ["order", "quote", "custom"], default: "order" },
    items: { type: [itemSchema], default: [] },
    customer: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      email: { type: String, default: "", trim: true, lowercase: true },
      address: { type: String, default: "", trim: true },
      city: { type: String, default: "", trim: true },
      pincode: { type: String, default: "", trim: true },
    },
    deliveryMethod: { type: String, enum: ["delivery", "pickup"], default: "delivery" },
    neededBy: { type: Date, default: null },
    giftNote: { type: String, default: "" },
    notes: { type: String, default: "" },
    custom: {
      what: { type: String, default: "" },
      colours: { type: String, default: "" },
      occasion: { type: String, default: "" },
      budget: { type: String, default: "" },
    },
    referenceImages: { type: [String], default: [] },
    subtotal: { type: Number, default: 0 },
    deliveryCharge: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    priceConfirmed: { type: Boolean, default: true },
    paymentMethod: { type: String, enum: ["cod", "upi"], default: "cod" },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: "unpaid" },
    upiRef: { type: String, default: "" },
    status: { type: String, enum: STATUSES, default: "new" },
    statusHistory: {
      type: [{ status: String, note: String, at: { type: Date, default: Date.now }, _id: false }],
      default: [],
    },
    adminNotes: { type: String, default: "" },
  },
  { timestamps: true }
);

orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ "customer.phone": 1 });

orderSchema.statics.STATUSES = STATUSES;
orderSchema.statics.PAYMENT_STATUSES = PAYMENT_STATUSES;

module.exports = mongoose.model("Order", orderSchema);
