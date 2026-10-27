const express = require("express");

const {
  updateProfile,
  getPublicProfile,
  getFavoriteGenres,
  updateFavoriteGenres,
  uploadProfilePicture,
  removeProfilePicture,
} = require("../controllers/profileController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/users/:userId", getPublicProfile);
router.patch("/me", requireAuth, updateProfile);
router.get("/me/genres", requireAuth, getFavoriteGenres);
router.put("/me/genres", requireAuth, updateFavoriteGenres);
router.put("/me/avatar", requireAuth, express.raw({ type: () => true, limit: "5mb" }), uploadProfilePicture);
router.delete("/me/avatar", requireAuth, removeProfilePicture);

module.exports = router;
