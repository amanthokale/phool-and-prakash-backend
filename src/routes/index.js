const express = require("express");
const { asyncHandler: a } = require("../utils/helpers");
const { requireAdmin } = require("../middleware/auth");
const { loginLimiter, orderLimiter, trackLimiter } = require("../middleware/rateLimits");
const { imageUpload } = require("../middleware/upload");
const products = require("../controllers/productController");
const orders = require("../controllers/orderController");
const admin = require("../controllers/adminController");

const router = express.Router();

// ---------- Public ----------
router.get("/products", a(products.listPublic));
router.get("/products/:slug", a(products.getPublic));
router.get("/settings/public", a(admin.publicSettings));

router.post("/orders", orderLimiter, a(orders.createOrder));
router.get("/orders/track", trackLimiter, a(orders.trackOrder));
router.post("/orders/:orderNo/upi-ref", trackLimiter, a(orders.submitUpiRef));
router.post("/custom-requests", orderLimiter, imageUpload(2, 4).array("images", 2), a(orders.createCustomRequest));

// ---------- Admin ----------
router.post("/admin/login", loginLimiter, a(admin.login));

const adminRouter = express.Router();
adminRouter.use(requireAdmin);
adminRouter.get("/me", a(admin.me));
adminRouter.put("/password", a(admin.changePassword));
adminRouter.get("/stats", a(admin.stats));

adminRouter.get("/products", a(products.listAdmin));
adminRouter.post("/products", a(products.create));
adminRouter.get("/products/:id", a(products.getAdmin));
adminRouter.put("/products/:id", a(products.update));
adminRouter.delete("/products/:id", a(products.remove));
adminRouter.post("/uploads", imageUpload(6, 4).array("images", 6), a(products.uploadImages));

adminRouter.get("/orders", a(admin.listOrders));
adminRouter.get("/orders/export.csv", a(admin.exportCsv));
adminRouter.get("/orders/:id", a(admin.getOrder));
adminRouter.patch("/orders/:id", a(admin.updateOrder));
adminRouter.delete("/orders/:id", a(admin.deleteOrder));

adminRouter.get("/settings", a(admin.getSettings));
adminRouter.put("/settings", a(admin.updateSettings));

router.use("/admin", adminRouter);

module.exports = router;
