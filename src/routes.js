const express = require("express");
const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "API is running" });
});

router.use("/auth", require("./modules/auth/auth.routes"));
router.use("/users", require("./modules/user/user.routes"));
router.use("/groups", require("./modules/group/group.routes"));
router.use("/messages", require("./modules/message/message.routes"));

const { productRouter, stockRouter } = require("./modules/stock/stock.routes");
router.use("/products", productRouter);
router.use("/stock", stockRouter);
router.use("/productions", require("./modules/production/production.routes"));
router.use("/quality-tests", require("./modules/quality/quality.routes"));
router.use("/incidents", require("./modules/hse/hse.routes"));
router.use("/notifications", require("./modules/notification/notification.routes"));

module.exports = router;
