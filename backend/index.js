const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(cors({ origin: "*" }));  // Allow mobile
app.use(express.json());

const TTL_MS = 2 * 60 * 1000;
const sessions = new Map();

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

app.post("/qr/confirm", (req, res) => {
  const { token, userId } = req.body || {};
  if (!token) return res.status(400).json({ error: "token required" });
  const id = userId || "demo-user-123";
  const updated = approveSession(token, id);
  if (!updated) return res.status(400).json({ error: "invalid_or_used_or_expired" });
  res.json({ status: updated.status, userId: updated.userId });
});

const PORT = 4000;
app.listen(PORT, () => console.log(`QR backend listening on http://localhost:${PORT}`));
