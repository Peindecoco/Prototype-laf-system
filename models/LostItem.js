import mongoose from "mongoose";

const LostItemSchema = new mongoose.Schema({
  itemName: String,
  description: String,
  color: String,
  size: String,
  shape: String,
  locationLost: String,
  secretDetail: String,
  contact: String,
  dateReported: { type: Date, default: Date.now },
  status: { type: String, default: "missing" }
});

export default mongoose.model("LostItem", LostItemSchema);
