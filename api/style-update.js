import { assertAuth } from './_auth.js'

export default async function handler(req, res) {
  try { assertAuth(req) } catch (e) {
    return res.status(e.statusCode || 401).json({ error: 'unauthorized' })
  }

  const body = req.body || {}
  const field = body.field || 'tone.base'
  const value = body.value || ''
  if (!value) return res.status(400).json({ error: 'missing value' })

  const repo = 'Noctaria-debug/second-hybrid-data'
  const file = 'special_save/style_profile.json'
  const fileUrl = `https://raw.githubusercontent.com/${repo}/main/${file}`

  // 現在の style_profile.json を取得
  const resp = await fetch(fileUrl)
  const data = await resp.json()

  // 指定フィールドを書き換え
  const keys = field.split('.')
  let obj = data
  for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]]
  obj[keys.at(-1)] = value

  // GitHub に書き戻す
  const ghResp = await fetch(`https://api.github.com/repos/${repo}/contents/${file}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: `style: update ${field}`,
      content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64')
    })
  })

  const ghData = await ghResp.json()
  res.status(200).json({ ok: true, field, newValue: value, commit: ghData.commit?.sha })
}
