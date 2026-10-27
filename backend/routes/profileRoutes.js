const express = require("express");

const { updateProfile, getPublicProfile } = require("../controllers/profileController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/users/:userId", getPublicProfile);
router.patch("/me", requireAuth, updateProfile);

module.exports = router;
