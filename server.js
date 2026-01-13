import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import LostItem from "./models/LostItem.js";
import FoundItem from "./models/FoundItem.js";

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Setup for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB connection failed:", err));

// POST /report - students submit lost item report
app.post("/report", async (req, res) => {
  try {
    const lost = new LostItem(req.body);
    await lost.save();
    res.status(201).json({ message: "Report submitted successfully!" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /missing - list of lost items
app.get("/missing", async (req, res) => {
  const missingItems = await LostItem.find();
  res.json(missingItems);
});

// GET /items - list of found items
app.get("/items", async (req, res) => {
  const foundItems = await FoundItem.find();
  res.json(foundItems);
});

// POST /admin/add-item - admin adds found items
app.post("/admin/add-item", async (req, res) => {
  const { adminUser, adminPass, name, description, imageUrl } = req.body;
  if (adminUser !== process.env.ADMIN_USER || adminPass !== process.env.ADMIN_PASS) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const newItem = new FoundItem({ name, description, imageUrl });
  await newItem.save();
  res.status(201).json({ message: "Item added successfully" });
});

// Serve frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "report.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
