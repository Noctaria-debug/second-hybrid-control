import { assertAuth } from './_auth.js'

const REPO = 'Noctaria-debug/second-hybrid-data'
const FILE = 'special_save/style_profile.json'
const GH_API = `https://api.github.com/repos/${REPO}/contents/${FILE}`

async function getFile() {
  const r = await fetch(GH_API, {
    headers: {
      'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json'
    }
  })
  if (!r.ok) throw new Error(`GitHub GET failed: ${r.status}`)
  const j = await r.json()
  const content = Buffer.from(j.content, j.encoding || 'base64').toString('utf8')
  return { sha: j.sha, json: JSON.parse(content) }
}

async function putFile(updatedJson, prevSha, message) {
  const body = {
    message: message || 'style: update',
    content: Buffer.from(JSON.stringify(updatedJson, null, 2)).toString('base64'),
    sha: prevSha
  }
  const r = await fetch(GH_API, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  if (!r.ok) throw new Error(`GitHub PUT failed: ${r.status}`)
  return r.json()
}

function setByPath(obj, path, value) {
  const keys = path.split('.')
  let cur = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {}
    cur = cur[keys[i]]
  }
  cur[keys.at(-1)] = value
  return obj
}

export default async function handler(req, res) {
  try { assertAuth(req) } catch (e) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  try {
    const { field = 'tone.base', value, message } = req.body || {}
    if (!value) return res.status(400).json({ error: 'missing value' })
    if (!process.env.GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN missing' })

    const { sha, json } = await getFile()
    const updated = setByPath({ ...json }, field, value)
    const put = await putFile(updated, sha, message || `style: update ${field}`)
    return res.status(200).json({ ok: true, field, newValue: value, commit: put.commit?.sha })
  } catch (e) {
    return res.status(500).json({ error: 'update_failed', detail: String(e.message || e) })
  }
}
