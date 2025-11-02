import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

// --- MongoDB connection ---
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// --- Schema ---
const itemSchema = new mongoose.Schema({
  name: String,
  description: String,
  color: String,
  size: String,
  shape: String,
  location: String,
  imageUrl: String,
  status: { type: String, default: "pending" }, // pending or approved
});
const Item = mongoose.model("Item", itemSchema);

// --- User reports a lost item ---
app.post("/api/report", async (req, res) => {
  try {
    const newItem = new Item({
      name: req.body.name,
      description: req.body.description,
      color: req.body.color,
      size: req.body.size,
      shape: req.body.shape,
      location: req.body.location,
      status: "pending",
    });
    await newItem.save();
    res.json({ message: "Report submitted. Awaiting admin approval." });
  } catch (err) {
    res.status(500).json({ error: "Failed to submit report." });
  }
});

// --- Admin fetch all pending items ---
app.get("/api/admin/pending", async (req, res) => {
  const { adminSecret } = req.query;
  if (adminSecret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Unauthorized" });
  const items = await Item.find({ status: "pending" });
  res.json(items);
});

// --- Admin approve item ---
app.post("/api/admin/approve/:id", async (req, res) => {
  const { adminSecret, imageUrl } = req.body;
  if (adminSecret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Unauthorized" });
  await Item.findByIdAndUpdate(req.params.id, {
    status: "approved",
    imageUrl: imageUrl || "",
  });
  res.json({ message: "Item approved successfully." });
});

// --- Public: fetch approved items only ---
app.get("/api/items", async (req, res) => {
  const items = await Item.find({ status: "approved" });
  res.json(items);
});

// --- Start Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
