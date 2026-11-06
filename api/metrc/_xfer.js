// Transfers and manifests (OHR <> GVR, out to processors, to customers), the per-stop checklist, receiving.
// Decisions: no prices on manifests; the transporter is our C13, or an outside carrier's own license when it has one (202).
import {
  LB, Skip, Wait, all, db, enc, first, inputs, list, localDT, lc, one, packageByTag, r4, rpc, setting, t3, tol, up, write, ymd,
} from './_core.js'

const TYPE_SETTING = { internal: 'comp.metrc_ttype_internal', customer: 'comp.metrc_ttype_customer', processor: 'comp.metrc_ttype_processor', nursery: 'comp.metrc_ttype_nursery' }
const TYPE_LABEL = { internal: 'between our licenses', customer: 'customer manifests', processor: 'processor runs', nursery: 'nursery clones out' }

async function facility(ctx, path, license, lic) {
  const key = `fac:${path}:${license}:${lic}`
  ctx.cache ??= {}
  if (!(key in ctx.cache)) {
    ctx.cache[key] = (async () => {
      const f = await first(path, { licenseNumber: license, filter: `licenseNumber__eq:${lic}` }).catch(() => null)
      if (f && up(f.licenseNumber) === up(lic)) return f
      const rows = await all(path, { licenseNumber: license }, 10).catch(() => [])
      return rows.find(x => up(x.licenseNumber) === up(lic)) ?? null
    })()
  }
  return ctx.cache[key]
}
const transportLicense = async () => (await one('licenses?active=eq.true&kind=in.(transport,distributor)&select=license_no,kind&order=sort'))?.license_no ?? null

/**
 * Everything a METRC transfer needs, checked. spec: { kind, typeKey, license, toLicense, toName, fromAddress, toAddress, driver, driverLicense,
 * make, model, plate, packages: [{ tag, lbs, code, tag_pending }], invoice, selfIds }
 * Returns { checks: [{ key, label, ok, detail }], body, ids } (body null when a check failed).
 */
