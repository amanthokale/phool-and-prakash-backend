const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "site" },
    acceptingOrders: { type: Boolean, default: true },
    announcement: { type: String, default: "HANDMADE WITH LOVE · CUSTOM ORDERS OPEN" },
    codEnabled: { type: Boolean, default: true },
    upiEnabled: { type: Boolean, default: true },
    upiId: { type: String, default: "" },
    upiName: { type: String, default: "RangPop" },
    upiQrImage: { type: String, default: "" },
    whatsappNumber: { type: String, default: "" }, // digits with country code, e.g. 919876543210
    pickupEnabled: { type: Boolean, default: false },
    pickupAddress: { type: String, default: "" },
    deliveryCharge: { type: Number, default: 0, min: 0 },
    freeDeliveryAbove: { type: Number, default: 0, min: 0 }, // 0 = never free
    // Empty list = deliver anywhere. Otherwise only these pincodes (or prefixes like "4110").
    serviceablePincodes: { type: [String], default: [] },
    deliveryNote: { type: String, default: "" },
    minLeadTimeDays: { type: Number, default: 2, min: 0 },
  },
  { timestamps: true }
);

settingsSchema.statics.get = async function () {
  let s = await this.findById("site");
  if (!s) s = await this.create({ _id: "site" });
  return s;
};

settingsSchema.methods.toPublic = function () {
  const o = this.toObject();
  delete o.createdAt;
  delete o.updatedAt;
  delete o.__v;
  return o;
};

module.exports = mongoose.model("Settings", settingsSchema);
