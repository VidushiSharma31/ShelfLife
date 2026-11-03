const express = require("express");

const { chat } = require("../controllers/recommendationController");
const { optionalAuth } = require("../middleware/auth");
const { recommendationRateLimit } = require("../middleware/recommendationRateLimit");

const router = express.Router();

router.post("/chat", optionalAuth, recommendationRateLimit, chat);

module.exports = router;