export async function planTransfer(ctx, spec) {
  const checks = []
  const add = (key, label, ok, detail = null) => { checks.push({ key, label, ok: !!ok, detail }); return !!ok }
  const lic = spec.license
  const inp = await inputs(ctx, lic, '/v2/transfers/create/inputs').catch(e => ({ error: e.message }))
  if (inp.error) { add('inputs', 'METRC transfer form', false, inp.error); return { checks, body: null } }

  // transfer type: set in Settings, and one that doesn't need prices
  const types = inp.transferTypes ?? []
  // not set yet (or set to a type this license doesn't have): METRC's plain "Transfer" type, for our own moves and customers alike
  const setType = await setting(TYPE_SETTING[spec.typeKey], '')
  const typeName = (setType && types.some(t => lc(t.name) === lc(setType)) ? setType : '') || types.find(t => lc(t.name) === 'transfer')?.name || setType
  const type = typeName ? types.find(t => lc(t.name) === lc(typeName)) : null
  const wholesale = type && /wholesale/i.test(`${type.transactionType ?? ''} ${type.transactionTypeName ?? ''}`)
  add('type', 'Transfer type', type && !wholesale,
    !typeName ? `Pick the METRC transfer type for ${TYPE_LABEL[spec.typeKey]} in Compliance > Settings > METRC through T3. METRC's types: ${types.map(t => t.name).join(', ')}`
      : !type ? `"${typeName}" isn't one of ${lic}'s transfer types in METRC (${types.map(t => t.name).join(', ')})`
        : wholesale ? `"${type.name}" is a wholesale type (needs prices). We don't put prices on manifests: pick another type.` : type.name)

  // the shipping license's phone (Compliance > Settings, 202), always (Aziz 11/4); else the default in Settings, else METRC's default
  const licPhone = String((await one(`licenses?license_no=eq.${enc(lic)}&select=metrc_phone`).catch(() => null))?.metrc_phone ?? '').trim()
  const dflt = String(await setting('comp.metrc_phone', '') ?? '').trim()
  const phone = licPhone || dflt || inp.defaultPhoneNumberForQuestions || ''
  add('phone', 'Phone for questions', phone, phone ? `${phone}${licPhone ? ` (${lic})` : ' (default)'}`
    : `Add a phone for ${lic} in Compliance > Settings > METRC through T3`)

  const dest = spec.toLicense ? await facility(ctx, '/v2/transfers/create/destinations', lic, spec.toLicense) : null
  add('destination', 'Destination license', dest, !spec.toLicense ? `${spec.toName ?? 'The destination'} has no license number in the app`
    : dest ? `${dest.facilityName ?? ''} ${spec.toLicense}` : `${spec.toLicense} isn't a destination ${lic} can ship to in METRC`)

  const tl = spec.transporter ?? await transportLicense()
  const tr = tl ? await facility(ctx, '/v2/transfers/create/transporters', lic, tl) : null
  add('transporter', spec.transporter ? 'Transporter (carrier)' : 'Transporter (our C13)', tr, !tl ? 'No transport license in the app (Compliance > Licenses)' : tr ? `${tr.facilityName ?? ''} ${tl}` : `${tl} isn't a transporter ${lic} can use in METRC`)

  // driver: METRC's registered driver for this license if the name matches, else what the app has
  const md = (inp.drivers ?? []).find(x => !x.isArchived && lc(x.name) === lc(spec.driver))
  const dl = md?.driversLicenseNumber || spec.driverLicense || ''
  const occ = md?.employeeId || dl
  add('driver', 'Driver', spec.driver && dl, !spec.driver ? 'Pick the driver on the load' : !dl ? `${spec.driver} has no driver's license number (Compliance > Vehicles > Drivers)` : `${spec.driver} · DL ${dl}${md ? ' (METRC driver)' : ''}`)
  const mv = (inp.vehicles ?? []).find(x => !x.isArchived && up(x.licensePlateNumber) === up(spec.plate))
  const make = mv?.make || spec.make, model = mv?.model || spec.model, plate = mv?.licensePlateNumber || spec.plate
  add('vehicle', 'Vehicle', make && model && plate, make && model && plate ? `${make} ${model} · ${plate}` : `The truck needs make, model and plate (Compliance > Vehicles). Has: ${[make, model, plate].filter(Boolean).join(' ') || 'nothing'}`)

  // packages: tagged, active on this license in METRC, weights match, nothing earlier still waiting on them
  const pk = spec.packages ?? []
  const noTag = pk.filter(p => !p.tag || p.tag_pending)
  add('tags', 'Every package has a METRC tag', pk.length && !noTag.length, !pk.length ? 'No packages' : noTag.length ? `No tag: ${noTag.map(p => p.code).join(', ')}` : `${pk.length} packages`)
  const t = await tol()
  const found = [], missing = [], held = [], off = []
  // a few at a time, and a look that errors (T3 busy / rate limit) is tried again before it counts as missing
  const look1 = async tag => { try { return await packageByTag(lic, tag) } catch { await new Promise(r => setTimeout(r, 800)); return packageByTag(lic, tag).catch(() => undefined) } }
  // a manifest that's already made (Stage at OHR, 197): its packages may show as in transit in METRC
  const look = async tag => {
    const m = await look1(tag)
    if (m || !spec.allowInTransit) return m
    const j = await t3('GET', '/v2/packages/intransit', { query: { licenseNumber: lic, filter: `label__eq:${up(tag)}`, pageSize: 5 } }).catch(() => null)
    const x = list(j).find(p => up(p.label ?? p.packageLabel) === up(tag))
    return x ? { ...x, id: x.id ?? x.packageId, quantity: x.quantity ?? x.shippedQuantity, unitOfMeasureAbbreviation: x.unitOfMeasureAbbreviation ?? x.shippedUnitOfMeasureAbbreviation, isInTransit: false } : m
  }
  const unsure = []
  const todo = pk.filter(p => p.tag)
  for (let i = 0; i < todo.length; i += 4) await Promise.all(todo.slice(i, i + 4).map(async p => {
    const m = await look(p.tag)
    if (m === undefined) { unsure.push(`${p.code} ${up(p.tag)}`); return }
    if (!m) { missing.push(`${p.code} ${up(p.tag)}`); return }
    if (m.isOnHold || m.isOnInvestigationHold || (m.isInTransit && !spec.allowInTransit)) held.push(`${p.code} (${m.isInTransit ? 'in transit' : 'on hold'})`)
    if (p.lbs != null && LB.test(m.unitOfMeasureAbbreviation || '') && Math.abs(r4(m.quantity) - r4(p.lbs)) > t) off.push(`${p.code}: METRC ${m.quantity}, app ${r4(p.lbs)}`)
    found.push({ ...p, m })
  }))
  add('metrc', `Active on ${lic} in METRC`, !missing.length && !unsure.length && !held.length && found.length,
    missing.length ? `Not active on ${lic}: ${missing.join(', ')}` : unsure.length ? `METRC didn't answer for ${unsure.join(', ')}. Run Check METRC again.`
      : held.length ? held.join(', ') : `${found.length} packages`)
  add('weights', 'Weights match METRC', !off.length, off.length ? `${off.join('; ')} (more than ${t} lb apart: adjust first)` : 'All within tolerance')
  const tags = pk.map(p => up(p.tag)).filter(Boolean)
  const open = tags.length ? await db(`comp_metrc_actions?select=id,action,tag&touch_tags=ov.{${tags.map(enc).join(',')}}&status=in.(todo,error)&kind=not.in.(transfer,manifest,ship_check,receive,tag,new_package)` +
    `${spec.beforeId ? `&id=lt.${spec.beforeId}` : ''}&order=id&limit=5`) : []
  add('open', 'METRC to-dos done first', !open.length, open.length ? `Still to do in METRC: ${open.map(o => `#${o.id} ${o.action}${o.tag ? ` ${o.tag}` : ''}`).join('; ')}` : 'Nothing waiting')

  if (checks.some(c => !c.ok)) return { checks, body: null, type }
  const unitLb = (inp.unitsOfMeasure ?? []).find(u => /^(lb|pound)/i.test(u.abbreviation ?? u.name ?? ''))?.id
  // the departure time picked at Depart (loaded the night before, leaving early), never earlier than 5 minutes from now
  const planned = spec.loadId ? (await db(`loads?id=eq.${Number(spec.loadId)}&select=depart_planned`).catch(() => []))?.[0]?.depart_planned : null
  const dep = spec.depart ?? new Date(Math.max(Date.now() + 5 * 60000, planned ? new Date(planned).getTime() : 0))
  const transit = (Number(await setting('comp.metrc_transit_hours', '3')) || 3) * 3600000
  const arr = spec.arrive && spec.arrive.getTime() > dep.getTime() + 30 * 60000 ? spec.arrive : new Date(dep.getTime() + transit)
  const gross = !!type.requiresPackagesGrossWeight, destGross = !!type.requiresDestinationGrossWeight
  const total = r4(found.reduce((s, p) => s + Number(p.m.quantity || 0), 0))
  const body = [{
    destinations: [{
      recipientId: dest.id, transferTypeId: type.id,
      plannedRoute: `Direct: ${spec.fromAddress || lic} to ${spec.toAddress || spec.toName || spec.toLicense}`.slice(0, 250),
      estimatedDepartureDateTime: localDT(dep), estimatedArrivalDateTime: localDT(arr),
      ...(type.requiresInvoiceNumber && spec.invoice ? { invoiceNumber: spec.invoice } : {}),
      ...(destGross && unitLb ? { grossWeight: total, grossUnitOfWeightId: unitLb } : {}),
      transporters: [{
        transporterId: tr.id, phoneNumberForQuestions: phone,
        transporterDetails: [{ driverName: spec.driver, driverOccupationalLicenseNumber: occ, driverLicenseNumber: dl,
          vehicleMake: make, vehicleModel: model, vehicleLicensePlateNumber: plate,
          ...(type.requiresVehicleRegistrationNumber ? { vehicleRegistrationNumber: plate } : {}) }],
      }],
      packages: found.map(p => ({ id: p.m.id, ...(gross && unitLb ? { grossWeight: r4(p.m.quantity), grossUnitOfWeightId: unitLb } : {}) })),
    }],
  }]
  return { checks, body, type, found }
}

/** send (or dry-run) a planned transfer; on Live, find the new manifest and remember it */
async function sendTransfer(ctx, spec, plan, job) {
  const lic = spec.license
  if (!plan.body) {
    const bad = plan.checks.filter(c => !c.ok)
    if (bad.length === 1 && bad[0].key === 'open') throw new Wait(bad[0].detail)
    throw new Error(bad.map(c => `${c.label}: ${c.detail}`).join(' | '))
  }
  if (!ctx.live) {
    const resp = await write(ctx, '/v2/transfers/create', lic, plan.body)
    return { state: 'checked', request: plan.body, response: resp, info: `Dry run OK: ${plan.found.length} packages to ${spec.toName ?? spec.toLicense} (${plan.type.name})` }
  }
  const before = new Set(list(await t3('GET', '/v2/transfers/outgoing/active', { query: { licenseNumber: lic, pageSize: 500, sort: 'createdDateTime:desc' } })).map(x => `${x.id}:${x.deliveryId}`))
  const resp = await write(ctx, '/v2/transfers/create', lic, plan.body)
  const after = list(await t3('GET', '/v2/transfers/outgoing/active', { query: { licenseNumber: lic, pageSize: 500, sort: 'createdDateTime:desc' } }))
  const made = after.find(x => !before.has(`${x.id}:${x.deliveryId}`) && up(x.recipientFacilityLicenseNumber) === up(spec.toLicense))
    ?? after.find(x => !before.has(`${x.id}:${x.deliveryId}`))
  await db('metrc_app_transfers?on_conflict=key', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: spec.key, kind: job.kind, license: lic, recipient_license: spec.toLicense, recipient_name: spec.toName, stop_id: spec.stopId ?? null,
      load_id: spec.loadId ?? null, transfer_type: plan.type.name, transfer_id: made?.id ?? null, delivery_id: made?.deliveryId ?? null, manifest: made?.manifestNumber ?? null,
      state: 'created', packages: plan.found.map(p => ({ tag: up(p.tag), lbs: p.lbs, code: p.code, pallet_id: p.pallet_id ?? null, metrc_id: p.m.id })),
      request: plan.body, created_by: ctx.by }),
  })
  if (spec.stopId && made?.manifestNumber) {
    await db(`load_stops?id=eq.${spec.stopId}&manifest=is.null`, { method: 'PATCH', body: JSON.stringify({ manifest: made.manifestNumber }), headers: { Prefer: 'return=minimal' } }).catch(() => {})
  }
  if (!made) return { state: 'sent', request: plan.body, response: resp, info: 'Sent, but the new manifest didn\'t show in METRC\'s outgoing list yet. Check METRC.' }
  return { state: 'sent', request: plan.body, response: resp, info: `METRC manifest ${made.manifestNumber} to ${spec.toName ?? spec.toLicense}` }
}

