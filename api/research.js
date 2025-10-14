import { assertAuth } from './_auth.js'
export default async function handler(req, res) {
  try { assertAuth(req) } catch (e) { return res.status(e.statusCode||401).json({ error:'unauthorized' }) }
  const { domain='life' } = req.body || {}
  const findings = ['観察を具体化するとバーが伸びやすい','事例に数値を添えると評価が安定']
  const barDelta = domain==='transport' ? { transport: +2 } : { life: +2 }
  res.status(200).json({ domain, findings, barDelta })
}
