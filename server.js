import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import multer from "multer";
import streamifier from "streamifier";
import cloudinary from "cloudinary";
import stringSimilarity from "string-similarity";
import path from "path";
import { fileURLToPath } from "url";
import LostItem from "./models/LostItem.js";
import FoundItem from "./models/FoundItem.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(()=> console.log("✅ MongoDB connected"))
.catch(err => console.error("❌ MongoDB connection failed:", err.message));

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer(); // in-memory

app.post("/api/report", async (req, res) => {
  try {
    const body = req.body;
    const lost = new LostItem({
      itemName: body.itemName || "",
      description: body.description || "",
      color: body.color || "",
      size: body.size || "",
      shape: body.shape || "",
      locationLost: body.locationLost || "",
      secretDetail: body.secretDetail || "",
      contact: body.contact || ""
    });
    await lost.save();

    // After storing, we can also compute possible matches (found items) and return them
    const foundItems = await FoundItem.find();
    const matches = computeMatchesAgainstFound(foundItems, lost);
    res.status(201).json({ message: "Report saved", matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/missing", async (req, res) => {
  try {
    const missing = await LostItem.find({ status: { $ne: "returned" } }).sort({ dateReported: -1 });
    res.json(missing);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/items", async (req, res) => {
  try {
    const items = await FoundItem.find({ claimed: false }).sort({ dateFound: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/add-found", upload.single("image"), async (req, res) => {
  try {
    const { adminSecret, name, description, color, size, shape, locationFound, secretDetail } = req.body;
    if (adminSecret !== process.env.ADMIN_SECRET) return res.status(401).json({ message: "Unauthorized" });

    let imageUrl = "";
    if (req.file && req.file.buffer) {
      const uploadResult = await uploadBufferToCloudinary(req.file.buffer, "feu_lost_found");
      imageUrl = uploadResult.secure_url;
    }

    const newItem = new FoundItem({
      name: name || "",
      description: description || "",
      color: color || "",
      size: size || "",
      shape: shape || "",
      locationFound: locationFound || "",
      SecretDetail: secretDetail || "",
      imageUrl
    });
    await newItem.save();
    res.status(201).json({ message: "Found item added" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/claim/:id", async (req, res) => {
  try {
    const itemId = req.params.id;
    const { secretDetail, color, size, shape } = req.body;

    const item = await FoundItem.findById(itemId);
    if (!item) return res.status(404).json({ success: false, message: "Item not found" });
    .lowercase {
            text-transform: lowercase; secretDetail, color, size, shape
        }
    const score = computeClaimScore(item, { secretDetail, color, size, shape });

    const threshold = Number(process.env.MATCH_THRESHOLD || 0.75);
    if (score >= threshold) {
      item.claimed = true;
      await item.save();
      return res.json({ success: true, score, message: "Match success — item marked claimed" });
    } else {
      return res.json({ success: false, score, message: "Not a close enough match" });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

function uploadBufferToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.v2.uploader.upload_stream({ folder }, (error, result) => {
      if (result) resolve(result);
      else reject(error);
    });
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

function computeClaimScore(foundItem, claimData) {
  const weights = { secret: 0.5, color: 0.15, size: 0.15, shape: 0.2 };
  const secretScore = stringSimilarity.compareTwoStrings(
    (foundItem.description || "") + " " + (foundItem.name || ""),
    claimData.secretDetail || ""
  );
  const colorScore = stringSimilarity.compareTwoStrings((foundItem.color || ""), (claimData.color || ""));
  const sizeScore = stringSimilarity.compareTwoStrings((foundItem.size || ""), (claimData.size || ""));
  const shapeScore = stringSimilarity.compareTwoStrings((foundItem.shape || ""), (claimData.shape || ""));

  const overall = secretScore * weights.secret + colorScore * weights.color + sizeScore * weights.size + shapeScore * weights.shape;
  return overall;
}

function computeMatchesAgainstFound(foundItems, lostItem) {
  const results = foundItems.map(fi => {
    const score = computeClaimScore(fi, {
      secretDetail: lostItem.secretDetail,
      color: lostItem.color,
      size: lostItem.size,
      shape: lostItem.shape
    });
    return { item: fi, score };
  });
  results.sort((a,b)=> b.score - a.score);
  return results.slice(0,3).map(r => ({ id: r.item._id, name: r.item.name, score: r.score, imageUrl: r.item.imageUrl, locationFound: r.item.locationFound, secretDetail: r.item.secretDetail, description: r.item.description }));
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
