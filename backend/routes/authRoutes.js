const express = require("express");

const {
  register,
  login,
  logout,
  getCurrentUser,
  refreshAccessToken,
} = require("../controllers/authController");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", optionalAuth, logout);
router.post("/refresh", refreshAccessToken);
router.get("/me", requireAuth, getCurrentUser);

module.exports = router;
