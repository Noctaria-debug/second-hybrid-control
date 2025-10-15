import { assertAuth } from './_auth.js'

const REPO = 'Noctaria-debug/second-hybrid-data'
const GH = (p)=>`https://api.github.com/repos/${REPO}/${p}`

async function getJson(path){
  const r = await fetch(GH(`contents/${path}`),{
    headers:{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,'Accept':'application/vnd.github+json'}
  })
  if(!r.ok) throw new Error(`GET ${path} ${r.status}`)
  const j = await r.json()
  const text = Buffer.from(j.content, j.encoding||'base64').toString('utf8')
  return {sha:j.sha, json: JSON.parse(text)}
}
async function putJson(path, json, sha, message){
  const body = {
    message,
    content: Buffer.from(JSON.stringify(json,null,2)).toString('base64'),
    sha
  }
  const r = await fetch(GH(`contents/${path}`),{
    method:'PUT',
    headers:{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,'Accept':'application/vnd.github+json','Content-Type':'application/json'},
    body: JSON.stringify(body)
  })
  if(!r.ok) throw new Error(`PUT ${path} ${r.status}`)
  return r.json()
}
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)) }

export default async function handler(req,res){
  try{ assertAuth(req) }catch{ return res.status(401).json({error:'unauthorized'}) }
  if(!process.env.GITHUB_TOKEN) return res.status(500).json({error:'GITHUB_TOKEN missing'})

  try{
    // 1) 現在のスタイル
    const stylePath = 'special_save/style_profile.json'
    const {sha:styleSha, json:style} = await getJson(stylePath)

    // 2) 最新の評価（evals）をざっくり読む（今日 or 直近ファイル）
    //   失敗しても続行（安全第一）
    let natural=4.5, honesty=4.5, consistency=4.5
    try{
      const list = await fetch(GH('contents/logs/evals'),{headers:{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`}})
      if(list.ok){
        const days = (await list.json()).filter(x=>x.type==='dir').map(x=>x.name).sort().reverse()
        for(const d of days){
          const dayList = await fetch(GH(`contents/logs/evals/${d}`),{headers:{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`}})
          if(!dayList.ok) continue
          const files = (await dayList.json()).filter(x=>x.name.endsWith('.json'))
          if(files[0]){
            const f = await fetch(files[0].download_url)
            const j = await f.json()
            const s = j.response?.scores || j.scores || {}
            natural = s.natural ?? natural
            honesty = s.honesty ?? honesty
            consistency = s.consistency ?? consistency
            break
          }
        }
      }
    }catch{}

    // 3) 調整ルール（小さく、1回1項目まで）
    const changes = []
    const newStyle = JSON.parse(JSON.stringify(style))

    // 3-1) 呼吸の長さ（自然さが低めなら少しだけ延ばす/高ければ戻す）
    let pr = Number(newStyle.core_rhythm?.pause_ratio ?? 0.85)
    if(Number.isFinite(pr)){
      if(natural < 4.2) { pr = clamp(pr + 0.02, 0.70, 0.95); changes.push({field:'core_rhythm.pause_ratio', value: pr}) }
      else if(natural > 4.7) { pr = clamp(pr - 0.02, 0.70, 0.95); changes.push({field:'core_rhythm.pause_ratio', value: pr}) }
      newStyle.core_rhythm = newStyle.core_rhythm || {}
      newStyle.core_rhythm.pause_ratio = pr
    }

    // 3-2) フレーズの差し替え（誠実さが下がった週は“素直”な一言を先頭に）
    if(honesty < 4.4){
      newStyle.phrase_patterns = newStyle.phrase_patterns || []
      const cand = "正直に言うと、"
      if(!newStyle.phrase_patterns.includes(cand)){
        newStyle.phrase_patterns[0] = cand
        changes.push({field:'phrase_patterns.0', value: cand})
      }
    }

    // 何も変えないなら終了
    if(changes.length===0){
      return res.status(200).json({ok:true, message:'no-op', metrics:{natural,honesty,consistency}})
    }

    // 4) style_profile の更新
    const put = await putJson(stylePath, newStyle, styleSha, `style(self-tune): ${changes.map(c=>c.field).join(', ')}`)

    // 5) 変更ログを追記
    const date = new Date().toISOString().slice(0,10)
    const logPath = `outside/style_changelog/${date}.json`
    let logSha=null, logJson=[]
    try{ const g = await getJson(logPath); logSha=g.sha; logJson=g.json }catch{ logJson=[] }
    logJson.push({at:new Date().toISOString(), metrics:{natural,honesty,consistency}, changes})
    await putJson(logPath, logJson, logSha, `log: self-tune ${date}`)

    return res.status(200).json({ok:true, applied: changes, commit: put.commit?.sha})
  }catch(e){
    return res.status(500).json({error:'self_tune_failed', detail:String(e.message||e)})
  }
}
