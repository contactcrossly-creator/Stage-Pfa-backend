const express = require("express");

const authController = require("./auth.controller");
const {
  authenticate,
  loginRateLimiter,
} = require("../../middlewares/auth.middleware");

const router = express.Router();

router.post("/login", loginRateLimiter, authController.login);
router.post("/change-password", authenticate, authController.changePassword);

// Exchange JWT for a Firebase custom token (used by Flutter to sign into Firestore)
router.get("/firebase-token", authenticate, authController.getFirebaseToken);

module.exports = router;