// ---------- Stage at OHR (197): one manifest from GVR to the customer, made at staging and updated at Depart ----------
/** the outgoing transfer as METRC has it now (for its lastModified stamp) */
async function outgoing(lic, transferId) {
  for (const path of ['/v2/transfers/outgoing/active', '/v2/transfers/outgoing/inactive']) {
    const rows = list(await t3('GET', path, { query: { licenseNumber: lic, pageSize: 500, sort: 'createdDateTime:desc' } }).catch(() => null))
    const t = rows.find(x => Number(x.id) === Number(transferId))
    if (t) return { ...t, active: path.endsWith('active') }
  }
  return null
}

/** change a manifest the app already made: same packages list as the stop has now, the driver, truck and times in spec */
async function updateTransfer(ctx, spec, plan, job, made) {
  const lic = spec.license
  if (!plan.body) {
    const bad = plan.checks.filter(c => !c.ok)
    if (bad.length === 1 && bad[0].key === 'open') throw new Wait(bad[0].detail)
    throw new Error(bad.map(c => `${c.label}: ${c.detail}`).join(' | '))
  }
  const t = await outgoing(lic, made.transfer_id)
  if (!t) throw new Error(`METRC manifest ${made.manifest ?? made.transfer_id} isn't in ${lic}'s outgoing transfers any more. Check METRC.`)
  if (t.receivedDateTime || t.receivedByName) throw new Skip(`Manifest ${made.manifest} was already received by ${spec.toName}: not changed`)
  const body = [{ id: Number(made.transfer_id), ...(t.lastModified ? { lastModified: t.lastModified } : {}), destinations: plan.body[0].destinations }]
  const resp = await write(ctx, '/v2/transfers/update', lic, body)
  if (!ctx.live) return { state: 'checked', request: body, response: resp, info: `Dry run OK: update manifest ${made.manifest} (${plan.found.length} packages, ${spec.driver})` }
  await db(`metrc_app_transfers?key=eq.${enc(spec.key)}&state=neq.voided`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ packages: plan.found.map(p => ({ tag: up(p.tag), lbs: p.lbs, code: p.code, pallet_id: p.pallet_id ?? null, metrc_id: p.m.id })), request: body }) })
  if (spec.stopId && made.manifest) {
    await db(`load_stops?id=eq.${spec.stopId}&manifest=is.null`, { method: 'PATCH', body: JSON.stringify({ manifest: made.manifest }), headers: { Prefer: 'return=minimal' } }).catch(() => {})
  }
  return { state: 'sent', request: body, response: resp, info: `METRC manifest ${made.manifest} updated: ${plan.found.length} packages, ${spec.driver}, ${[spec.make, spec.model, spec.plate].filter(Boolean).join(' ')}` }
}

