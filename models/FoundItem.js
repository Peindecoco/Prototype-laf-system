import mongoose from "mongoose";

const FoundItemSchema = new mongoose.Schema({
  name: String,
  description: String,
  color: String,
  size: String,
  shape: String,
  locationFound: String,
  imageUrl: String,
  SecretDetail: String,
  dateFound: { type: Date, default: Date.now },
  claimed: { type: Boolean, default: false }
});

export default mongoose.model("FoundItem", FoundItemSchema);
