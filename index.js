// index.js
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(cors());

// Parse accounts map from env: cloud_name -> { api_key, api_secret }
const ACCOUNTS = (() => {
  try {
    return JSON.parse(process.env.CLOUDINARY_ACCOUNTS_JSON || "{}");
  } catch (e) {
    console.error("Failed to parse CLOUDINARY_ACCOUNTS_JSON:", e.message);
    return {};
  }
})();

// Optional default/single account
const DEFAULT_ACCOUNT = {
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
};

// From: https://res.cloudinary.com/<cloud>/<image|video>/<type>/v123/...
function parseFromUrl(secureUrl) {
  const m = typeof secureUrl === "string"
    ? secureUrl.match(/res\.cloudinary\.com\/([^/]+)\/(image|video)\/([^/]+)\//)
    : null;
  if (!m) return {};
  const [, cloud_name, resource_type, type] = m;
  return { cloud_name, resource_type, type };
}

function getCredsForCloud(cloud_name) {
  if (!cloud_name) return null;
  if (ACCOUNTS[cloud_name]) {
    const { api_key, api_secret } = ACCOUNTS[cloud_name];
    return { cloud_name, api_key, api_secret };
  }
  if (DEFAULT_ACCOUNT.cloud_name === cloud_name) return DEFAULT_ACCOUNT;
  return null;
}

app.get("/", (req, res) => {
  res.send("Hello from the Cloudinary Delete Server!");
});

app.post("/deleteMedia", async (req, res) => {
  try {
    let { public_id, cloud_name, secure_url, resource_type, type, invalidate } = req.body;
    if (!public_id) return res.status(400).json({ error: "public_id is required" });
    public_id = String(public_id).trim();

    if ((!cloud_name || !resource_type || !type) && secure_url) {
      const parsed = parseFromUrl(secure_url);
      cloud_name = cloud_name || parsed.cloud_name;
      resource_type = resource_type || parsed.resource_type;
      type = type || parsed.type;
    }

    resource_type = resource_type || "image";
    type = type || "upload";
    const shouldInvalidate = invalidate !== false;

    const creds = getCredsForCloud(cloud_name) || (DEFAULT_ACCOUNT.cloud_name ? DEFAULT_ACCOUNT : null);
    if (!creds?.cloud_name || !creds?.api_key || !creds?.api_secret) {
      return res.status(400).json({
        error:
          "Missing credentials. Provide 'cloud_name' or 'secure_url' and configure CLOUDINARY_ACCOUNTS_JSON or default envs.",
      });
    }

    const endpoint = `https://api.cloudinary.com/v1_1/${creds.cloud_name}/resources/${resource_type}/${type}`;
    const { data } = await axios.delete(endpoint, {
      auth: { username: creds.api_key, password: creds.api_secret },
      data: { public_ids: [public_id], invalidate: shouldInvalidate },
    });

    return res.json(data);
  } catch (err) {
    console.error("Error deleting media:", err?.response?.data || err.message);
    return res.status(500).json({ error: "Failed to delete media" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
