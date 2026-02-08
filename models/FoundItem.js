import mongoose from "mongoose";

const FoundItemSchema = new mongoose.Schema({
  name: String,
  description: String,
  color: String,
  size: String,
  shape: String,
  locationFound: String,
  imageUrl: String,
  secretDetail: String,
  dateFound: { type: Date, default: Date.now },
  claimed: { type: Boolean, default: false },
  claimantName: { type: String, default: "" },
  claimantContact: { type: String, default: "" },
  claimDate: { type: Date },
  claimRequests: [{
    claimantName: { type: String, default: "" },
    claimantContact: { type: String, default: "" },
    secretDetail: { type: String, default: "" },
    claimDescription: { type: String, default: "" },
    color: { type: String, default: "" },
    size: { type: String, default: "" },
    shape: { type: String, default: "" },
    score: { type: Number, default: 0 },
    source: { type: String, default: "" },
    claimable: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  }]
});

export default mongoose.model("FoundItem", FoundItemSchema);
