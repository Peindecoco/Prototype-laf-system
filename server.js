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
const DEFAULT_MATCH_THRESHOLD = Number(process.env.MATCH_THRESHOLD || 0.75);
const REPORT_MATCH_THRESHOLD = Number(process.env.REPORT_MATCH_THRESHOLD || DEFAULT_MATCH_THRESHOLD);
const CLAIM_MATCH_THRESHOLD = Number(process.env.CLAIM_MATCH_THRESHOLD || DEFAULT_MATCH_THRESHOLD);
 
 app.post("/api/report", upload.single("image"), async (req, res) => {
   try {
     const body = req.body;
    
    let reportImageUrl = "";
    if (req.file && req.file.buffer) {
      const uploadResult = await uploadBufferToCloudinary(req.file.buffer, "feu_lost_reports");
      reportImageUrl = uploadResult.secure_url;
    }

     const lost = new LostItem({
       itemName: body.itemName || "",
       description: body.description || "",
       color: body.color || "",
       size: body.size || "",
       shape: body.shape || "",
       locationLost: body.locationLost || "",
       contact: body.contact || "",
       reportImageUrl
     });
     await lost.save();
 
     // After storing, we can also compute possible matches (found items) and return them
     const foundItems = await FoundItem.find({ claimed: false });
     let allMatches = [];
     try {
       allMatches = await computeMatchesAgainstFoundWithAI(foundItems, lost);
     } catch {
       allMatches = computeMatchesAgainstFound(foundItems, lost);
     }
     const threshold = REPORT_MATCH_THRESHOLD;
     const matches = allMatches.filter(match => match.score >= threshold);

     res.status(201).json({
       message: "Report saved",
       matches,
       hasMatches: matches.length > 0,
       threshold
    });
   } catch (err) {
     res.status(500).json({ error: err.message });
   }
 });
 
 app.get("/api/missing", async (req, res) => {
   try {
        const adminSecret = req.headers["x-admin-secret"] || req.query.adminSecret;
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

     const missing = await LostItem.find({ status: { $ne: "returned" } }).sort({ dateReported: -1 });
     return res.json(missing);
   } catch (err) {
     return res.status(500).json({ error: err.message });
   }
 });
 
 app.get("/api/items", async (req, res) => {
   try {
     const items = await FoundItem.find({ claimed: false }).sort({ dateFound: -1 });
     return res.json(items);
   } catch (err) {
     return res.status(500).json({ error: err.message });
   }
 });
 
 app.post("/api/admin/add-found", upload.single("image"), async (req, res) => {
   try {
     const {
       adminSecret,
       name,
       description,
       color,
       size,
       shape,
       locationFound,
       category
    } = req.body;

    if (adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ message: "Unauthorized" });
    }
 
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
       category: category || "all",
       imageUrl
     });

     await newItem.save();
     return res.status(201).json({ message: "Found item added" });
   } catch (err) {
     return res.status(500).json({ error: err.message });
   }
 });
 
 app.post("/api/claim/:id", async (req, res) => {
   try {
     const itemId = req.params.id;
     const { color, size, shape, claimDescription, claimantName, claimantContact } = req.body;
 
     const item = await FoundItem.findById(itemId);
     if (!item) return res.status(404).json({ success: false, message: "Item not found" });
     const claimData = { color, size, shape, claimDescription, claimantName, claimantContact };
    const sanitizedClaimantName = (claimantName || "").toString().trim();
    const sanitizedClaimantContact = (claimantContact || "").toString().trim();

    const fallbackScore = computeDeterministicScore(
      {
        description: item.description,
        color: item.color,
        size: item.size,
        shape: item.shape
      },
      {
        description: claimDescription,
        color,
        size,
        shape
      }
    );

    let aiResult = null;
    try {
      aiResult = await computeClaimScoreWithAI(item, claimData);
    } catch {
      aiResult = {
        score: fallbackScore,
        source: "deterministic_fallback",
        rationale: "AI unavailable; deterministic text matching used."
      };
    }
    const score = aiResult.score;
    const threshold = CLAIM_MATCH_THRESHOLD;
    const claimable = score >= threshold;

    item.claimRequests = item.claimRequests || [];
    item.claimRequests.push({
      claimantName: sanitizedClaimantName,
      claimantContact: sanitizedClaimantContact,
      claimDescription: (claimDescription || "").toString(),
      color: (color || "").toString(),
      size: (size || "").toString(),
      shape: (shape || "").toString(),
      score,
      source: aiResult.source,
      claimable,
      createdAt: new Date()
    });

    if (claimable) {
      item.claimed = true;
      item.claimantName = sanitizedClaimantName;
      item.claimantContact = sanitizedClaimantContact;
      item.claimDate = new Date();
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
      await item.save();
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
 
async function computeClaimScoreWithAI(foundItem, claimData) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for AI matching.");
  }

  const foundPayload = {
    description: foundItem.description || "",
    color: foundItem.color || "",
    size: foundItem.size || "",
    shape: foundItem.shape || ""
  };

  const claimPayload = {
    description: claimData.claimDescription || "",
    color: claimData.color || "",
    size: claimData.size || "",
    shape: claimData.shape || ""
  };

  return scoreMatchWithAI(foundPayload, claimPayload, "claim_verification");
}
async function computeMatchesAgainstFoundWithAI(foundItems, lostItem) {
  const lostPayload = {
    description: lostItem.description || "",
    color: lostItem.color || "",
    size: lostItem.size || "",
    locationFound: lostItem.locationLost || ""
  };

  const scored = await Promise.all(foundItems.map(async (item) => {
    const foundPayload = {
      description: item.description || "",
      color: item.color || "",
      size: item.size || "",
      locationFound: item.locationFound || ""
    };

    const ai = await scoreMatchWithAI(foundPayload, lostPayload, "lost_report_match");
    return {
      id: item._id,
      name: item.name,
      score: ai.score,
      rationale: ai.rationale,
      imageUrl: item.imageUrl,
      locationFound: item.locationFound,
      description: item.description
    };
  }));

  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
}

async function scoreMatchWithAI(foundPayload, inputPayload, purpose) {
  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: "You are a strict JSON matcher. Only output valid JSON." },
      {
        role: "user",
                content: `Evaluate semantic match confidence between these records for ${purpose}. Use only: description (includes secret details), color, size, and shape. Try to be strict with specific informations given by the admin and do not accept all vague descriptions given to ensure the user/s information match with the item. Return ONLY JSON: {"score": number, "reason": string}. Score must be between 0 and 1.
Found item: ${JSON.stringify(foundPayload)}
Input data: ${JSON.stringify(inputPayload)}`
      }
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
  const lostPayload = {
    description: lostItem.description || "",
    color: lostItem.color || "",
    size: lostItem.size || "",
    locationFound: lostItem.locationLost || ""
  };

  return foundItems
    .map((item) => {
      const foundPayload = {
        description: item.description || "",
        color: item.color || "",
        size: item.size || "",
        locationFound: item.locationFound || ""
      };

      const score = computeDeterministicScore(foundPayload, lostPayload);
      return {
        id: item._id,
        name: item.name,
        score,
        rationale: "Deterministic string matching applied.",
        imageUrl: item.imageUrl,
        locationFound: item.locationFound,
        description: item.description
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function computeDeterministicScore(foundPayload, inputPayload) {
  const similarity = (a, b) => {
    const left = (a || "").toString().trim().toLowerCase();
    const right = (b || "").toString().trim().toLowerCase();
    if (!left || !right) return 0;
    return stringSimilarity.compareTwoStrings(left, right);
  };

  const descriptionScore = similarity(foundPayload.description, inputPayload.description);
  const colorScore = similarity(foundPayload.color, inputPayload.color);
  const sizeScore = similarity(foundPayload.size, inputPayload.size);
  const shapeScore = similarity(foundPayload.shape, inputPayload.shape);

  return (
    descriptionScore * 0.5 +
    colorScore * 0.2 +
    sizeScore * 0.15 +
    shapeScore * 0.15
  );
}
 const PORT = process.env.PORT || 10000;
 app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
