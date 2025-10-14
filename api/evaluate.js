import { assertAuth } from './_auth.js'
export default async function handler(req, res) {
  try { assertAuth(req) } catch (e) { return res.status(e.statusCode||401).json({ error:'unauthorized' }) }
  const { sessionId = 'n/a', log = '' } = req.body || {}
  const scores = {
    natural: log.length > 0 ? 4.0 : 3.0,
    honesty: 4.6,
    consistency: 4.5
  }
  return res.status(200).json({ sessionId, scores, oneLine: '最小評価OK' })
}
