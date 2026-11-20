const nodemailer = require("nodemailer");
const { formatINR, escapeHtml: h } = require("../utils/helpers");

const STATUS_TEXT = {
  new: "Received",
  confirmed: "Confirmed",
  in_progress: "Being handmade",
  ready: "Ready for pickup / dispatch",
  shipped: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

let transporter = null;

const isConfigured = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

const siteUrl = () =>
  (process.env.PUBLIC_SITE_URL || (process.env.FRONTEND_URL || "").split(",")[0] || "").trim().replace(/\/$/, "");

const adminInbox = () => process.env.ADMIN_NOTIFY_EMAIL || process.env.SMTP_USER;

// Never throws: an email problem must not fail an order.
async function send({ to, subject, html, replyTo }) {
  if (!to) return;
  if (!isConfigured()) {
    console.log(`[email skipped, SMTP not configured] to=${to} subject="${subject}"`);
    return;
  }
  try {
    const sending = getTransporter().sendMail({
      from: process.env.MAIL_FROM || `RangPop <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      replyTo,
    });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("SMTP timeout")), 9000));
    await Promise.race([sending, timeout]);
  } catch (err) {
    console.error(`Email to ${to} failed:`, err.message);
  }
}

function layout(title, body) {
  return `<div style="background:#fff7f3;padding:24px;font-family:Arial,sans-serif;color:#33231f">
  <div style="max-width:560px;margin:auto;background:#fff;border:1px solid #f3d6da;padding:24px">
    <p style="margin:0;color:#c4502f;font-size:11px;font-weight:bold;letter-spacing:2px">RANGPOP</p>
    <h1 style="margin:8px 0 16px;color:#8a2c5a;font-family:Georgia,serif;font-weight:normal;font-size:24px">${title}</h1>
    ${body}
    <p style="margin-top:24px;color:#9a8874;font-size:11px">RangPop · your happy place for handmade things</p>
  </div></div>`;
}

function itemsTable(order) {
  const rows = order.items
    .map((i) => {
      const custom = i.customisation ? `<br><small style="color:#76665a">${h(i.customisation)}</small>` : "";
      const price = i.price == null ? "Price to be confirmed" : formatINR(i.price * i.qty);
      return `<tr><td style="padding:6px 0;border-bottom:1px solid #f3d6da">${h(i.name)} × ${i.qty}${custom}</td>
        <td style="padding:6px 0;border-bottom:1px solid #f3d6da;text-align:right">${price}</td></tr>`;
    })
    .join("");
  const total = order.priceConfirmed ? formatINR(order.total) : `${formatINR(order.total)} + items to be priced`;
  return `<table style="width:100%;border-collapse:collapse;font-size:13px">${rows}
    <tr><td style="padding:6px 0">Delivery</td><td style="text-align:right">${formatINR(order.deliveryCharge)}</td></tr>
    <tr><td style="padding:6px 0;font-weight:bold;color:#8a2c5a">Total</td>
      <td style="text-align:right;font-weight:bold;color:#8a2c5a">${total}</td></tr></table>`;
}

function customBlock(order) {
  if (order.type !== "custom") return "";
  const c = order.custom || {};
  const imgs = (order.referenceImages || []).map((u) => `<a href="${h(u)}">${h(u)}</a>`).join("<br>");
  return `<p style="font-size:13px;line-height:1.7"><b>Idea:</b> ${h(c.what)}<br>
    <b>Colours:</b> ${h(c.colours) || "-"}<br><b>Occasion:</b> ${h(c.occasion) || "-"}<br>
    <b>Budget:</b> ${h(c.budget) || "-"}${imgs ? `<br><b>Reference photos:</b><br>${imgs}` : ""}</p>`;
}

const typeLabel = (t) => ({ order: "order", quote: "quote request", custom: "custom order request" })[t] || "order";

function button(url, text) {
  return `<p><a href="${h(url)}" style="display:inline-block;background:#8a2c5a;color:#fff;padding:10px 16px;text-decoration:none;font-size:13px">${text}</a></p>`;
}

async function notifyAdminNewOrder(order) {
  const c = order.customer;
  const where = order.deliveryMethod === "pickup" ? "Pickup" : `📍 ${h(c.address)}, ${h(c.city)} ${h(c.pincode)}`;
  const body = `
    <p style="font-size:14px">New ${typeLabel(order.type)} <b>${h(order.orderNo)}</b> from <b>${h(c.name)}</b>.</p>
    <p style="font-size:13px;line-height:1.7">📞 <a href="tel:${h(c.phone)}">${h(c.phone)}</a>${c.email ? ` · ✉️ ${h(c.email)}` : ""}<br>
    ${where}<br>
    ${order.neededBy ? `Needed by: <b>${order.neededBy.toDateString()}</b><br>` : ""}
    Payment: <b>${order.paymentMethod.toUpperCase()}</b></p>
    ${order.items.length ? itemsTable(order) : ""}
    ${customBlock(order)}
    ${order.giftNote ? `<p style="font-size:13px"><b>Gift note:</b> ${h(order.giftNote)}</p>` : ""}
    ${order.notes ? `<p style="font-size:13px"><b>Notes:</b> ${h(order.notes)}</p>` : ""}
    ${siteUrl() ? button(`${siteUrl()}/admin/orders/${order._id}`, "Open in admin") : ""}`;
  await send({
    to: adminInbox(),
    subject: `🛍️ New ${typeLabel(order.type)} ${order.orderNo} · ${c.name}`,
    html: layout(`New ${typeLabel(order.type)}`, body),
    replyTo: c.email || undefined,
  });
}

function trackLink(order) {
  return siteUrl() ? button(`${siteUrl()}/order/${order.orderNo}`, "Track your order") : "";
}

async function notifyCustomerReceived(order) {
  if (!order.customer.email) return;
  let next = "We'll look at your request and get back to you with the price and timeline.";
  if (order.type === "order") {
    next =
      order.paymentMethod === "upi"
        ? "Once your UPI payment is verified we'll confirm your order and start making it."
        : "We'll confirm your order shortly. You pay when it's delivered.";
  }
  await send({
    to: order.customer.email,
    subject: `We got your ${typeLabel(order.type)} ${order.orderNo} 💐`,
    html: layout(
      `Thank you, ${h(order.customer.name.split(" ")[0])}!`,
      `<p style="font-size:14px">Your ${typeLabel(order.type)} number is <b>${h(order.orderNo)}</b>. ${next}</p>
       ${order.items.length ? itemsTable(order) : ""}${customBlock(order)}${trackLink(order)}`
    ),
  });
}

async function notifyCustomerStatus(order, note) {
  if (!order.customer.email) return;
  await send({
    to: order.customer.email,
    subject: `Your RangPop order ${order.orderNo}: ${STATUS_TEXT[order.status]}`,
    html: layout(
      STATUS_TEXT[order.status],
      `<p style="font-size:14px">Order <b>${h(order.orderNo)}</b> is now <b>${STATUS_TEXT[order.status]}</b>.</p>
       ${note ? `<p style="font-size:13px">${h(note)}</p>` : ""}${trackLink(order)}`
    ),
  });
}

async function notifyCustomerPriced(order) {
  if (!order.customer.email) return;
  await send({
    to: order.customer.email,
    subject: `Your RangPop quote for ${order.orderNo} is ready`,
    html: layout(
      "Your quote is ready",
      `<p style="font-size:14px">Here is the price for <b>${h(order.orderNo)}</b>. Reply to this email or DM us to go ahead.</p>
       ${itemsTable(order)}${trackLink(order)}`
    ),
  });
}

async function notifyAdminUpiRef(order) {
  await send({
    to: adminInbox(),
    subject: `💸 UPI payment submitted for ${order.orderNo}`,
    html: layout(
      "Check a UPI payment",
      `<p style="font-size:14px">${h(order.customer.name)} says they paid <b>${formatINR(order.total)}</b> for <b>${h(order.orderNo)}</b>.</p>
       <p style="font-size:14px">UTR / transaction ID: <b>${h(order.upiRef)}</b></p>
       <p style="font-size:13px">Check your bank or UPI app, then mark the order as paid in the admin panel.</p>
       ${siteUrl() ? button(`${siteUrl()}/admin/orders/${order._id}`, "Open in admin") : ""}`
    ),
  });
}

module.exports = {
  STATUS_TEXT,
  isConfigured,
  notifyAdminNewOrder,
  notifyCustomerReceived,
  notifyCustomerStatus,
  notifyCustomerPriced,
  notifyAdminUpiRef,
};
