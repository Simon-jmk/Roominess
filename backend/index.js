const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs").promises;
const path = require("path");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const TTL_MS = 2 * 60 * 1000;
const sessions = new Map();
const SESSIONS_FILE = path.join(__dirname, "sessions.txt");

const VALID_ROOMS = ["room15"]; // Add more rooms here

// Generate hashed session token
function generateSessionToken(roomId) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.createHash("sha256").update(roomId + salt).digest("hex");
  return hash.substring(0, 16); // First 16 chars
}

// Save session to file
async function saveSessionToFile(roomId, sessionToken) {
  const sessionData = {
    roomId,
    sessionToken,
    timestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
  };
  
  try {
    await fs.appendFile(SESSIONS_FILE, JSON.stringify(sessionData) + "\n");
    console.log(`✅ Session saved to ${SESSIONS_FILE}`);
  } catch (err) {
    console.error(`❌ Failed to save session: ${err.message}`);
  }
}

function createSession() {
  const token = crypto.randomUUID();
  const session = {
    token,
    status: "pending",
    createdAt: Date.now(),
    ttlMs: TTL_MS,
  };
  sessions.set(token, session);
  return session;
}

function touchExpiry(session) {
  const now = Date.now();
  if (now - session.createdAt > session.ttlMs && session.status === "pending") {
    session.status = "expired";
  }
  return session;
}

function getSession(token) {
  const session = sessions.get(token);
  if (!session) return;
  const updated = touchExpiry(session);
  sessions.set(token, updated);
  return updated;
}

function approveSession(token, userId) {
  const session = getSession(token);
  if (!session || session.status !== "pending") return;
  session.status = "approved";
  session.userId = userId;
  sessions.set(token, session);
  return session;
}

app.post("/qr/session", (req, res) => {
  const session = createSession();
  res.json({ token: session.token, expiresInMs: session.ttlMs });
});

app.get("/qr/status", (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: "token required" });
  const session = getSession(token);
  if (!session) return res.status(404).json({ error: "not_found" });
  res.json({ status: session.status, userId: session.userId || null });
});

app.post("/qr/confirm", async (req, res) => {
  const { token, userId } = req.body || {};
  
  if (!token) {
    return res.status(400).json({ error: "token required" });
  }

  console.log(`📱 QR Scanned: "${token}"`);

  // Check if it's a room QR code
  if (VALID_ROOMS.includes(token)) {
    console.log(`✅ Valid room: ${token}`);
    
    // Generate hashed session token
    const sessionToken = generateSessionToken(token);
    console.log(`🔐 Session token: ${sessionToken}`);

    // Save to file
    await saveSessionToFile(token, sessionToken);

    // Return success
    return res.json({
      status: "approved",
      roomId: token,
      sessionToken: sessionToken,
      message: `Access granted to ${token}`,
    });
  }

  // Fallback to old session logic
  const id = userId || "demo-user-123";
  const updated = approveSession(token, id);
  
  if (!updated) {
    return res.status(400).json({ error: "invalid_or_used_or_expired" });
  }

  res.json({ status: updated.status, userId: updated.userId });
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`✅ QR backend listening on http://localhost:${PORT}`);
  console.log(`✅ Sessions will be saved to: ${SESSIONS_FILE}`);
  console.log(`✅ Valid rooms: ${VALID_ROOMS.join(", ")}`);
});