/** the staging driver and truck (the first version of the manifest, before the load leaves) */
async function stageSpec(spec, stages) {
  const g = stages[0]
  const v = g.stage_vehicle_id ? await one(`fleet_assets?id=eq.${Number(g.stage_vehicle_id)}&select=make,model,plate`) : null
  const dr = g.stage_driver ? await one(`fleet_drivers?name=ilike.${enc(g.stage_driver)}&active=eq.true&select=license_no`).catch(() => null) : null
  // arrival: noon on the ship date (California), or the usual transit time if that's too soon
  const noon = new Date(`${g.ship_date}T12:00:00`)
  const offset = new Date(noon.toLocaleString('en-US', { timeZone: 'UTC' })).getTime() - new Date(noon.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })).getTime()
  Object.assign(spec, {
    driver: g.stage_driver, driverLicense: dr?.license_no ?? null, make: v?.make, model: v?.model, plate: v?.plate,
    transporter: await carrierLicense(g.stage_vehicle_id),   // the truck's carrier license (202), else our C13
    depart: new Date(Date.now() + 5 * 60000), arrive: new Date(noon.getTime() + offset),
  })
  return spec
}

/** an outside carrier's own transport license for this truck (Vehicles > Carriers, 202); null = our C13 */
export async function carrierLicense(vehicleId) {
  if (!vehicleId) return null
  const v = await one(`fleet_assets?id=eq.${Number(vehicleId)}&select=carrier_id`).catch(() => null)
  if (!v?.carrier_id) return null
  const c = await one(`fleet_carriers?id=eq.${Number(v.carrier_id)}&select=license_no`).catch(() => null)
  return String(c?.license_no ?? '').trim() || null
}

const stagesOn = (stopId, lic) => db(`gvr_stages?stop_id=eq.${Number(stopId)}&license=eq.${enc(lic)}&status=neq.returned&select=id,status,stage_vehicle_id,stage_driver,ship_date&order=id.desc`).catch(() => [])

/** Stage at OHR to-dos: make the manifest (or update it: more staged, one moved back, moved to another load), or void it */
async function sendStage(job, ctx) {
  const d = job.details || {}
  const lic = job.license
  const key = `stop:${Number(d.stop_id)}:${lic}`
  const made = await one(`metrc_app_transfers?key=eq.${enc(key)}&state=neq.voided&select=transfer_id,manifest`)
  if (d.type === 'stage_void') {
    if (!made) throw new Skip('No manifest to void')
    if (!made.transfer_id) throw new Error(`Manifest ${made.manifest ?? ''} has no METRC id in the app: void it in METRC by hand`)
    const left = (await stagesOn(d.stop_id, lic)).filter(g => g.status === 'staged')
    if (left.length) throw new Skip('Other pallets are still staged on this manifest: not voided')
    const resp = await write(ctx, '/v2/transfers/void', lic, { id: Number(made.transfer_id) })
    if (!ctx.live) return { state: 'checked', request: { id: made.transfer_id }, response: resp, info: `Dry run OK: void manifest ${made.manifest}` }
    await db(`metrc_app_transfers?key=eq.${enc(key)}&state=neq.voided`, { method: 'PATCH', body: JSON.stringify({ state: 'voided' }), headers: { Prefer: 'return=minimal' } })
    await db(`load_stops?id=eq.${Number(d.stop_id)}&manifest=eq.${enc(made.manifest ?? '-')}`, { method: 'PATCH', body: JSON.stringify({ manifest: null }), headers: { Prefer: 'return=minimal' } }).catch(() => {})
    return { state: 'sent', request: { id: made.transfer_id }, response: resp, info: `METRC manifest ${made.manifest} voided (moved back to GVR)` }
  }
  const { spec } = await stopSpec(Number(d.stop_id), lic)
  spec.beforeId = job.id
  const load = spec.loadId ? await one(`loads?id=eq.${Number(spec.loadId)}&select=status`) : null
  const left = (await stagesOn(d.stop_id, lic)).filter(g => g.status === 'staged')
  // before the load leaves: the staging driver and truck; after: the load's own (Depart already updated it)
  if (!load || ['planning', 'loading'].includes(load.status)) {
    if (!left.length) throw new Skip('Nothing is staged on this stop any more')
    await stageSpec(spec, left)
  }
  if (!spec.packages.length) throw new Skip('No GVR packages on this stop any more')
  await receiveFirst(ctx, spec.packages.map(p => p.tag), job.id)
  spec.allowInTransit = !!made
  const plan = await planTransfer(ctx, spec)
  if (made && !made.transfer_id) throw new Error(`Manifest ${made.manifest ?? '(number pending)'} has no METRC id in the app yet. Check METRC.`)
  return made ? updateTransfer(ctx, spec, plan, job, made) : sendTransfer(ctx, spec, plan, job)
}

