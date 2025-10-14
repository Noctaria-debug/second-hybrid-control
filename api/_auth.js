export function assertAuth(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'] || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (token !== process.env.HYBRID_SHARED_TOKEN) {
    const e = new Error('Unauthorized'); e.statusCode = 401; throw e
  }
}
