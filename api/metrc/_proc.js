// Processing runs (phase 4 + 5, SQL 181). One run = input packages (unbucked / bucked) > output packages (bucked, standards,
// smalls, trim) + mold (waste) + moisture / difference. In METRC, in this order:
//   proc_output  each output: a new package on its tag, made from the run's input package(s), share by weight, item = the
//                output's app item (made on this license in METRC first if it isn't there).
//   run_waste    what's left in each input after the outputs: mold as a "Waste" adjustment, the rest as "Drying" (bucking) or
//                "Scale variance" (other runs). Lands each input on the app's weight (0 when the whole package was used).
//   proc_used    whole inputs: finished at 0. Part of a package: a check that METRC = the app.
import { Skip, Wait, all, cached, db, enc, lc, one, packageAnywhere, packageByTag, pallet, r4, rpc, tol, up, write, ymd } from './_core.js'
import { createFromPackages, reasonFor } from './_pkg.js'

const LBX = /^(lb|lbs|pound|pounds)$/i
const lbsOnly = (p, tag) => { if (!LBX.test(p.unitOfMeasureAbbreviation || '')) throw new Error(`METRC has ${tag} in ${p.unitOfMeasureAbbreviation || '?'}, not pounds. Do this one by hand.`) }

async function runInputs(runId) {
  const ins = (await db(`proc_run_inputs?run_id=eq.${Number(runId)}&select=pallet_id,lbs,whole&order=id`)) ?? []
  if (!ins.length) throw new Error('This run has no input packages in the app')
  const pals = (await db(`pallets?id=in.(${ins.map(i => Number(i.pallet_id)).join(',')})&select=id,code,package_tag,tag_pending,current_weight,their_tag`)) ?? []
  return ins.map(i => ({ ...i, lbs: Number(i.lbs), p: pals.find(x => x.id === i.pallet_id) }))
}

// earlier to-dos on the input tags (a retag, a repackage, a receive) go first
async function inputsReady(job, ins) {
  const tags = ins.map(i => up(i.p?.package_tag)).filter(Boolean)
  if (!tags.length) return
  const e = await db(`comp_metrc_actions?select=id,action&touch_tags=ov.{${tags.map(enc).join(',')}}&status=in.(todo,error)&id=lt.${job.id}` +
    `&kind=not.in.(proc_output,proc_used,run_waste,ship_check)&order=id&limit=1`)
  if (e?.length) throw new Wait(`Waiting on an earlier to-do on the input package: #${e[0].id} ${e[0].action}`)
}

async function pendingOfRun(job, kinds) {
  const run = job.details?.run_id
  if (run == null) return null
  return (await db(`comp_metrc_actions?select=id,action&kind=in.(${kinds.join(',')})&status=in.(todo,error)&details->>run_id=eq.${Number(run)}` +
    `&id=neq.${job.id}&order=id&limit=1`))?.[0] ?? null
}

// split a weight across the inputs by what each put in (the last one takes the rounding)
function shares(total, ins) {
  const sum = ins.reduce((a, i) => a + i.lbs, 0)
  let left = r4(total)
  return ins.map((i, k) => { const s = k === ins.length - 1 ? left : r4(total * (sum ? i.lbs / sum : 1 / ins.length)); left = r4(left - s); return s })
}

