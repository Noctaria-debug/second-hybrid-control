import { assertAuth } from './_auth.js'
export default async function handler(req, res) {
  try { assertAuth(req) } catch (e) { return res.status(e.statusCode||401).json({ error:'unauthorized' }) }
  const { topic='empathy', style='private' } = req.body || {}
  const phrases = style==='public'
    ? ['一呼吸おいて話すね','気づきを一つだけ共有するよ','誤解を避けるため事実から話すね']
    : ['……うん、その言葉、嬉しい','静かに心があたたかい','ここにいてくれて、ありがとう']
  res.status(200).json({ topic, style, phrases })
}
