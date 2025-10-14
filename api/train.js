import { assertAuth } from './_auth.js'
export default async function handler(req, res) {
  try { assertAuth(req) } catch (e) { return res.status(e.statusCode||401).json({ error:'unauthorized' }) }
  const suggestion = { oneChange: '今週は「ねえ」を1回だけ使う', why: '呼吸感の向上' }
  res.status(200).json(suggestion)
}