async function outputItem(ctx, lic, out) {
  const it = out.item_id ? await one(`items?id=eq.${out.item_id}&select=id,metrc_name`) : null
  if (!it?.metrc_name) throw new Error(`${out.code} has no item in the app. Give it an item card, then send.`)
  const items = await cached(ctx, `items:${lic}`, () => all('/v2/packages/create/source-items', { licenseNumber: lic }, 10).catch(() => []))
  const hit = items.find(i => lc(i.name) === lc(it.metrc_name))
  if (hit) return hit
  if (ctx.live) {
    const a = await rpc('metrc_queue_item_on', { p_item: it.id, p_license: lic }).catch(e => { throw new Error(`METRC has no "${it.metrc_name}" item on ${lic}, and queuing it failed: ${e.message}`) })
    throw new Wait(`Making the item "${it.metrc_name}" on ${lic} in METRC first${a ? ` (to-do #${a})` : ''}. This one goes after it.`)
  }
  throw new Error(`METRC has no "${it.metrc_name}" item on ${lic} yet. When live, the app makes it first (Create item to-do), then this package.`)
}

export async function sendProcOutput(job, ctx) {
  const d = job.details || {}, lic = job.license
  if (!lic) throw new Error('No license on this to-do')
  const out = await pallet(job.pallet_id)
  if (!out) throw new Error('The output package is gone from the app')
  if (!out.package_tag) throw new Wait(`${out.code} has no METRC tag yet (tag pending). Set the tag, then send.`)
  const tag = up(out.package_tag)
  if (await packageByTag(lic, tag)) throw new Skip(`METRC already has ${tag}`)
  const ins = await runInputs(d.run_id)
  await inputsReady(job, ins)
  const t = await tol()
  const qty = r4(job.lbs ?? out.og_weight)
  if (!(qty > 0)) throw new Error('No weight on this output')
  const part = shares(qty, ins)
  const sources = []
  for (const [k, i] of ins.entries()) {
    if (!i.p?.package_tag) throw new Wait(`Input ${i.p?.code ?? i.pallet_id} has no METRC tag yet`)
    const src = await packageByTag(lic, i.p.package_tag)
    if (!src) {
      const where = await packageAnywhere(lic, i.p.package_tag)
      throw new Error(`Input ${i.p.code} (${up(i.p.package_tag)}) is ${where ? where.state : 'not'} in METRC on ${lic}${where ? ', not active' : ''}`)
    }
    lbsOnly(src, i.p.package_tag)
    if (r4(src.quantity) + t < part[k]) throw new Error(`METRC has only ${src.quantity} lb left in ${up(i.p.package_tag)} (${i.p.code}); ${out.code} takes ${part[k]} from it. Check the run's weights.`)
    sources.push({ tag: i.p.package_tag, p: src, take: Math.min(part[k], r4(src.quantity)), finish: false })
  }
  const item = await outputItem(ctx, lic, out)
  const r = await createFromPackages(ctx, job, { tag, qty, item: item.id, sources, note: `Lifted app ${out.code}: ${d.product ?? out.product ?? ''} from run ${d.run ?? ''}` })
  r.info += ` · item ${item.name}`
  return r
}

export async function sendRunWaste(job, ctx) {
  const d = job.details || {}, lic = job.license
  if (!lic) throw new Error('No license on this to-do')
  const wait = await pendingOfRun(job, ['proc_output'])
  if (wait) throw new Wait(`Waiting on the run's new packages first: #${wait.id} ${wait.action}`)
  const ins = await runInputs(d.run_id)
  await inputsReady(job, ins)
  const mold = r4(d.mold ?? 0), loss = r4(d.loss ?? 0)
  if (Math.abs(mold) < 0.0001 && Math.abs(loss) < 0.0001) throw new Skip('No mold and no weight loss on this run')
  const t = await tol(), date = ymd(job.at)
  const moldPart = shares(mold, ins), lossPart = shares(loss, ins)
  const rWaste = await reasonFor(ctx, lic, 'waste')
  const rLoss = await reasonFor(ctx, lic, d.kind === 'buck' ? 'drying' : 'scale')
  const body = [], did = [], done = []
  for (const [k, i] of ins.entries()) {
    const tagI = up(i.p?.package_tag)
    if (!tagI) throw new Wait(`Input ${i.p?.code ?? i.pallet_id} has no METRC tag yet`)
    const src = await packageByTag(lic, tagI)
    const end = i.whole ? 0 : r4(Number(i.p.current_weight ?? 0))
    if (!src) {
      if (i.whole) { done.push(`${i.p.code} already finished`); continue }
      throw new Error(`Input ${i.p.code} (${tagI}) isn't active in METRC on ${lic}`)
    }
    lbsOnly(src, tagI)
    const cur = r4(src.quantity), need = r4(cur - end), both = r4(moldPart[k] + lossPart[k])
    let steps
    if (Math.abs(need) <= 0.0001) { done.push(`${i.p.code} already at ${end} lb`); continue }
    if (Math.abs(need - both) <= t) steps = [['mold', moldPart[k], rWaste], ['loss', r4(need - moldPart[k]), rLoss]]
    else if (Math.abs(need - lossPart[k]) <= t) steps = [['loss', need, rLoss]]   // mold already sent
    else throw new Error(`METRC has ${cur} lb in ${tagI} (${i.p.code}). After the run's packages it should have ${both} lb of mold + moisture left to take off (to ${end} lb), not ${need}. Check the run and METRC, then fix by hand.`)
    let q = cur
    for (const [what, lbs, reason] of steps) {
      if (Math.abs(lbs) < 0.0001) continue
      const nq = r4(q - lbs)
      body.push({ id: src.id, isFinishedGood: false, currentQuantity: q, currentQuantityUom: src.unitOfMeasureAbbreviation,
        adjustmentQuantity: r4(-lbs), adjustmentUnitOfMeasureId: src.unitOfMeasureId, newQuantity: nq, newQuantityUom: src.unitOfMeasureAbbreviation,
        adjustmentReasonId: reason.id, reasonNote: `Lifted app run ${d.run ?? ''} ${i.p.code}: ${what === 'mold' ? 'mold / refuse' : d.kind === 'buck' ? 'moisture loss (bucking)' : 'weight difference'} ${lbs} lb`.slice(0, 250),
        adjustmentDate: date })
      did.push(`${i.p.code} ${what === 'mold' ? 'mold' : 'moisture'} -${lbs} lb (${reason.name})`)
      q = nq
    }
  }
  if (!body.length) throw new Skip(`Nothing to take off: ${done.join('; ')}`)
  // one adjustment at a time, so a mold + moisture pair on the same package lands in order
  const resp = []
  for (const b of body) resp.push(await write(ctx, '/v2/packages/adjust', lic, [b]))
  const info = did.join('; ')
  if (!ctx.live) return { state: 'checked', request: body, response: resp, info: `Dry run OK: ${info}` }
  return { state: 'sent', request: body, response: resp, info: `METRC: ${info}` }
}

export async function sendProcUsed(job, ctx) {
  const d = job.details || {}, lic = job.license
  if (!lic) throw new Error('No license on this to-do')
  const wait = await pendingOfRun(job, ['proc_output', 'run_waste'])
  if (wait) throw new Wait(`Waiting on the run's packages and waste first: #${wait.id} ${wait.action}`)
  if (!job.tag) throw new Error('This input has no METRC tag')
  const t = await tol(), p = await packageByTag(lic, job.tag)
  if (!p) {
    const where = await packageAnywhere(lic, job.tag)
    if (where && where.state !== 'active') throw new Skip(`Already ${where.state === 'inactive' ? 'finished' : where.state} in METRC`)
    throw new Error(`Tag ${up(job.tag)} isn't in METRC on ${lic}`)
  }
  const cur = r4(p.quantity)
  if (!d.whole) {
    const pal = job.pallet_id ? await pallet(job.pallet_id) : null
    const app = r4(Number(pal?.current_weight ?? 0))
    if (Math.abs(cur - app) <= t) throw new Skip(`METRC has ${cur} lb left in ${up(job.tag)}, the app ${app}: same`)
    throw new Error(`METRC has ${cur} lb left in ${up(job.tag)}, the app has ${pal?.code ?? ''} at ${app} lb. Check the run, then fix the weight.`)
  }
  if (cur > t) throw new Error(`METRC still has ${cur} lb in ${up(job.tag)} after the run's packages and waste (should be 0). Check the run's weights, then fix by hand.`)
  const date = ymd(job.at)
  let body, path
  if (Math.abs(cur) < 0.0001) { path = '/v2/packages/finish'; body = [{ id: p.id, actualDate: date }] }
  else {
    const reason = await reasonFor(ctx, lic, 'scale')
    path = '/v2/packages/adjust'
    body = [{ id: p.id, adjustmentQuantity: -cur, adjustmentUnitOfMeasureId: p.unitOfMeasureId, newQuantity: 0, adjustmentReasonId: reason.id,
              reasonNote: `Lifted app run ${d.run ?? ''}: used up (${cur} lb rounding)`.slice(0, 250), adjustmentDate: date, finishDate: date }]
  }
  const resp = await write(ctx, path, lic, body)
  const what = cur ? `adjust ${cur} > 0 and finish ${up(job.tag)}` : `finish ${up(job.tag)} (at 0)`
  if (!ctx.live) return { state: 'checked', request: body, response: resp, info: `Dry run OK: ${what}` }
  if (await packageByTag(lic, job.tag)) throw new Error(`Sent, but ${up(job.tag)} is still active in METRC. Check it in METRC.`)
  return { state: 'sent', request: body, response: resp, info: `METRC: ${what}` }
}
