import mongoose from "mongoose";

const LostItemSchema = new mongoose.Schema({
  itemName: String,
  locationLost: String,
  color: String,
  size: String,
  shape: String,
  secretDetail: String,
  status: { type: String, default: "missing" }
});

export default mongoose.model("LostItem", LostItemSchema);
