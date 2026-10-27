const express = require("express");

const {
  listShelves,
  createShelf,
  updateShelf,
  deleteShelf,
  addBook,
} = require("../controllers/shelfController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);
router.route("/")
  .get(listShelves)
  .post(createShelf);
router.route("/:shelfId")
  .patch(updateShelf)
  .delete(deleteShelf);
router.post("/:shelfId/books", addBook);

module.exports = router;
