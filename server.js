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
import OpenAI from "openai";

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
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

@@ -88,90 +91,209 @@ app.post("/api/admin/add-found", upload.single("image"), async (req, res) => {
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
      secretDetail: secretDetail || "",
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
    const { secretDetail, color, size, shape, claimDescription, claimantName, claimantContact } = req.body;

    const item = await FoundItem.findById(itemId);
    if (!item) return res.status(404).json({ success: false, message: "Item not found" });
    const claimData = { secretDetail, color, size, shape, claimDescription, claimantName, claimantContact };
    const fallbackScore = computeClaimScore(item, claimData);

    const aiResult = await computeClaimScoreWithChatGPT(item, claimData);
    const score = aiResult.score;

    const threshold = Number(process.env.MATCH_THRESHOLD || 0.75);
    if (score >= threshold) {
      item.claimed = true;
      await item.save();
      return res.json({
        success: true,
        score,
        threshold,
        source: aiResult.source,
        rationale: aiResult.rationale,
        message: "Match success — item marked claimed"
      });
    } else {
      return res.json({
        success: false,
        score,
        threshold,
        source: aiResult.source,
        rationale: aiResult.rationale,
        fallbackScore,
        message: "Not a close enough match"
      });
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
  const weights = { secret: 0.55, color: 0.15, size: 0.1, shape: 0.1, context: 0.1 };
  const normalize = (text) => (text || "").toString().toLowerCase().trim();

  const foundSecretCorpus = normalize([
    foundItem.secretDetail,
    foundItem.description,
    foundItem.name,
    foundItem.locationFound
  ].filter(Boolean).join(" "));

  const claimSecretCorpus = normalize([
    claimData.secretDetail,
    claimData.claimDescription
  ].filter(Boolean).join(" "));

  const secretScore = stringSimilarity.compareTwoStrings(foundSecretCorpus, claimSecretCorpus);
  const colorScore = stringSimilarity.compareTwoStrings(normalize(foundItem.color), normalize(claimData.color));
  const sizeScore = stringSimilarity.compareTwoStrings(normalize(foundItem.size), normalize(claimData.size));
  const shapeScore = stringSimilarity.compareTwoStrings(normalize(foundItem.shape), normalize(claimData.shape));

  const foundContext = normalize([foundItem.name, foundItem.description].filter(Boolean).join(" "));
  const claimContext = normalize([claimData.claimDescription, claimData.secretDetail].filter(Boolean).join(" "));
  const contextScore = stringSimilarity.compareTwoStrings(foundContext, claimContext);

  const overall =
    secretScore * weights.secret +
    colorScore * weights.color +
    sizeScore * weights.size +
    shapeScore * weights.shape +
    contextScore * weights.context;

  return Math.max(0, Math.min(1, overall));
}

async function computeClaimScoreWithChatGPT(foundItem, claimData) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      score: computeClaimScore(foundItem, claimData),
      source: "fallback-local",
      rationale: "OPENAI_API_KEY is not configured, local matcher used instead."
    };
  }

  const foundPayload = {
    name: foundItem.name || "",
    description: foundItem.description || "",
    color: foundItem.color || "",
    size: foundItem.size || "",
    shape: foundItem.shape || "",
    locationFound: foundItem.locationFound || "",
    secretDetail: foundItem.secretDetail || ""
  };

  const claimPayload = {
    secretDetail: claimData.secretDetail || "",
    claimDescription: claimData.claimDescription || "",
    claimantName: claimData.claimantName || "",
    claimantContact: claimData.claimantContact || "",
    color: claimData.color || "",
    size: claimData.size || "",
    shape: claimData.shape || ""
  };

  const prompt = `You are validating if a student's claim likely matches a found item.
Compare the found item and claimant details and return strict JSON only:
{"score": number, "reason": string}

Rules:
- score must be from 0 to 1.
- score is textual/semantic match confidence.
- 0.75 or higher means claimable, lower means not claimable.
- Give a concise reason.

Found item data: ${JSON.stringify(foundPayload)}
Claim data: ${JSON.stringify(claimPayload)}`;

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: "You output strict JSON only." },
        { role: "user", content: prompt }
      ]
    });

    const content = response?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(extractJson(content));
    const parsedScore = Number(parsed.score);
    const safeScore = Number.isFinite(parsedScore) ? Math.max(0, Math.min(1, parsedScore)) : 0;

    return {
      score: safeScore,
      source: "chatgpt",
      rationale: parsed.reason || "AI text matching applied."
    };
  } catch (error) {
    return {
      score: computeClaimScore(foundItem, claimData),
      source: "fallback-local",
      rationale: `OpenAI check failed, local matcher used: ${error.message}`
    };
  }
}

function extractJson(text) {
  const trimmed = (text || "").trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return "{}";
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
