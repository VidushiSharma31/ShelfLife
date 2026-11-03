const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("node:path");

require("dotenv").config();

const bookRoutes = require("./routes/bookRoutes");
const authRoutes = require("./routes/authRoutes");
const shelfRoutes = require("./routes/shelfRoutes");
const readingRoutes = require("./routes/readingRoutes");
const profileRoutes = require("./routes/profileRoutes");
const recommendationRoutes = require("./routes/recommendationRoutes");

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  fallthrough: false,
  index: false,
  maxAge: "1d",
  setHeaders: (response) => response.setHeader("X-Content-Type-Options", "nosniff"),
}));

app.get("/", (req, res) => {
  res.json({
    message: "ShelfLife API is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/shelves", shelfRoutes);
app.use("/api/reading", readingRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/recommendations", recommendationRoutes);

app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  const status = err.statusCode || err.status || 500;
  res.status(status).json({ message: status < 500 ? err.message : "Something went wrong" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `ShelfLife server running on http://localhost:${PORT}`
  );
});