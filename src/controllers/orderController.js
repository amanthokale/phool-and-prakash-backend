const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Settings = require("../models/Settings");
const cloudinary = require("../services/cloudinary");
const email = require("../services/email");
const { HttpError, str, digitsOnly, samePhone, isEmail, nextOrderNo } = require("../utils/helpers");

const DAY = 24 * 60 * 60 * 1000;

function startOfTodayIST() {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 5.5 * 60 * 60 * 1000);
}

function isServiceable(settings, pincode) {
  const list = (settings.serviceablePincodes || []).map((p) => p.trim()).filter(Boolean);
  if (!list.length) return true;
  return list.some((p) => pincode.startsWith(p));
}

function deliveryChargeFor(settings, subtotal, deliveryMethod) {
  if (deliveryMethod === "pickup") return 0;
  if (settings.freeDeliveryAbove > 0 && subtotal >= settings.freeDeliveryAbove) return 0;
  return settings.deliveryCharge || 0;
}

// Shared customer/contact validation for orders and custom requests.
function readCustomer(body, settings, { needAddress }) {
  const c = body.customer || {};
  const customer = {
    name: str(c.name, 80),
    phone: str(c.phone, 20),
    email: str(c.email, 120).toLowerCase(),
    address: str(c.address, 400),
    city: str(c.city, 60),
    pincode: digitsOnly(c.pincode).slice(0, 6),
  };
  if (customer.name.length < 2) throw new HttpError(400, "Please enter your name");
  const phoneDigits = digitsOnly(customer.phone);
  if (phoneDigits.length < 10 || phoneDigits.length > 13) throw new HttpError(400, "Please enter a valid phone number");
  if (customer.email && !isEmail(customer.email)) throw new HttpError(400, "Please enter a valid email address");

  const deliveryMethod = body.deliveryMethod === "pickup" && settings.pickupEnabled ? "pickup" : "delivery";
  if (needAddress && deliveryMethod === "delivery") {
    if (customer.address.length < 8) throw new HttpError(400, "Please enter your full delivery address");
    if (!customer.city) throw new HttpError(400, "Please enter your city");
    if (customer.pincode.length !== 6) throw new HttpError(400, "Please enter a 6-digit pincode");
    if (!isServiceable(settings, customer.pincode)) {
      throw new HttpError(400, "Sorry, we don't deliver to this pincode yet. DM us and we'll see what we can do!");
    }
  }
  return { customer, deliveryMethod };
}

function readNeededBy(value, minDays) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, "Please pick a valid date");
  const earliest = new Date(startOfTodayIST().getTime() + minDays * DAY);
  if (d < earliest) {
    throw new HttpError(400, `Handmade takes a little time. Please pick a date at least ${minDays} day(s) from today.`);
  }
  return d;
}

async function sendNewOrderEmails(order) {
  await Promise.allSettled([email.notifyAdminNewOrder(order), email.notifyCustomerReceived(order)]);
}

function publicOrder(o) {
  return {
    orderNo: o.orderNo,
    type: o.type,
    items: o.items.map((i) => ({ name: i.name, image: i.image, price: i.price, qty: i.qty, customisation: i.customisation })),
    customerName: o.customer.name,
    deliveryMethod: o.deliveryMethod,
    neededBy: o.neededBy,
    subtotal: o.subtotal,
    deliveryCharge: o.deliveryCharge,
    total: o.total,
    priceConfirmed: o.priceConfirmed,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    status: o.status,
    statusHistory: o.statusHistory,
    createdAt: o.createdAt,
  };
}

