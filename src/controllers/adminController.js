const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const Admin = require("../models/Admin");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Settings = require("../models/Settings");
const email = require("../services/email");
const { signToken } = require("../middleware/auth");
const { HttpError, str, digitsOnly } = require("../utils/helpers");

// ---------- Auth ----------

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

async function login(req, res) {
  const emailAddr = str(req.body && req.body.email, 120).toLowerCase();
  const password = String((req.body && req.body.password) || "");
  const admin = emailAddr ? await Admin.findOne({ email: emailAddr }) : null;
  // Compare against a dummy hash when the email is unknown so timing doesn't reveal it.
  const ok = await bcrypt.compare(password, admin ? admin.passwordHash : DUMMY_HASH);
  if (!admin || !ok) throw new HttpError(401, "Wrong email or password");
  res.json({ success: true, token: signToken(admin), admin: { email: admin.email } });
}

async function me(req, res) {
  res.json({ success: true, admin: { email: req.admin.email } });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof newPassword !== "string" || newPassword.length < 8) throw new HttpError(400, "New password must be at least 8 characters");
  const admin = await Admin.findById(req.admin.sub);
  if (!admin || !(await bcrypt.compare(String(currentPassword || ""), admin.passwordHash))) {
    throw new HttpError(400, "Current password is wrong");
  }
  admin.passwordHash = await bcrypt.hash(newPassword, 12);
  await admin.save();
  res.json({ success: true });
}

// ---------- Orders ----------

function checkId(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, "Order not found");
}

