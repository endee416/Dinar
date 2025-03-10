// index.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;

const app = express();
app.use(bodyParser.json());
app.use(cors());

// 1. Configure Cloudinary with your credentials
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 2. A simple route to test if server is running
app.get("/", (req, res) => {
  res.send("Hello from the Cloudinary Delete Server!");
});

// 3. The delete endpoint
app.post("/deleteMedia", async (req, res) => {
  try {
    const { public_id } = req.body;
    if (!public_id) {
      return res.status(400).json({ error: "public_id is required" });
    }
    // Use Cloudinary Admin API to delete by public_id
    const result = await cloudinary.uploader.destroy(public_id);
    // result might look like: { result: "ok" } on success
    res.json(result);
  } catch (err) {
    console.error("Error deleting media:", err);
    res.status(500).json({ error: "Failed to delete media" });
  }
});

// 4. Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
