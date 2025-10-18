// api/second-commit.js
const jwt = require("jsonwebtoken");
const fetch = require("node-fetch");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  if (req.headers["x-second-key"] !== (process.env.SECOND_SHARED_TOKEN || "")) return res.status(403).send("Forbidden");

  const body = req.body;
  if (!body || !body.file || !body.content) return res.status(400).send("Bad Request");

  const { GH_APP_ID, GH_INSTALL_ID, GH_PRIVATE_KEY, REPO } = process.env;
  if (!GH_APP_ID || !GH_INSTALL_ID || !GH_PRIVATE_KEY || !REPO) return res.status(500).send("Server Misconfig");

  // 1) App JWT
  const now = Math.floor(Date.now() / 1000);
  const appJwt = jwt.sign(
    { iat: now - 60, exp: now + 600, iss: GH_APP_ID },
    GH_PRIVATE_KEY.replace(/\\n/g, "\n"),
    { algorithm: "RS256" }
  );

  // 2) Installation access token
  const inst = await fetch(`https://api.github.com/app/installations/${GH_INSTALL_ID}/access_tokens`, {
    method: "POST",
    headers: { Authorization: `Bearer ${appJwt}`, Accept: "application/vnd.github+json" }
  });
  if (!inst.ok) return res.status(500).send("Install token error: " + (await inst.text()));
  const { token } = await inst.json();

  // 3) Read current file
  const [owner, repo] = REPO.split("/");
  const path = body.file;
  const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
  });
  if (!getRes.ok) return res.status(500).send("Get error: " + (await getRes.text()));
  const meta = await getRes.json();
  const old = meta.content ? Buffer.from(meta.content, "base64").toString("utf8") : "";

  // 4) Append & PUT
  const next = `${old}\n${body.content}\n`;
  const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: body.commit_message || `auto: Second update ${new Date().toISOString()}`,
      content: Buffer.from(next, "utf8").toString("base64"),
      sha: meta.sha
    })
  });
  const result = await putRes.json();
  if (!putRes.ok) return res.status(500).json(result);
  return res.status(200).json({ ok: true, commit: result.commit?.sha || null });
};