// ---------- a load stop ----------
export async function stopSpec(stopId, license) {
  const s = await rpc('metrc_stop_info', { p_stop: stopId })
  if (!s) throw new Error('Stop not found')
  const packages = (s.packages ?? []).filter(p => !license || p.from_license === license)
  const fromLic = license ?? packages[0]?.from_license
  const from = fromLic ? await one(`licenses?license_no=eq.${enc(fromLic)}&select=address`) : null
  const truck = !s.transporter && s.load_id ? (await one(`loads?id=eq.${Number(s.load_id)}&select=vehicle_id`).catch(() => null))?.vehicle_id : null
  const carrier = truck ? await carrierLicense(truck) : null
  return {
    s, spec: {
      key: `stop:${stopId}:${fromLic}`, stopId, loadId: s.load_id, kind: s.internal ? 'transfer' : 'manifest', typeKey: s.internal ? 'internal' : 'customer',
      license: fromLic, toLicense: s.to_license, toName: s.to_name, toAddress: s.to_address, fromAddress: from?.address,
      driver: s.driver, driverLicense: s.driver_license, make: s.make, model: s.model, plate: s.plate, transporter: s.transporter || carrier,
      packages: packages.map(p => ({ tag: p.tag, lbs: p.lbs, code: p.code, pallet_id: p.pallet_id, tag_pending: p.tag_pending })),
      invoice: (s.orders ?? []).join(', ').slice(0, 50) || null,
    },
  }
}

/** the checklist for every pending stop of a load (and each license it ships from); saved for Depart */
export async function loadChecklist(ctx, loadId) {
  const stops = await db(`load_stops?load_id=eq.${loadId}&status=eq.pending&select=id,seq&order=seq`)
  const out = []
  for (const st of stops) {
    const info = await rpc('metrc_stop_info', { p_stop: st.id })
    const lics = [...new Set((info?.packages ?? []).map(p => p.from_license).filter(Boolean))]
    if (!lics.length) { out.push({ stop_id: st.id, seq: st.seq, license: null, ok: false, checks: [{ key: 'packages', label: 'Packages', ok: false, detail: 'Nothing on this stop, or no license for where it ships from' }] }); continue }
    for (const lic of lics) {
      const { spec, s } = await stopSpec(st.id, lic)
      const already = await one(`metrc_app_transfers?key=eq.${enc(spec.key)}&state=neq.voided&select=manifest`)
      spec.allowInTransit = !!already
      const plan = await planTransfer(ctx, spec)
      if (already) plan.checks.unshift({ key: 'made', label: 'Manifest', ok: true, detail: `Already made: ${already.manifest ?? '(number pending)'}${(await stagesOn(st.id, lic)).length ? ' (staged at OHR: Depart updates it to this load\'s driver, truck and times)' : ''}` })
      if (plan.body && !already) {
        try { await t3('POST', '/v2/transfers/create', { query: { licenseNumber: lic, applyDynamicValidation: 'true' }, body: plan.body }); plan.checks.push({ key: 'dry', label: 'METRC dry run', ok: true, detail: 'METRC would accept it' }) }
        catch (e) { plan.checks.push({ key: 'dry', label: 'METRC dry run', ok: false, detail: e.message }) }
      }
      const ok = plan.checks.every(c => c.ok)
      const on = (await one(`metrc_push_kinds?kind=eq.${s.internal ? 'transfer' : 'manifest'}&select=mode`))?.mode ?? 'off'
      await db('metrc_stop_checks?on_conflict=stop_id,license', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ stop_id: st.id, license: lic, ok, checks: plan.checks, checked_at: new Date().toISOString(), checked_by: ctx.by }) })
      out.push({ stop_id: st.id, seq: st.seq, license: lic, to: s.to_name, internal: s.internal, mode: on, ok, checks: plan.checks })
    }
  }
  return out
}

// ---------- senders ----------
export async function sendTransfer_(job, ctx) {
  const d = job.details || {}
  if (d.type === 'stop_departed') {
    const { spec } = await stopSpec(Number(d.stop_id), job.license)
    spec.beforeId = job.id
    await receiveFirst(ctx, spec.packages.map(p => p.tag), job.id)
    const made = await one(`metrc_app_transfers?key=eq.${enc(spec.key)}&state=neq.voided&select=manifest,transfer_id`)
    if (made && (await stagesOn(d.stop_id, job.license)).length) {
      // staged at OHR (197): the manifest made at staging now gets this load's driver, truck and times
      if (!made.transfer_id) throw new Error(`Manifest ${made.manifest ?? '(number pending)'} has no METRC id in the app yet. Check METRC.`)
      spec.allowInTransit = true
      const plan = await planTransfer(ctx, spec)
      const r = await updateTransfer(ctx, spec, plan, job, made)
      if (r.state === 'sent') r.siblings = [...await shipSiblings(spec.packages.map(p => p.tag), job.id), ...await receiveSiblings(spec.packages.map(p => p.tag), job.id)]
      return r
    }
    if (made) throw new Skip(`Already on METRC manifest ${made.manifest ?? '(number pending)'}`)
    const plan = await planTransfer(ctx, spec)
    const r = await sendTransfer(ctx, spec, plan, job)
    if (r.state === 'sent') r.siblings = [...await shipSiblings(spec.packages.map(p => p.tag), job.id), ...await receiveSiblings(spec.packages.map(p => p.tag), job.id)]
    return r
  }
  if (d.type === 'stage_manifest' || d.type === 'stage_void') return sendStage(job, ctx)
  if (d.type === 'proc_sent') return sendProcessorRun(job, ctx)
  if (d.type === 'nursery_shipped') return sendNurseryRun(job, ctx)
  throw new Error(`This to-do (${d.type}) isn't a transfer the app makes. Check it by hand.`)
}