// POST /api/orders
async function createOrder(req, res) {
  const body = req.body || {};
  if (body.website) return res.status(201).json({ success: true, order: { orderNo: "RP-000000-000" } }); // honeypot

  const settings = await Settings.get();
  if (!settings.acceptingOrders) throw new HttpError(403, "We're taking a short break from new orders. Please DM us on Instagram!");

  // ---- Items: always re-read price and stock from the database ----
  const rawItems = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
  if (!rawItems.length) throw new HttpError(400, "Your bag is empty");

  const merged = new Map();
  for (const r of rawItems) {
    const id = String(r.productId || "");
    if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "One of the items is no longer available");
    const qty = Math.floor(Number(r.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 50) throw new HttpError(400, "Quantities must be between 1 and 50");
    const prev = merged.get(id);
    merged.set(id, { qty: (prev ? prev.qty : 0) + qty, customisation: str(r.customisation, 300) || (prev && prev.customisation) || "" });
  }

  const products = await Product.find({ _id: { $in: [...merged.keys()] }, isActive: true }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const items = [];
  let maxLead = settings.minLeadTimeDays || 0;
  for (const [id, { qty, customisation }] of merged) {
    const p = byId.get(id);
    if (!p) throw new HttpError(400, "One of the items is no longer available. Please refresh the page.");
    if (p.stock != null && p.stock < qty) {
      throw new HttpError(400, p.stock === 0 ? `${p.name} is sold out` : `Only ${p.stock} of ${p.name} left`);
    }
    maxLead = Math.max(maxLead, p.leadTimeDays || 0);
    items.push({ product: p._id, name: p.name, image: (p.images[0] && p.images[0].url) || "", price: p.price, qty, customisation });
  }

  const { customer, deliveryMethod } = readCustomer(body, settings, { needAddress: true });
  const neededBy = readNeededBy(body.neededBy, maxLead);

  let paymentMethod = body.paymentMethod === "upi" ? "upi" : "cod";
  if (paymentMethod === "upi" && !(settings.upiEnabled && settings.upiId)) paymentMethod = "cod";
  if (paymentMethod === "cod" && !settings.codEnabled) {
    if (settings.upiEnabled && settings.upiId) paymentMethod = "upi";
    else throw new HttpError(400, "No payment method is available right now. Please DM us to order.");
  }

  const needsQuote = items.some((i) => i.price == null);
  const subtotal = items.reduce((sum, i) => sum + (i.price || 0) * i.qty, 0);
  const deliveryCharge = deliveryChargeFor(settings, subtotal, deliveryMethod);

  // ---- Reserve stock atomically; roll back if any item runs out meanwhile ----
  const reserved = [];
  for (const i of items) {
    const p = byId.get(String(i.product));
    if (p.stock == null) continue;
    const ok = await Product.updateOne({ _id: p._id, stock: { $gte: i.qty } }, { $inc: { stock: -i.qty } });
    if (!ok.modifiedCount) {
      await Promise.all(reserved.map((r) => Product.updateOne({ _id: r.id }, { $inc: { stock: r.qty } })));
      throw new HttpError(409, `${p.name} just sold out. Please update your bag.`);
    }
    reserved.push({ id: p._id, qty: i.qty });
  }

  let order;
  try {
    order = await Order.create({
      orderNo: await nextOrderNo(),
      type: needsQuote ? "quote" : "order",
      items,
      customer,
      deliveryMethod,
      neededBy,
      giftNote: str(body.giftNote, 300),
      notes: str(body.notes, 1000),
      subtotal,
      deliveryCharge,
      total: subtotal + deliveryCharge,
      priceConfirmed: !needsQuote,
      paymentMethod,
      statusHistory: [{ status: "new", note: "Order placed" }],
    });
  } catch (err) {
    await Promise.all(reserved.map((r) => Product.updateOne({ _id: r.id }, { $inc: { stock: r.qty } })));
    throw err;
  }

  await sendNewOrderEmails(order);
  res.status(201).json({ success: true, order: publicOrder(order) });
}

// POST /api/custom-requests  (multipart: fields + up to 2 "images")
async function createCustomRequest(req, res) {
  const body = req.body || {};
  if (body.website) return res.status(201).json({ success: true, order: { orderNo: "RP-000000-000" } });

  // Multipart sends nested objects as JSON text.
  if (typeof body.customer === "string") {
    try {
      body.customer = JSON.parse(body.customer);
    } catch {
      body.customer = {};
    }
  }

  const settings = await Settings.get();
  if (!settings.acceptingOrders) throw new HttpError(403, "We're taking a short break from new orders. Please DM us on Instagram!");

  const what = str(body.what, 1500);
  if (what.length < 10) throw new HttpError(400, "Tell us a little more about what you'd like (at least a sentence)");

  const { customer, deliveryMethod } = readCustomer(body, settings, { needAddress: false });
  const neededBy = readNeededBy(body.neededBy, settings.minLeadTimeDays || 0);

  let referenceImages = [];
  if (req.files && req.files.length && cloudinary.isConfigured()) {
    try {
      referenceImages = (await Promise.all(req.files.map((f) => cloudinary.uploadBuffer(f.buffer, "custom-requests")))).map((i) => i.url);
    } catch (err) {
      console.error("Reference image upload failed:", err.message);
    }
  }

  const order = await Order.create({
    orderNo: await nextOrderNo(),
    type: "custom",
    customer,
    deliveryMethod,
    neededBy,
    custom: { what, colours: str(body.colours, 200), occasion: str(body.occasion, 100), budget: str(body.budget, 60) },
    referenceImages,
    notes: str(body.notes, 1000),
    priceConfirmed: false,
    paymentMethod: "cod",
    statusHistory: [{ status: "new", note: "Custom request received" }],
  });

  await sendNewOrderEmails(order);
  res.status(201).json({ success: true, order: publicOrder(order) });
}

async function findForCustomer(orderNo, phone) {
  const order = await Order.findOne({ orderNo: str(orderNo, 20).toUpperCase() });
  if (!order || !samePhone(order.customer.phone, phone)) {
    throw new HttpError(404, "We couldn't find an order with that number and phone");
  }
  return order;
}

// GET /api/orders/track?orderNo=&phone=
async function trackOrder(req, res) {
  const order = await findForCustomer(req.query.orderNo, req.query.phone);
  res.json({ success: true, order: publicOrder(order) });
}

// POST /api/orders/:orderNo/upi-ref  { phone, upiRef }
async function submitUpiRef(req, res) {
  const order = await findForCustomer(req.params.orderNo, req.body && req.body.phone);
  const upiRef = str(req.body.upiRef, 40).replace(/\s/g, "");
  if (!/^[A-Za-z0-9-]{6,40}$/.test(upiRef)) throw new HttpError(400, "Please enter the UTR / transaction ID from your UPI app");
  if (order.paymentStatus === "paid") throw new HttpError(400, "This order is already marked as paid");
  if (order.status === "cancelled") throw new HttpError(400, "This order was cancelled");

  order.upiRef = upiRef;
  order.paymentMethod = "upi";
  order.paymentStatus = "pending_verification";
  await order.save();
  await email.notifyAdminUpiRef(order);
  res.json({ success: true, order: publicOrder(order) });
}

module.exports = { createOrder, createCustomRequest, trackOrder, submitUpiRef, deliveryChargeFor, publicOrder };
