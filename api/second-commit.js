// api/second-commit.js
// Vercel Node Serverless / 依存ゼロ版（CORS + 404新規作成 + 409リトライ）
const crypto = require("crypto");

// ---------- CORS ----------
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-second-key");
}

// ---------- JWT (RS256) ----------
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function signJwtRS256(payload, pem) {
  const header = { alg: "RS256", typ: "JWT" };
  const encHeader = b64url(JSON.stringify(header));
  const encPayload = b64url(JSON.stringify(payload));
  const data = `${encHeader}.${encPayload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(data); signer.end();
  const key = (pem || "").replace(/\\n/g, "\n");            // 環境変数の \n を実改行へ
  const sig = signer.sign(key);
  return `${data}.${b64url(sig)}`;
}

// ---------- Body 取得（保険） ----------
async function readJsonBody(req) {
  if (req.body && Object.keys(req.body).length) return req.body;
  return await new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve(null); } });
  });
}

// ---------- GitHub Contents API 呼び出し ----------
async function getFileMeta(token, owner, repo, path) {
  const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (r.status === 404) return { sha: null, content: "" };         // ファイルが無ければ新規扱い
  if (!r.ok) throw new Error("Get error: " + (await r.text()));
  const meta = await r.json();
  const text = meta.content ? Buffer.from(meta.content, "base64").toString("utf8") : "";
  return { sha: meta.sha, content: text };
}
async function putFile(token, owner, repo, path, sha, message, text) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const body = {
    message,
    content: Buffer.from(text, "utf8").toString("base64"),
    ...(sha ? { sha } : {}),
  };
  return await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

module.exports = async (req, res) => {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    // 認証（共有キー）
    if (req.headers["x-second-key"] !== (process.env.SECOND_SHARED_TOKEN || "")) {
      return res.status(403).send("Forbidden");
    }

    // 環境変数
    const { GH_APP_ID, GH_INSTALL_ID, GH_PRIVATE_KEY, REPO } = process.env;
    if (!GH_APP_ID || !GH_INSTALL_ID || !GH_PRIVATE_KEY || !REPO) {
      return res.status(500).send("Server Misconfig: missing env");
    }

    // リクエスト
    const body = await readJsonBody(req);
    if (!body || !body.file || !body.content) {
      return res.status(400).send("Bad Request: need {file, content, commit_message?}");
    }

    // GitHub App JWT
    const now = Math.floor(Date.now() / 1000);
    const jwt = signJwtRS256({ iat: now - 60, exp: now + 600, iss: GH_APP_ID }, GH_PRIVATE_KEY);

    // Installation Access Token
    const instRes = await fetch(`https://api.github.com/app/installations/${GH_INSTALL_ID}/access_tokens`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json" },
    });
    if (!instRes.ok) return res.status(500).send("Install token error: " + (await instRes.text()));
    const { token } = await instRes.json();

    // ターゲット
    const [owner, repo] = REPO.split("/");
    const path = body.file;
    const message = body.commit_message || `auto: Second update ${new Date().toISOString()}`;

    // ---- 競合に強い upsert（404→新規/ 409→リトライ）----
    let tries = 0;
    while (true) {
      tries++;

      // 最新取得
      const meta = await getFileMeta(token, owner, repo, path);
      const base = meta.content;
      const needsNL = base.length > 0 && !base.endsWith("\n");
      const nextText = `${base}${needsNL ? "\n" : ""}${body.content}\n`;

      // PUT
      const putRes = await putFile(token, owner, repo, path, meta.sha, message, nextText);
      if (putRes.ok) {
        const result = await putRes.json();
        return res.status(200).json({ ok: true, commit: result.commit?.sha || null, retries: tries - 1 });
      }

      // 409: sha衝突 → 少し待って再試行（最大2回）
      if (putRes.status === 409 && tries < 3) {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }

      // その他エラー
      const errText = await putRes.text();
      return res.status(500).send(errText);
    }
  } catch (e) {
    setCors(res);
    return res.status(500).send("Unhandled: " + (e?.message || String(e)));
  }
};
