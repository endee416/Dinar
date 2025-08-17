// index.js
// Run: node index.js
// Env needed (Railway / .env):
//   PORT=3000
//   // Optional default/single account (used if cloud_name matches or nothing else provided):
//   CLOUD_NAME=your_default_cloud
//   CLOUDINARY_API_KEY=xxx
//   CLOUDINARY_API_SECRET=yyy
//   // Multi-account map (one-line JSON). Keys are cloud_name values.
//   // Example:
//   // CLOUDINARY_ACCOUNTS_JSON={"ddlubqotl":{"api_key":"KEY_A","api_secret":"SECRET_A"},"dvberoxgh":{"api_key":"KEY_B","api_secret":"SECRET_B"}}
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(cors());

// Parse accounts map from env (cloud_name -> {api_key, api_secret})
const ACCOUNTS = (() => {
  try {
    return JSON.parse(process.env.CLOUDINARY_ACCOUNTS_JSON || "{}");
  } catch (e) {
    console.error("Failed to parse CLOUDINARY_ACCOUNTS_JSON:", e.message);
    return {};
  }
})();

// Optional default account (single-account fallback)
const DEFAULT_ACCOUNT = {
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
};

// Helper: parse cloud_name, resource_type, type from a Cloudinary secure URL.
// e.g. https://res.cloudinary.com/<cloud>/image/upload/v123/...
function parseFromUrl(secureUrl) {
  const m =
    typeof secureUrl === "string"
      ? secureUrl.match(/res\.cloudinary\.com\/([^/]+)\/(image|video)\/([^/]+)\//)
      : null;
  if (!m) return {};
  const [, cloud_name, resource_type, type] = m; // type often "upload"
  return { cloud_name, resource_type, type };
}

// Helper: choose credentials for a given cloud_name
function getCredsForCloud(cloud_name) {
  if (!cloud_name) return null;
  if (ACCOUNTS[cloud_name]) {
    return { cloud_name, api_key: ACCOUNTS[cloud_name].api_key, api_secret: ACCOUNTS[cloud_name].api_secret };
  }
  if (DEFAULT_ACCOUNT.cloud_name && DEFAULT_ACCOUNT.cloud_name === cloud_name) {
    return { cloud_name, api_key: DEFAULT_ACCOUNT.api_key, api_secret: DEFAULT_ACCOUNT.api_secret };
  }
  return null;
}

// Health root
app.get("/", (req, res) => {
  res.send("Hello from the Cloudinary Delete Server!");
});

/**
 * DELETE endpoint (POST body) to remove a Cloudinary asset.
 * Body:
 * {
 *   public_id: "folder/file",               // required
 *   cloud_name?: "dvberoxgh",               // recommended
 *   secure_url?: "https://res.cloudinary... // optional (server can parse)
 *   resource_type?: "image" | "video",      // optional
 *   type?: "upload" | "private" | ...       // optional (defaults to 'upload')
 *   invalidate?: boolean                    // optional (defaults to true)
 * }
 */
app.post("/deleteMedia", async (req, res) => {
  try {
    let { public_id, cloud_name, secure_url, resource_type, type, invalidate } = req.body;

    if (!public_id) {
      return res.status(400).json({ error: "public_id is required" });
    }
    public_id = String(public_id).trim();

    // Derive missing fields from secure_url if present
    if ((!cloud_name || !resource_type || !type) && secure_url) {
      const parsed = parseFromUrl(secure_url);
      cloud_name = cloud_name || parsed.cloud_name;
      resource_type = resource_type || parsed.resource_type;
      type = type || parsed.type;
    }

    // Sensible defaults
    resource_type = resource_type || "image";
    type = type || "upload";
    const shouldInvalidate = invalidate !== false; // default true

    // Figure out which account creds to use
    const creds = getCredsForCloud(cloud_name) || (DEFAULT_ACCOUNT.cloud_name ? DEFAULT_ACCOUNT : null);
    if (!creds || !creds.api_key || !creds.api_secret || !creds.cloud_name) {
      return res.status(400).json({
        error:
          "No credentials for this cloud. Provide 'cloud_name' or 'secure_url' (and configure CLOUDINARY_ACCOUNTS_JSON / default envs).",
      });
    }

    // Use Admin API DELETE to remove by public_ids (supports invalidate + videos)
    const endpoint = `https://api.cloudinary.com/v1_1/${creds.cloud_name}/resources/${resource_type}/${type}`;

    const { data } = await axios.delete(endpoint, {
      auth: { username: creds.api_key, password: creds.api_secret },
      data: { public_ids: [public_id], invalidate: shouldInvalidate },
    });

    // Typical success: { deleted: { "folder/file": "deleted" }, partial: false, ... }
    return res.json(data);
  } catch (err) {
    const detail = err?.response?.data || err.message;
    console.error("Error deleting media:", detail);
    return res.status(500).json({ error: "Failed to delete media" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