/** 221: a customer manifest whose product came back (Not delivered, all received back at the farm): void it in METRC.
 *  The METRC id comes from the app's own manifest (metrc_app_transfers) or, for one made by hand, from the METRC pull by number. */
export async function sendManifestVoid(job, ctx) {
  const d = job.details || {}
  const lic = job.license
  const man = String(d.manifest ?? '').replace(/\D/g, '')
  if (!man) throw new Skip('No manifest number on this stop')
  const stop = await one(`load_stops?id=eq.${Number(d.stop_id)}&select=id,manifest,manifest_voided_at`)
  if (stop?.manifest_voided_at) throw new Skip(`Manifest ${man} is already voided`)
  const open = await db(`stop_returns?stop_id=eq.${Number(d.stop_id)}&back_at=is.null&cancelled_at=is.null&select=id`).catch(() => [])
  if (open?.length) throw new Skip('Not everything from this stop is received back yet')
  const key = `stop:${Number(d.stop_id)}:${lic}`
  const mine = await one(`metrc_app_transfers?key=eq.${enc(key)}&state=neq.voided&select=transfer_id,manifest`).catch(() => null)
  let id = mine?.transfer_id ?? null
  if (!id) {
    const pulled = await one(`metrc_transfers?manifest=eq.${enc(man)}&select=transfer_id,voided,received_at&license=eq.${enc(lic)}&order=last_modified.desc.nullslast`).catch(() => null)
    if (pulled?.voided) throw new Skip(`Manifest ${man} is already voided in METRC`)
    if (pulled?.received_at) throw new Error(`The customer already received manifest ${man} in METRC, so it can't be voided. Rama: sort it out in METRC by hand.`)
    id = pulled?.transfer_id ?? null
  }
  if (!id) throw new Error(`Manifest ${man} isn't in the app's METRC data yet (run Compliance > METRC > Pull, then send this again), or void it in METRC by hand`)
  const resp = await write(ctx, '/v2/transfers/void', lic, { id: Number(id) })
  if (!ctx.live) return { state: 'checked', request: { id }, response: resp, info: `Dry run OK: void manifest ${man}` }
  if (mine) await db(`metrc_app_transfers?key=eq.${enc(key)}&state=neq.voided`, { method: 'PATCH', body: JSON.stringify({ state: 'voided' }), headers: { Prefer: 'return=minimal' } })
  await db(`load_stops?id=eq.${Number(d.stop_id)}`, { method: 'PATCH', body: JSON.stringify({ manifest_voided_at: new Date().toISOString() }), headers: { Prefer: 'return=minimal' } }).catch(() => {})
  await db(`app_alerts?kind=eq.stop_metrc&done_at=is.null&ref->>stop_id=eq.${Number(d.stop_id)}`, { method: 'PATCH', body: JSON.stringify({ done_at: new Date().toISOString(), done_by: 'app (manifest voided)' }), headers: { Prefer: 'return=minimal' } }).catch(() => {})
  return { state: 'sent', request: { id }, response: resp, info: `METRC manifest ${man} voided (not delivered, product received back)` }
}

/** open "receive in METRC" to-dos covering these packages (by tag, or a mixed pallet they sit on) */
async function openReceives(tags) {
  const t = [...new Set(tags.filter(Boolean).map(up))]
  if (!t.length) return []
  const pals = await db(`pallets?select=id,container_id&package_tag=in.(${t.map(enc).join(',')})`).catch(() => [])
  const pids = [...new Set(pals.flatMap(p => [p.id, p.container_id]).filter(Boolean))]
  const byTag = await db(`comp_metrc_actions?select=*&kind=eq.receive&status=in.(todo,error)&tag=in.(${t.map(enc).join(',')})`).catch(() => [])
  const byPal = pids.length ? await db(`comp_metrc_actions?select=*&kind=eq.receive&status=in.(todo,error)&pallet_id=in.(${pids.join(',')})`).catch(() => []) : []
  const m = new Map(); for (const a of [...byTag, ...byPal]) m.set(a.id, a)
  return [...m.values()].sort((a, b) => a.id - b.id)
}

/** a package can't leave on a new manifest before its license has received it (Aziz 11/4: L-1104-5 / M12):
 *  send any open receive first; if METRC has nothing to receive yet, the manifest waits */
async function receiveFirst(ctx, tags, selfId) {
  const open = (await openReceives(tags)).filter(a => a.id !== selfId)
  if (!open.length) return
  const done = new Set()
  for (const a of open) {
    if (done.has(a.id)) continue
    let r
    try { r = await sendReceive(a, ctx) }
    catch (e) {
      if (e instanceof Skip) { await rpc('metrc_close_siblings', { p_ids: [a.id], p_by: ctx.by, p_note: `Before manifest #${selfId}: ${e.message}` }).catch(() => {}); done.add(a.id); continue }
      throw new Wait(`Receive first: to-do #${a.id} (${a.code ?? a.tag ?? 'package'}) isn't received in METRC yet. ${e.message}`)
    }
    if (!ctx.live) continue
    const ids = [a.id, ...(r.siblings ?? [])]
    await rpc('metrc_close_siblings', { p_ids: ids, p_by: ctx.by, p_note: `Received before manifest #${selfId}: ${r.info ?? ''}` }).catch(() => {})
    ids.forEach(i => done.add(i))
  }
}

/** once a manifest has gone out, METRC has shown the packages were received: close any receive to-dos left on them */
async function receiveSiblings(tags, selfId) {
  return (await openReceives(tags)).map(a => a.id).filter(id => id !== selfId)
}

