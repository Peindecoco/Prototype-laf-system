import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------- MongoDB Connection ---------- */
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI is not set. Please set MONGO_URI in your .env or Render environment.");
} else {
  mongoose
    .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("❌ MongoDB error:", err));
}

/* ---------- Schema / Model ---------- */
const itemSchema = new mongoose.Schema({
  name: String,
  description: String,
  color: String,
  size: String,
  shape: String,
  location: String,
  secretDetail: String,
  imageUrl: String,
  status: { type: String, default: "pending" }, // 'pending' or 'approved'
  createdAt: { type: Date, default: Date.now }
});
const Item = mongoose.model("Item", itemSchema);

/* ---------- Routes ---------- */

// User: submit a report (status = pending)
app.post("/api/report", async (req, res) => {
  try {
    const newItem = new Item({
      name: req.body.name || "",
      description: req.body.description || "",
      color: req.body.color || "",
      size: req.body.size || "",
      shape: req.body.shape || "",
      location: req.body.location || "",
      status: "pending"
    });
    await newItem.save();
    res.json({ message: "Report submitted. Awaiting admin approval." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to submit report." });
  }
});

// Admin: fetch pending reports (requires adminSecret in query)
app.get("/api/admin/pending", async (req, res) => {
  const adminSecret = req.query.adminSecret;
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  try {
    const items = await Item.find({ status: "pending" }).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch pending reports." });
  }
});

// Admin: approve an item (provide adminSecret and optional imageUrl in body)
app.post("/api/admin/approve/:id", async (req, res) => {
  const adminSecret = req.body.adminSecret;
  const imageUrl = req.body.imageUrl || "";
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  try {
    await Item.findByIdAndUpdate(req.params.id, { status: "approved", imageUrl });
    res.json({ message: "Item approved successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to approve item." });
  }
});

// Public: fetch approved items only
app.get("/api/items", async (req, res) => {
  try {
    const items = await Item.find({ status: "approved" }).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch items." });
  }
});

// Serve a default route if needed
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ---------- Start ---------- */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
