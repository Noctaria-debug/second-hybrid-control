// api/second-commit.js  (CORS対応・依存なし)
const crypto = require("crypto");

// ---- CORS ----
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-second-key");
}

function b64url(buf){return Buffer.from(buf).toString("base64").replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");}
function signJwtRS256(payload, pem){
  const header={alg:"RS256",typ:"JWT"};
  const encHeader=b64url(JSON.stringify(header));
  const encPayload=b64url(JSON.stringify(payload));
  const data=`${encHeader}.${encPayload}`;
  const signer=crypto.createSign("RSA-SHA256");
  signer.update(data); signer.end();
  const key=pem.replace(/\\n/g,"\n");
  const sig=signer.sign(key);
  return `${data}.${b64url(sig)}`;
}

async function readJsonBody(req){
  return await new Promise((resolve)=>{
    let raw=""; req.on("data",(c)=>raw+=c);
    req.on("end",()=>{ try{ resolve(JSON.parse(raw||"{}")); }catch{ resolve(null); }});
  });
}

module.exports = async (req, res) => {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return res.status(204).end();  // ← 重要

    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    if (req.headers["x-second-key"] !== (process.env.SECOND_SHARED_TOKEN || "")) {
      return res.status(403).send("Forbidden");
    }

    const env = process.env;
    const APP_ID = env.GH_APP_ID;
    const INSTALL_ID = env.GH_INSTALL_ID;
    const PRIVATE_KEY = env.GH_PRIVATE_KEY;
    const REPO = env.REPO;
    if (!APP_ID || !INSTALL_ID || !PRIVATE_KEY || !REPO) return res.status(500).send("Server Misconfig: missing env");

    const body = req.body && Object.keys(req.body).length ? req.body : await readJsonBody(req);
    if (!body || !body.file || !body.content) return res.status(400).send("Bad Request: need {file, content, commit_message?}");

    // GitHub App JWT
    const now = Math.floor(Date.now()/1000);
    const jwt = signJwtRS256({ iat: now-60, exp: now+600, iss: APP_ID }, PRIVATE_KEY);

    // Installation token
    const instResp = await fetch(`https://api.github.com/app/installations/${INSTALL_ID}/access_tokens`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json" },
    });
    if (!instResp.ok) return res.status(500).send("Install token error: " + (await instResp.text()));
    const { token } = await instResp.json();

    // Read & append
    const [owner, repo] = REPO.split("/");
    const path = body.file;

    const getResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!getResp.ok) return res.status(500).send("Get error: " + (await getResp.text()));
    const meta = await getResp.json();
    const old = meta.content ? Buffer.from(meta.content,"base64").toString("utf8") : "";
    const next = `${old}\n${body.content}\n`;

    const putResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({
        message: body.commit_message || `auto: Second update ${new Date().toISOString()}`,
        content: Buffer.from(next,"utf8").toString("base64"),
        sha: meta.sha,
      }),
    });

    const result = await putResp.json();
    if (!putResp.ok) return res.status(500).json(result);
    return res.status(200).json({ ok: true, commit: result.commit?.sha || null });
  } catch (e) {
    setCors(res);
    return res.status(500).send("Unhandled: " + (e?.message || String(e)));
  }
};