async function listOrders(req, res) {
  const q = {};
  if (req.query.status && req.query.status !== "all") {
    if (req.query.status === "open") q.status = { $nin: ["delivered", "cancelled"] };
    else q.status = req.query.status;
  }
  if (req.query.type) q.type = req.query.type;
  if (req.query.payment) q.paymentStatus = req.query.payment;
  const search = str(req.query.q, 60);
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const or = [{ orderNo: rx }, { "customer.name": rx }, { "customer.email": rx }];
    const d = digitsOnly(search);
    if (d.length >= 4) or.push({ "customer.phone": new RegExp(d) });
    q.$or = or;
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 25;
  const [orders, total] = await Promise.all([
    Order.find(q)
      .select("orderNo type customer.name customer.phone total priceConfirmed paymentMethod paymentStatus status neededBy createdAt items.qty")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Order.countDocuments(q),
  ]);
  res.json({ success: true, orders, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}

async function getOrder(req, res) {
  checkId(req.params.id);
  const order = await Order.findById(req.params.id).lean();
  if (!order) throw new HttpError(404, "Order not found");
  res.json({ success: true, order });
}

async function restoreStock(order) {
  await Promise.all(
    order.items
      .filter((i) => i.product)
      .map((i) => Product.updateOne({ _id: i.product, stock: { $ne: null } }, { $inc: { stock: i.qty } }))
  );
}

// PATCH /api/admin/orders/:id
// { status?, note?, notifyCustomer?, paymentStatus?, adminNotes?, itemPrices?: number[], deliveryCharge? }
async function updateOrder(req, res) {
  checkId(req.params.id);
  const order = await Order.findById(req.params.id);
  if (!order) throw new HttpError(404, "Order not found");
  const b = req.body || {};
  const notify = b.notifyCustomer !== false;
  let statusChanged = false;
  let priced = false;

  if (b.adminNotes !== undefined) order.adminNotes = str(b.adminNotes, 3000);

  // Pricing a quote or custom order
  if (Array.isArray(b.itemPrices) || b.deliveryCharge !== undefined || b.customPrice !== undefined) {
    if (Array.isArray(b.itemPrices)) {
      b.itemPrices.forEach((p, idx) => {
        if (order.items[idx] && p !== null && p !== "" && p !== undefined) {
          const n = Number(p);
          if (!Number.isFinite(n) || n < 0) throw new HttpError(400, "Prices must be zero or more");
          order.items[idx].price = n;
        }
      });
    }
    if (b.customPrice !== undefined && order.type === "custom") {
      const n = Number(b.customPrice);
      if (!Number.isFinite(n) || n < 0) throw new HttpError(400, "Price must be zero or more");
      if (!order.items.length) order.items.push({ name: `Custom: ${order.custom.what.slice(0, 60)}`, price: n, qty: 1 });
      else order.items[0].price = n;
    }
    if (b.deliveryCharge !== undefined) {
      const n = Number(b.deliveryCharge);
      if (!Number.isFinite(n) || n < 0) throw new HttpError(400, "Delivery charge must be zero or more");
      order.deliveryCharge = n;
    }
    order.subtotal = order.items.reduce((s, i) => s + (i.price || 0) * i.qty, 0);
    order.total = order.subtotal + order.deliveryCharge;
    const wasConfirmed = order.priceConfirmed;
    order.priceConfirmed = order.items.length > 0 && order.items.every((i) => i.price != null);
    priced = order.priceConfirmed && !wasConfirmed;
    order.markModified("items");
  }

  if (b.paymentStatus && b.paymentStatus !== order.paymentStatus) {
    if (!Order.PAYMENT_STATUSES.includes(b.paymentStatus)) throw new HttpError(400, "Unknown payment status");
    order.paymentStatus = b.paymentStatus;
    order.statusHistory.push({ status: order.status, note: `Payment marked ${b.paymentStatus.replace("_", " ")}` });
  }

  if (b.status && b.status !== order.status) {
    if (!Order.STATUSES.includes(b.status)) throw new HttpError(400, "Unknown status");
    if (order.status === "cancelled") {
      throw new HttpError(400, "A cancelled order can't be reopened. Ask the customer to place a new order.");
    }
    if (b.status === "cancelled") await restoreStock(order);
    order.status = b.status;
    order.statusHistory.push({ status: b.status, note: str(b.note, 300) });
    statusChanged = true;
  }

  await order.save();
  if (notify) {
    if (priced) await email.notifyCustomerPriced(order);
    if (statusChanged) await email.notifyCustomerStatus(order, str(b.note, 300));
  }
  res.json({ success: true, order });
}

async function deleteOrder(req, res) {
  checkId(req.params.id);
  const order = await Order.findById(req.params.id);
  if (!order) throw new HttpError(404, "Order not found");
  if (!["cancelled", "delivered"].includes(order.status)) throw new HttpError(400, "Cancel the order before deleting it");
  await order.deleteOne();
  res.json({ success: true });
}

const csvCell = (v) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function exportCsv(req, res) {
  const orders = await Order.find().sort({ createdAt: -1 }).limit(5000).lean();
  const header = ["Order no", "Date", "Type", "Status", "Customer", "Phone", "Email", "Address", "City", "Pincode", "Items", "Subtotal", "Delivery", "Total", "Payment", "Payment status", "UPI ref", "Needed by"];
  const rows = orders.map((o) => [
    o.orderNo,
    new Date(o.createdAt).toISOString().slice(0, 10),
    o.type,
    o.status,
    o.customer.name,
    o.customer.phone,
    o.customer.email,
    o.customer.address,
    o.customer.city,
    o.customer.pincode,
    o.items.map((i) => `${i.name} x${i.qty}`).join("; ") || (o.custom && o.custom.what),
    o.subtotal,
    o.deliveryCharge,
    o.total,
    o.paymentMethod,
    o.paymentStatus,
    o.upiRef,
    o.neededBy ? new Date(o.neededBy).toISOString().slice(0, 10) : "",
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="rangpop-orders-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("﻿" + csv);
}

// ---------- Dashboard ----------

async function stats(req, res) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [newOrders, openOrders, pendingPayments, quotes, monthAgg, productCount, lowStock, recent] = await Promise.all([
    Order.countDocuments({ status: "new" }),
    Order.countDocuments({ status: { $nin: ["delivered", "cancelled"] } }),
    Order.countDocuments({ paymentStatus: "pending_verification" }),
    Order.countDocuments({ priceConfirmed: false, status: { $ne: "cancelled" } }),
    Order.aggregate([
      { $match: { createdAt: { $gte: monthStart }, status: { $ne: "cancelled" }, priceConfirmed: true } },
      { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: "$total" } } },
    ]),
    Product.countDocuments({ isActive: true }),
    Product.find({ stock: { $ne: null, $lte: 2 }, isActive: true }).select("name stock").limit(10).lean(),
    Order.find().select("orderNo type customer.name total status paymentStatus priceConfirmed createdAt").sort({ createdAt: -1 }).limit(6).lean(),
  ]);
  res.json({
    success: true,
    stats: {
      newOrders,
      openOrders,
      pendingPayments,
      quotes,
      monthOrders: (monthAgg[0] && monthAgg[0].count) || 0,
      monthRevenue: (monthAgg[0] && monthAgg[0].revenue) || 0,
      productCount,
      lowStock,
      emailConfigured: email.isConfigured(),
      uploadsConfigured: require("../services/cloudinary").isConfigured(),
    },
    recent,
  });
}

// ---------- Settings ----------

async function getSettings(req, res) {
  const settings = await Settings.get();
  res.json({ success: true, settings: settings.toPublic() });
}

async function updateSettings(req, res) {
  const b = req.body || {};
  const s = await Settings.get();
  const bools = ["acceptingOrders", "codEnabled", "upiEnabled", "pickupEnabled"];
  const strings = { announcement: 120, upiName: 60, pickupAddress: 300, deliveryNote: 300 };
  const nums = ["deliveryCharge", "freeDeliveryAbove", "minLeadTimeDays"];

  for (const k of bools) if (b[k] !== undefined) s[k] = Boolean(b[k]);
  for (const [k, max] of Object.entries(strings)) if (b[k] !== undefined) s[k] = str(b[k], max);
  for (const k of nums) {
    if (b[k] !== undefined) {
      const n = Number(b[k]);
      if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${k} must be zero or more`);
      s[k] = n;
    }
  }
  if (b.upiId !== undefined) {
    const id = str(b.upiId, 60);
    if (id && !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(id)) throw new HttpError(400, "UPI ID looks wrong (example: name@okhdfcbank)");
    s.upiId = id;
  }
  if (b.upiQrImage !== undefined) {
    const u = str(b.upiQrImage, 600);
    if (u && !/^(https:\/\/|\/)/.test(u)) throw new HttpError(400, "QR image must be an https link");
    s.upiQrImage = u;
  }
  if (b.whatsappNumber !== undefined) {
    let d = digitsOnly(b.whatsappNumber);
    if (d.length === 10) d = `91${d}`;
    if (d && (d.length < 11 || d.length > 13)) throw new HttpError(400, "WhatsApp number should include the country code, e.g. 919876543210");
    s.whatsappNumber = d;
  }
  if (b.serviceablePincodes !== undefined) {
    const list = Array.isArray(b.serviceablePincodes) ? b.serviceablePincodes : String(b.serviceablePincodes).split(/[\s,]+/);
    s.serviceablePincodes = [...new Set(list.map((p) => digitsOnly(p)).filter((p) => p.length >= 2 && p.length <= 6))].slice(0, 500);
  }
  await s.save();
  res.json({ success: true, settings: s.toPublic() });
}

async function publicSettings(req, res) {
  const s = await Settings.get();
  const o = s.toPublic();
  res.json({ success: true, settings: o });
}

module.exports = {
  login,
  me,
  changePassword,
  listOrders,
  getOrder,
  updateOrder,
  deleteOrder,
  exportCsv,
  stats,
  getSettings,
  updateSettings,
  publicSettings,
};