/** ship-check to-dos on the same packages are covered once the manifest exists */
async function shipSiblings(tags, selfId) {
  const t = tags.filter(Boolean).map(up)
  if (!t.length) return []
  const r = await db(`comp_metrc_actions?select=id&kind=eq.ship_check&status=in.(todo,error)&tag=in.(${t.map(enc).join(',')})&id=neq.${selfId}`)
  return r.map(x => x.id)
}

/** everything sent to the same processor the same day from the same license goes on one manifest */
async function sendProcessorRun(job, ctx) {
  const d = job.details || {}
  const day = ymd(job.at)
  const proc = await one(`proc_processors?name=eq.${enc(d.processor ?? '')}&select=id,name,license,address`)
  if (!proc) throw new Error(`Processor "${d.processor}" not found in the app`)
  const sibs = (await db(`comp_metrc_actions?select=id,at,tag,lbs,code,pallet_id,details&kind=eq.transfer&status=in.(todo,error)&license=eq.${enc(job.license)}` +
    `&details->>type=eq.proc_sent&details->>processor=eq.${enc(d.processor)}&order=id`)).filter(x => ymd(x.at) === day)
  const vehicleId = await setting('comp.metrc_proc_vehicle', '')
  const v = vehicleId ? await one(`fleet_assets?id=eq.${Number(vehicleId)}&select=make,model,plate`) : null
  const driver = await setting('comp.metrc_proc_driver', '')
  const dr = driver ? await one(`fleet_drivers?name=ilike.${enc(driver)}&active=eq.true&select=license_no`) : null
  const from = await one(`licenses?license_no=eq.${enc(job.license)}&select=address`)
  const spec = {
    key: `proc:${proc.id}:${day}:${job.license}`, kind: 'transfer', typeKey: 'processor', license: job.license, toLicense: proc.license, toName: proc.name,
    toAddress: proc.address, fromAddress: from?.address, driver, driverLicense: dr?.license_no, make: v?.make, model: v?.model, plate: v?.plate,
    transporter: await carrierLicense(vehicleId), packages: sibs.map(x => ({ tag: x.tag, lbs: x.lbs, code: x.code, pallet_id: x.pallet_id })), beforeId: Math.min(...sibs.map(x => x.id)),
  }
  const made = await one(`metrc_app_transfers?key=eq.${enc(spec.key)}&state=neq.voided&select=manifest,packages`)
  if (made && (made.packages ?? []).some(p => up(p.tag) === up(job.tag))) throw new Skip(`Already on METRC manifest ${made.manifest ?? '(number pending)'}`)
  if (made) spec.key += `:${job.id}`     // more sent the same day after the first manifest: a second manifest
  if (!driver || !vehicleId) {
    throw new Error('Processor runs have no load in the app: set the driver and truck for processor runs in Compliance > Settings > METRC through T3')
  }
  const plan = await planTransfer(ctx, spec)
  const r = await sendTransfer(ctx, spec, plan, job)
  if (r.state === 'sent') r.siblings = sibs.map(x => x.id).filter(id => id !== job.id)
  return r
}

/** a nursery delivery: its clone packages go to the farm (or customer) on one METRC transfer. METRC sends whole packages. */
async function sendNurseryRun(job, ctx) {
  const d = job.details || {}
  const lic = job.license
  const key = `nurs:${d.ref}`
  const made = await one(`metrc_app_transfers?key=eq.${enc(key)}&state=neq.voided&select=manifest`)
  if (made) throw new Skip(`Already on METRC manifest ${made.manifest ?? '(number pending)'}`)
  const batches = await db(`nursery_batches?id=in.(${Object.keys(d.per_batch ?? {}).filter(k => k !== '0').map(Number).join(',') || 0})&select=id,name,package_tag`)
  const pk = []
  for (const b of batches) {
    const tag = up(b.package_tag)
    if (!tag) throw new Error(`Cutting batch ${b.name ?? b.id} has no clone package tag`)
    const m = await packageByTag(lic, tag)
    const sent = Number(d.per_batch?.[String(b.id)] ?? 0)
    if (m && Number(m.quantity) > sent) throw new Error(`${tag} holds ${m.quantity} clones in METRC but ${sent} went out. METRC sends whole packages: split off the ${sent} into a new package first (or deliver the rest too).`)
    pk.push({ tag, lbs: null, code: b.name ?? `batch ${b.id}` })
  }
  if (!pk.length) throw new Error('No cutting batches on this delivery')
  const vehicleId = await setting('comp.metrc_proc_vehicle', '')
  const v = vehicleId ? await one(`fleet_assets?id=eq.${Number(vehicleId)}&select=make,model,plate`) : null
  const driver = await setting('comp.metrc_proc_driver', '')
  const dr = driver ? await one(`fleet_drivers?name=ilike.${enc(driver)}&active=eq.true&select=license_no`) : null
  if (!driver || !vehicleId) throw new Error('Nursery deliveries have no load in the app: set the driver and truck for runs without a load in Compliance > Settings > METRC through T3')
  const from = await one(`nursery_sites?license=eq.${enc(lic)}&select=address`)
  const spec = { key, kind: 'transfer', typeKey: 'nursery', license: lic, toLicense: d.to_license, toName: d.to, fromAddress: from?.address,
    driver, driverLicense: dr?.license_no, make: v?.make, model: v?.model, plate: v?.plate, transporter: await carrierLicense(vehicleId), packages: pk, beforeId: job.id }
  const plan = await planTransfer(ctx, spec)
  return sendTransfer(ctx, spec, plan, job)
}

