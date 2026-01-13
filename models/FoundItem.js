import mongoose from "mongoose";

const FoundItemSchema = new mongoose.Schema({
  name: String,
  description: String,
  imageUrl: String,
  dateFound: { type: Date, default: Date.now }
});

export default mongoose.model("FoundItem", FoundItemSchema);
