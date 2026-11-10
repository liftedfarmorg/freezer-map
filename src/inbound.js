import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { metrcRun } from './metrcCall';
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const STATUS = { in_transit: 'on a load', at_processor: 'at processor', shipped: 'shipped', unslotted: 'needs a spot', in_freezer: 'in a freezer', depleted: 'used up', merged: 'merged', archived: 'archived' };
export function InboundView({ sb, flash, onChanged }) {
    const module = 'distribution';
    const [rows, setRows] = useState(null);
    const [live, setLive] = useState(false);
    const [busy, setBusy] = useState(null);
    const [open, setOpen] = useState(null);
    // returns (159): which return a delivery is received against (0 = not a return)
    const [retFor, setRetFor] = useState({});
    const retOf = (d) => retFor[`${d.license}${d.delivery_id}`] ?? (d.return?.id ?? 0);
    const load = async () => {
        if (!sb)
            return;
        setBusy('Asking METRC…');
        try {
            const r = await metrcRun(sb, { action: 'incoming', module });
            setRows(r.deliveries);
            setLive(r.live);
        }
        catch (e) {
            flash(e instanceof Error ? e.message : String(e), true);
            setRows([]);
        }
        finally {
            setBusy(null);
        }
    };
    useEffect(() => { load(); }, []);
    async function receive(d) {
        if (!sb || !d.delivery_id)
            return;
        const rid = retOf(d);
        if (!confirm(live ? `Receive manifest ${d.manifest} from ${d.from} in METRC (${d.items?.length ?? d.packages} packages) and bring it into the app?${rid && d.return ? `\n\nAs return ${d.return.rma}: the packages go back into inventory as returned and a credit memo is made for ${d.return.customer}.` : ''}`
            : `Dry run: check that METRC would take manifest ${d.manifest}? (Nothing changes until Compliance goes Live.)`))
            return;
        setBusy(`Receiving ${d.manifest}…`);
        try {
            const r = await metrcRun(sb, { action: 'inbound_receive', license: d.license, delivery_id: d.delivery_id, module, ...(rid ? { return_id: rid } : {}) });
            flash(r.info, !r.ok);
            if (live && r.ok) {
                onChanged();
                await load();
            }
        }
        catch (e) {
            flash(e instanceof Error ? e.message : String(e), true);
        }
        finally {
            setBusy(null);
        }
    }
    const ok = (rows ?? []).filter(d => !d.error);
    const errs = (rows ?? []).filter(d => d.error);
    return _jsxs("div", { className: "list", children: [_jsx(ComingBack, { sb: sb, flash: flash, onChanged: onChanged }), _jsxs("div", { className: "row between wrap toolbar", children: [_jsx("h2", { children: "Inbound" }), _jsxs("div", { className: "row", children: [_jsx("span", { className: `pill ${live ? 'm-bad' : 'm-warn'}`, children: live ? 'METRC Live' : 'Dry run' }), _jsx("button", { className: "ghost small", disabled: !!busy, onClick: load, children: busy ?? 'Refresh' })] })] }), _jsxs("p", { className: "muted", children: ["Product packages on their way to OHR and GVR (plants go to Cultivation \u203A Receiving, anything for 1PN to Nursery \u203A Receiving). Receive takes the whole delivery in METRC", live ? '' : ' (a dry-run check until Compliance goes Live)', " and brings its packages into the app (Needs a spot)."] }), errs.map(d => _jsxs("p", { className: "neg small", children: [d.site, " ", d.license, ": ", d.error] }, d.license)), rows && !ok.length && !busy && _jsx("p", { className: "muted", children: "Nothing incoming." }), ok.map(d => {
                const known = (d.items ?? []).filter(i => i.app).length;
                return _jsxs("div", { className: "card", children: [_jsxs("div", { className: "row between wrap", children: [_jsxs("div", { children: [_jsx("b", { children: d.manifest }), " ", _jsx("span", { className: "muted", children: "from" }), " ", _jsx("b", { children: d.from }), " ", _jsx("span", { className: "muted small", children: d.from_license }), _jsxs("div", { className: "muted small", children: ["to ", d.site, " ", d.license, " \u00B7 ", d.type ?? '', " \u00B7 left ", when(d.departed), d.arrival ? ` · due ${when(d.arrival)}` : '', d.driver ? ` · ${d.driver}` : '', d.vehicle ? ` · ${d.vehicle}` : ''] }), _jsxs("div", { className: "small", children: [d.items?.length ?? d.packages, " packages", known ? ` · ${known} the app knows` : ''] }), d.return && _jsxs("div", { className: "row small", style: { gap: 6, marginTop: 4 }, children: [_jsxs("span", { className: "pill m-warn", children: ["Return ", d.return.rma] }), _jsxs("span", { className: "muted", children: [d.return.customer, d.return.sure ? ' · our tags' : ' · from their license'] }), _jsxs("select", { value: retOf(d), onChange: e => setRetFor(m => ({ ...m, [`${d.license}${d.delivery_id}`]: Number(e.target.value) })), children: [_jsxs("option", { value: d.return.id, children: ["Receive as ", d.return.rma] }), _jsx("option", { value: 0, children: "Not a return" })] })] })] }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost small", onClick: () => setOpen(o => o === d.delivery_id ? null : d.delivery_id ?? null), children: open === d.delivery_id ? 'Hide' : 'Packages' }), _jsx("button", { className: "primary small", disabled: !!busy, onClick: () => receive(d), children: live ? 'Receive' : 'Check' })] })] }), open === d.delivery_id && _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Tag" }), _jsx("th", { children: "Item" }), _jsx("th", { children: "Qty" }), _jsx("th", { children: "In the app" })] }) }), _jsx("tbody", { children: (d.items ?? []).map(i => _jsxs("tr", { children: [_jsx("td", { className: "mono small", children: i.tag }), _jsx("td", { children: i.item }), _jsxs("td", { children: [i.qty, " ", i.uom] }), _jsxs("td", { className: "small", children: [i.return && _jsx("span", { className: "pill m-warn", children: i.return.rma }), " ", i.app ? _jsxs(_Fragment, { children: [i.app.code, " ", _jsxs("span", { className: "muted", children: ["(", STATUS[i.app.status] ?? i.app.status, ")"] })] }) : /^(lb|lbs)/i.test(i.uom) ? _jsx("span", { className: "muted", children: "new: added on receive" }) : _jsx("span", { className: "muted", children: "plant package (METRC only)" })] })] }, i.tag)) })] }) })] }, `${d.license}${d.delivery_id}`);
            })] });
}
function ComingBack({ sb, flash, onChanged }) {
    const [rows, setRows] = useState([]);
    const [sel, setSel] = useState(new Set());
    const [site, setSite] = useState({});
    const [busy, setBusy] = useState(false);
    const load = async () => {
        if (!sb)
            return;
        const { data, error } = await sb.rpc('returns_coming_back');
        if (!error)
            setRows((data ?? []));
    };
    useEffect(() => {
        load();
        if (!sb)
            return;
        const ch = sb.channel('comingback').on('postgres_changes', { event: '*', schema: 'public', table: 'stop_returns' }, () => load()).subscribe();
        return () => { sb.removeChannel(ch); };
    }, [sb]);
    if (!rows.length)
        return null;
    const loads = [...new Map(rows.map(r => [r.load_id, r])).values()];
    async function receive(loadId) {
        const mine = rows.filter(r => r.load_id === loadId);
        const ids = mine.filter(r => sel.has(r.id)).map(r => r.id);
        const use = ids.length ? ids : mine.map(r => r.id);
        const st = site[loadId] ?? mine[0]?.from_site ?? 'GVR';
        if (!sb || !confirm(`Receive ${use.length} package${use.length === 1 ? '' : 's'} back at ${st}? They go to Needs a spot (Staging) like any received pallet. Nothing is sent to METRC.`))
            return;
        setBusy(true);
        try {
            const { data, error } = await sb.rpc('receive_returns', { p_ids: use, p_site: st });
            if (error)
                throw new Error(error.message);
            const r = data;
            flash(`${r.received} received back at ${st}${r.ready ? `. ${r.ready} rescheduled order${r.ready === 1 ? ' is' : 's are'} back to Ready in Fulfillment` : ''}${r.restaged ? `. ${r.restaged} GVR pallet${r.restaged === 1 ? ' is' : 's are'} staged at OHR again: Move back to GVR or put on a load (Fulfillment)` : ''}`);
            setSel(new Set());
            onChanged();
            await load();
        }
        catch (e) {
            flash(e instanceof Error ? e.message : String(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return _jsxs("div", { className: "card", style: { borderColor: 'var(--warn)' }, children: [_jsx("h3", { children: "\u21A9 Coming back on our trucks" }), _jsx("p", { className: "muted small", children: "Rejected or not delivered at the stop. Receive them when the truck is back; they land in Needs a spot. Tick some to receive only those." }), loads.map(l => {
                const mine = rows.filter(r => r.load_id === l.load_id);
                return _jsxs("div", { className: "dcard", children: [_jsxs("div", { className: "row between wrap", children: [_jsx("b", { children: l.load }), _jsxs("span", { className: "row", style: { gap: 6 }, children: [_jsx("select", { value: site[l.load_id] ?? l.from_site ?? 'GVR', onChange: e => setSite(x => ({ ...x, [l.load_id]: e.target.value })), children: ['GVR', 'OHR'].map(x => _jsxs("option", { value: x, children: ["at ", x] }, x)) }), _jsxs("button", { className: "primary small", disabled: busy, onClick: () => receive(l.load_id), children: ["Receive back", mine.some(r => sel.has(r.id)) ? ` (${mine.filter(r => sel.has(r.id)).length})` : ''] })] })] }), mine.map(r => _jsxs("label", { className: "row small", style: { gap: 6, padding: '3px 0' }, children: [_jsx("input", { type: "checkbox", checked: sel.has(r.id), onChange: () => setSel(x => { const n = new Set(x); if (n.has(r.id))
                                        n.delete(r.id);
                                    else
                                        n.add(r.id); return n; }) }), _jsxs("span", { children: [_jsx("b", { children: r.code }), " ", r.item ?? r.strain, " ", _jsx("span", { className: "mono", children: r.tag }), " \u00B7 ", Number(r.lbs ?? 0).toLocaleString(), " lbs", r.pkgs ? ` (${r.pkgs} packages)` : '', " \u00B7 stop ", r.seq, " ", r.customer, ":", ' ', _jsx("span", { className: "warn-t", children: r.kind === 'rejected' ? `rejected${r.reason ? ` (${r.reason.replace('_', ' ')})` : ''}` : `not delivered${r.outcome_reason ? ` (${r.outcome_reason.replace('_', ' ')})` : ''}` }), r.note ? ` · "${r.note}"` : '', r.staged ? ' · GVR pallet staged at OHR' : ''] })] }, r.id))] }, l.load_id);
            })] });
}