// ---------- receiving ----------
/** incoming deliveries on a license, each with its packages */
export async function incoming(ctx, license, withPackages = true) {
  const ts = await all('/v2/transfers/incoming/active', { licenseNumber: license }, 5)
  const out = []
  for (const t of ts) {
    const row = {
      license, transfer_id: t.id, delivery_id: t.deliveryId, manifest: t.manifestNumber, from_license: t.shipperFacilityLicenseNumber, from: t.shipperFacilityName,
      type: t.shipmentTypeName, created: t.createdDateTime, departed: t.actualDepartureDateTime ?? t.estimatedDepartureDateTime, arrival: t.estimatedArrivalDateTime,
      driver: t.driverName, vehicle: [t.vehicleMake, t.vehicleModel, t.vehicleLicensePlateNumber].filter(Boolean).join(' '), packages: t.deliveryPackageCount ?? t.packageCount,
      received: !!t.receivedDateTime, last_modified: t.lastModified ?? null,
    }
    if (withPackages && t.deliveryId) {
      row.items = (await all('/v2/transfers/packages', { licenseNumber: license, deliveryId: t.deliveryId }, 5)).map(p => ({
        id: p.packageId ?? p.id, tag: up(p.packageLabel ?? p.label), item: p.productName ?? p.item?.name, strain: p.itemStrainName ?? null,
        qty: p.shippedQuantity, uom: p.shippedUnitOfMeasureAbbreviation, state: p.shipmentPackageState,
        // where it came from (processor returns: our wet package's tag), as the nightly sync reads it
        source_labels: (Array.isArray(p.sourcePackageLabels) ? p.sourcePackageLabels : String(p.sourcePackageLabels ?? '').split(/[,;\s]+/)).map(up).filter(x => x.length > 10),
        source_harvests: p.sourceHarvestNames ?? null,
      }))
    }
    out.push(row)
  }
  return out
}

/** receive one delivery in METRC (dry run unless live); returns the request and what was received */
export async function receiveDelivery(ctx, license, d) {
  const inp = await inputs(ctx, license, '/v2/transfers/receive/inputs').catch(() => ({}))
  const uom = abbr => (inp.unitsOfMeasure ?? []).find(u => lc(u.abbreviation) === lc(abbr))?.id
  const items = d.items ?? []
  if (!items.length) throw new Error(`Manifest ${d.manifest}: no packages on the delivery`)
  const pk = items.map(p => {
    const id = uom(p.uom)
    if (!id) throw new Error(`METRC has no unit "${p.uom}" for receiving on ${license}`)
    return { id: p.id, receivedQuantity: p.qty, receivedUnitOfMeasureId: id }
  })
  // METRC refuses a receive without the transfer's current lastModified stamp ("it has changed since the editing began")
  const body = [{ id: d.transfer_id, shipmentDeliveryId: d.delivery_id, ...(d.last_modified ? { lastModified: d.last_modified } : {}), packages: pk }]
  const resp = await write(ctx, '/v2/transfers/receive', license, body)
  return { body, resp }
}

/** find the incoming delivery that has this tag */
async function deliveryWith(ctx, license, tag) {
  ctx.cache ??= {}
  ctx.cache[`inc:${license}`] ??= incoming(ctx, license, true)
  const ds = await ctx.cache[`inc:${license}`]
  return ds.find(d => (d.items ?? []).some(p => up(p.tag) === up(tag))) ?? null
}

export async function sendReceive(job, ctx) {
  const d = job.details || {}
  let tag = up(job.tag ?? d.new_tag ?? d.tag)
  // a mixed pallet has no tag of its own: any package on it finds the same manifest (receiving takes the whole manifest)
  if (!tag && job.pallet_id) {
    const inside = await db(`pallets?select=package_tag&container_id=eq.${job.pallet_id}&package_tag=not.is.null&limit=1`).catch(() => [])
    tag = up(inside?.[0]?.package_tag)
  }
  if (!tag) throw new Error('No tag on this to-do')
  const site = d.site ?? d.to_site
  const lic = d.to_license ?? (site ? (await rpc('site_license', { p_site: site }).catch(() => null)) : null) ?? job.license
  if (!lic) throw new Error('Which license is receiving? (no site on this to-do)')
  const del = await deliveryWith(ctx, lic, tag)
  if (!del) {
    if (await packageByTag(lic, tag)) throw new Skip(`Already received: ${tag} is active on ${lic}`)
    throw new Wait(`No incoming METRC transfer to ${lic} has ${tag} yet`)
  }
  const { body, resp } = await receiveDelivery(ctx, lic, del)
  const what = `manifest ${del.manifest} from ${del.from}, ${del.items.length} packages`
  if (!ctx.live) return { state: 'checked', request: body, response: resp, info: `Dry run OK: receive ${what}` }
  ctx.cache[`inc:${lic}`] = null
  await db(`metrc_app_transfers?delivery_id=eq.${del.delivery_id}`, { method: 'PATCH', body: JSON.stringify({ state: 'received', received_at: new Date().toISOString(), received_by: ctx.by }), headers: { Prefer: 'return=minimal' } }).catch(() => {})
  const tags = del.items.map(p => up(p.tag))
  const sibs = await db(`comp_metrc_actions?select=id&kind=eq.receive&status=in.(todo,error)&tag=in.(${tags.map(enc).join(',')})&id=neq.${job.id}`)
  // mixed pallets on the same manifest (their to-dos have no tag) were received with it too
  const mixed = del.manifest ? await db(`comp_metrc_actions?select=id&kind=eq.receive&status=in.(todo,error)&tag=is.null&details->>manifest=eq.${enc(del.manifest)}&id=neq.${job.id}`).catch(() => []) : []
  return { state: 'sent', request: body, response: resp, info: `Received in METRC: ${what}`, siblings: [...sibs, ...mixed].map(x => x.id) }
}

