export const EMPTY = { moves: [], tray: [], current: null };
export const active = (p) => p.moves.length > 0 || p.tray.length > 0;
/** what a slot looks like once the plan is applied */
export function slotView(L, plan, slotId) {
    const moved = new Map(plan.moves.map(m => [m.id, m]));
    const tray = new Set(plan.tray);
    const base = L.inSlot(slotId);
    const stay = base.filter(p => !tray.has(p.id) && (!moved.has(p.id) || moved.get(p.id).to === slotId));
    const leaving = base.filter(p => tray.has(p.id) || (moved.has(p.id) && moved.get(p.id).to !== slotId)).map(p => ({ p, m: moved.get(p.id) }));
    const incoming = plan.moves.filter(m => m.to === slotId && L.pallet(m.id)?.slot_id !== slotId)
        .map(m => ({ p: L.pallet(m.id), m })).filter(x => x.p);
    return { stay, incoming, leaving };
}
export const occupants = (v) => [...v.stay, ...v.incoming.map(x => x.p)];
const withCurrent = (plan) => ({ ...plan, current: plan.current != null && plan.tray.includes(plan.current) ? plan.current : plan.tray[0] ?? null });
export function addToTray(plan, ids) {
    const add = ids.filter(id => !plan.tray.includes(id));
    return withCurrent({ moves: plan.moves.filter(m => !add.includes(m.id)), tray: [...plan.tray, ...add], current: plan.current });
}
export function dropFromPlan(plan, id) {
    return withCurrent({ moves: plan.moves.filter(m => m.id !== id), tray: plan.tray.filter(x => x !== id), current: plan.current === id ? null : plan.current });
}
/** a placed (ghost) pallet goes back to the tray, at the front */
export function backToTray(plan, id) {
    return { moves: plan.moves.filter(m => m.id !== id), tray: [id, ...plan.tray.filter(x => x !== id)], current: id };
}
/** place the current tray pallet (or a dragged one) into a slot. Returns 'choose' when the slot is taken and no mode was given. */
export function place(L, plan, id, slotId, mode) {
    const p = L.pallet(id);
    if (!p)
        return plan;
    const home = p.slot_id;
    const rest = { moves: plan.moves.filter(m => m.id !== id), tray: plan.tray.filter(x => x !== id), current: plan.current };
    if (home === slotId)
        return withCurrent(rest); // back where it was: no move
    const v = slotView(L, rest, slotId);
    const occ = occupants(v);
    if (occ.length && !mode)
        return 'choose';
    const mv = { id, from: home, to: slotId, kind: 'move' };
    if (!occ.length || mode === 'stack')
        return withCurrent({ ...rest, moves: [...rest.moves, mv] });
    if (mode === 'swap') {
        if (home == null)
            return 'choose';
        // everything in the slot goes to this pallet's old spot
        let moves = rest.moves.filter(m => !occ.some(o => o.id === m.id));
        moves = [...moves, { ...mv, kind: 'swap' }];
        for (const o of occ)
            if (o.slot_id !== home)
                moves.push({ id: o.id, from: o.slot_id, to: home, kind: 'swap' });
        return withCurrent({ ...rest, moves });
    }
    // bump: the pallets in the slot go into the tray to be placed next
    const occIds = occ.map(o => o.id);
    return withCurrent({
        moves: [...rest.moves.filter(m => !occIds.includes(m.id)), mv],
        tray: [...occIds.filter(x => !rest.tray.includes(x)), ...rest.tray],
        current: occIds[0] ?? rest.current,
    });
}
/** put the tray into staging positions in pick order */
export function fillStaging(L, plan, stagingId) {
    let next = plan;
    const free = L.slotsOf(stagingId).sort((a, b) => a.row - b.row).filter(s => occupants(slotView(L, plan, s.id)).length === 0);
    for (const id of plan.tray) {
        const s = free.shift();
        if (!s)
            break;
        const r = place(L, next, id, s.id, 'stack');
        if (r !== 'choose')
            next = r;
    }
    return next;
}
const laneName = (f, col) => `F${f.number} ${col === 1 ? 'A–I' : 'J–R'}`;
/** compact a lane toward the back (row 1). Pallets placed by this plan stay where they were put. */
export function laneShuffle(L, plan, f, col) {
    const slots = L.slotsOf(f.id).filter(s => s.col === col).sort((a, b) => a.row - b.row);
    const placed = new Set(plan.moves.filter(m => m.kind !== 'shuffle').map(m => m.id));
    const groups = slots.map(s => {
        const v = slotView(L, plan, s.id);
        const occ = occupants(v);
        return { s, occ, fixed: occ.some(p => placed.has(p.id)) };
    });
    const free = groups.filter(g => !g.fixed).map(g => g.s);
    const movable = groups.filter(g => !g.fixed && g.occ.length);
    const moves = [];
    movable.forEach((g, i) => {
        const to = free[i];
        if (to.id !== g.s.id)
            for (const p of g.occ)
                moves.push({ id: p.id, from: p.slot_id, to: to.id, kind: 'shuffle' });
    });
    if (!moves.length)
        return null;
    const n = new Set(moves.map(m => m.id)).size;
    return { key: `${f.id}-${col}`, label: `${laneName(f, col)} (${n} pallet${n === 1 ? '' : 's'})`, moves };
}
/** lanes where a pallet is leaving and the plan leaves a gap behind pallets in front of it */
export function suggestions(L, plan) {
    const lanes = new Map();
    for (const m of plan.moves) {
        if (m.from == null)
            continue;
        const s = L.slot(m.from);
        const f = s ? L.freezer(s.freezer_id) : undefined;
        if (!s || !f || f.kind === 'staging' || f.status === 'Not Working')
            continue;
        lanes.set(`${f.id}-${s.col}`, { f, col: s.col });
    }
    return [...lanes.values()].map(x => laneShuffle(L, plan, x.f, x.col)).filter((x) => !!x);
}
export function addMoves(plan, moves) {
    const ids = new Set(moves.map(m => m.id));
    return { ...plan, moves: [...plan.moves.filter(m => !ids.has(m.id)), ...moves] };
}
/** the moves to save: drop no-ops */
export const toSave = (L, plan) => plan.moves.filter(m => L.pallet(m.id)?.slot_id !== m.to).map(m => ({ pallet_id: m.id, from_slot: m.from, to_slot: m.to, kind: m.kind }));
