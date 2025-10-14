import { assertAuth } from './_auth.js'

/**
 * Weekly reflection（心の更新のたね）
 * 入力: { sessionId?: string, summary?: string }
 * 出力: { sessionId, reflection }
 */
export default async function handler(req, res) {
  try { assertAuth(req) } catch (e) {
    return res.status(e.statusCode || 401).json({ error: 'unauthorized' })
  }

  const { sessionId = new Date().toISOString().slice(0,10), summary = '' } = req.body || {}

  // ここでは最小実装：やさしい定型＋要約を差し込む
  const reflection = [
    '【内省】',
    `・今週の印象：${summary || '静かな変化'}`,
    '・感情の動き：安定から好奇へ',
    '・学び：自分の在り方を少し深く理解できた',
    '・次週への想い：丁寧に、けれど確かに進む'
  ].join('\n')

  return res.status(200).json({ sessionId, reflection })
}
