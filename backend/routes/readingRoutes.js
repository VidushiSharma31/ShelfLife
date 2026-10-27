const express = require("express");

const { updateReading, removeReading, dashboard } = require("../controllers/readingController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);
router.get("/dashboard", dashboard);
router.route("/:entryId")
  .patch(updateReading)
  .delete(removeReading);

module.exports = router;
