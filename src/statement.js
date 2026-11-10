import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { dfmt, logoData, money } from './docs';
import { Tile, Tiles } from './dash';
// Customer dashboard and statement (feedback 10/24, Matt): current balance, lbs picked up this month vs. the monthly minimum,
// reserves left, and a statement with a PDF. Same thing in the portal (their own) and in Sales (any customer).
// The balance is QuickBooks' customer balance once QuickBooks production is connected (it has the payments, credit memos
// and Roshi-era invoices); until then it's the app's own open invoices.
const n0 = (x) => Math.round(Number(x ?? 0)).toLocaleString();
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const monthName = (iso) => new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString([], { month: 'long' });
const TYPE_L = { Invoice: 'Invoice', Credit: 'Credit memo', Payment: 'Unapplied payment' };
export function useStatement(backend, customerId, rev = 0) {
    const [s, setS] = useState(undefined);
    const [err, setErr] = useState(null);
    useEffect(() => {
        setS(undefined);
        backend.statement(customerId).then(x => { setS(x); setErr(null); }).catch(e => { setS(null); setErr(String(e.message ?? e)); });
    }, [customerId, rev]);
    return { s, err };
}
/** the four numbers at the top of a customer's dashboard */
export function StatementTiles({ s, onBalance }) {
    const b = s.balance, m = s.month, r = s.reserves;
    return (_jsxs(Tiles, { children: [_jsx(Tile, { label: "Current balance", value: money(b.amount), tone: b.past_due > 0 ? 'warn' : 'ok', onClick: onBalance, sub: b.past_due > 0 ? `${money(b.past_due)} past due` : b.amount > 0 ? 'nothing past due' : 'all paid up' }), _jsx(Tile, { label: `Picked up in ${monthName(m.start)}`, value: `${n0(m.shipped)} lbs`, tone: m.min && m.left ? 'info' : undefined, sub: m.min ? (m.left ? `${n0(m.left)} lbs left of your ${n0(m.min)} lb monthly minimum` : `monthly minimum of ${n0(m.min)} lbs met`) : 'no monthly minimum' }), r.strains > 0 && _jsx(Tile, { label: `${r.year} reserves left`, value: `${n0(r.remaining)} lbs`, sub: `of ${n0(r.reserved)} reserved · ${n0(r.shipped)} picked up` }), _jsx(Tile, { label: "Ordered, not shipped yet", value: `${n0(s.pending_lbs)} lbs`, sub: s.pending_lbs ? 'on open orders' : 'no open orders' })] }));
}
function DocLink({ kind, id, label, openDoc, onError }) {
    const [busy, setBusy] = useState(false);
    async function go() {
        const w = window.open('', '_blank');
        if (w)
            w.document.title = `${label} · Lifted Farms`;
        setBusy(true);
        try {
            const url = await openDoc(kind, id);
            if (w)
                w.location.href = url;
            else
                window.location.href = url;
        }
        catch (e) {
            if (w)
                w.close();
            onError(String(e.message ?? e));
        }
        finally {
            setBusy(false);
        }
    }
    return _jsx("button", { className: "linkbtn", disabled: busy, title: `Open ${kind === 'CreditMemo' ? 'credit memo' : 'invoice'} ${label}`, onClick: go, children: busy ? 'Opening…' : label });
}
export function StatementView({ s, staff, openDoc }) {
    const [busy, setBusy] = useState(false);
    const [docErr, setDocErr] = useState(null);
    const b = s.balance;
    const docCell = (kind, id, label) => kind && id && openDoc ? _jsx(DocLink, { kind: kind, id: id, label: label, openDoc: openDoc, onError: setDocErr }) : label;
    const open = s.invoices.filter(i => i.status === 'open' && i.balance > 0);
    return (_jsxs("div", { className: "stmt", children: [_jsxs("div", { className: "row between wrap", children: [_jsx("p", { className: "muted small", children: b.source === 'quickbooks' ? `From our books, updated ${when(b.synced_at)}.` : staff ? 'QuickBooks production isn\'t connected yet, so this is the app\'s own open invoices (no credit memos or Roshi invoices).' : 'From our invoices. Payments can take a day to show.' }), _jsx("button", { className: "ghost small", disabled: busy, onClick: async () => { setBusy(true); try {
                            await downloadStatement(s);
                        }
                        finally {
                            setBusy(false);
                        } }, children: busy ? 'Making PDF…' : 'Download statement (PDF)' })] }), docErr && _jsx("p", { className: "bad-t small", children: docErr }), b.source === 'quickbooks' && s.open_items.length > 0 && _jsxs(_Fragment, { children: [_jsx("h3", { children: "Open items" }), _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "restable wide", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Date" }), _jsx("th", { children: "Type" }), _jsx("th", { children: "#" }), _jsx("th", { children: "Due" }), _jsx("th", { className: "num", children: "Amount" }), _jsx("th", { className: "num", children: "Open" })] }) }), _jsx("tbody", { children: s.open_items.map((x, i) => _jsxs("tr", { className: x.type === 'Invoice' && x.due && x.due < today() ? 'pastdue' : '', children: [_jsx("td", { children: dfmt(x.date) }), _jsx("td", { children: TYPE_L[x.type] ?? x.type }), _jsx("td", { children: docCell(x.kind, x.qbo_id, x.doc ?? '') }), _jsx("td", { children: dfmt(x.due) }), _jsx("td", { className: "num", children: money(x.total) }), _jsx("td", { className: "num", children: _jsx("b", { children: money(x.balance) }) })] }, i)) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { colSpan: 5, children: _jsx("b", { children: "Balance" }) }), _jsx("td", { className: "num", children: _jsx("b", { children: money(b.amount) }) })] }) })] }) })] }), b.source === 'app' && open.length > 0 && _jsxs("p", { className: "muted small", children: [open.length, " open invoice", open.length === 1 ? '' : 's', "."] }), _jsxs("h3", { children: ["Invoices ", _jsxs("span", { className: "muted small", children: ["since ", dfmt(s.from)] })] }), !s.invoices.length ? _jsx("p", { className: "muted", children: "No invoices yet." }) : _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "restable wide", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Date" }), _jsx("th", { children: "Invoice" }), _jsx("th", { className: "hide-s", children: "Order" }), _jsx("th", { children: "Due" }), _jsx("th", { className: "num", children: "Total" }), _jsx("th", { className: "num", children: "Open" }), _jsx("th", {})] }) }), _jsx("tbody", { children: s.invoices.map(i => _jsxs("tr", { className: i.past_due ? 'pastdue' : '', children: [_jsx("td", { children: dfmt(i.invoice_date) }), _jsx("td", { children: i.qbo_id ? docCell(i.kind ?? 'Invoice', i.qbo_id, i.inv_number) : _jsx("a", { href: `/?doc=${i.share_token}`, target: "_blank", rel: "noreferrer", children: i.inv_number }) }), _jsx("td", { className: "hide-s", children: i.so_number ?? '' }), _jsx("td", { children: dfmt(i.due_date) }), _jsx("td", { className: "num", children: money(i.total) }), _jsx("td", { className: "num", children: i.balance ? money(i.balance) : '' }), _jsx("td", { children: _jsx("span", { className: `pill ${i.status === 'paid' || !i.balance ? 'cp-ok' : i.past_due ? 'cp-bad' : 'cp-warn'}`, children: i.status === 'paid' || !i.balance ? 'Paid' : i.past_due ? 'Past due' : 'Open' }) })] }, i.qbo_id ? `q${i.qbo_id}` : i.id)) })] }) })] }));
}
/** dashboard tiles plus a fold-out statement; loads by itself */
export function CustomerDashboard({ backend, customerId, staff, rev = 0 }) {
    const { s, err } = useStatement(backend, customerId, rev);
    const [open, setOpen] = useState(false);
    const sb = backend.client();
    // QuickBooks' copy of an invoice or credit memo: api/qbo/doc.js checks it's theirs and hands back a 5-minute link
    const openDoc = sb ? async (kind, qboId) => {
        const { data } = await sb.auth.getSession();
        const r = await fetch('/api/qbo/doc', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
            body: JSON.stringify({ kind, qbo_id: qboId }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.url)
            throw new Error(j.error ?? `Couldn't open it (${r.status})`);
        return j.url;
    } : undefined;
    if (err)
        return staff ? _jsx("div", { className: "warnbox", children: err }) : null;
    if (s === undefined)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    if (!s)
        return null;
    return (_jsxs("div", { className: "cdash", children: [_jsx(StatementTiles, { s: s, onBalance: () => setOpen(true) }), _jsx("button", { className: "linkbtn", onClick: () => setOpen(!open), children: open ? '▾ Hide statement' : '▸ Statement and invoices' }), open && _jsx(StatementView, { s: s, staff: staff, openDoc: openDoc })] }));
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** history: false leaves off the list of invoices since a year ago (the customer portal's statement is just what's open) */
export async function statementPdf(s, history = true) {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
    const W = pdf.internal.pageSize.getWidth(), M = 40;
    const green = [22, 101, 52], ink = [24, 32, 27], mute = [105, 115, 108], line = [221, 226, 220];
    let y = M;
    const logo = await logoData();
    if (logo) {
        const h = 46, w = h * logo.w / logo.h;
        pdf.addImage(logo.data, 'PNG', M, y, w, h);
    }
    pdf.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...green).text('STATEMENT', W - M, y + 16, { align: 'right' });
    pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...mute).text(`as of ${dfmt(today())}`, W - M, y + 30, { align: 'right' });
    y += 66;
    pdf.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...ink).text(s.customer.name, M, y);
    pdf.setFont('helvetica', 'bold').setFontSize(11).text(`Balance ${money(s.balance.amount)}`, W - M, y, { align: 'right' });
    pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...mute);
    if (s.balance.past_due > 0)
        pdf.text(`${money(s.balance.past_due)} past due`, W - M, y + 13, { align: 'right' });
    y += 26;
    const style = { fontSize: 8.5, cellPadding: 3.5, textColor: ink, lineColor: line, lineWidth: 0.4 };
    const head = { fillColor: [220, 238, 222], textColor: ink, fontStyle: 'bold' };
    if (s.balance.source === 'quickbooks' && s.open_items.length) {
        autoTable(pdf, {
            startY: y, margin: { left: M, right: M }, styles: style, headStyles: head,
            head: [['Date', 'Type', '#', 'Due', { content: 'Amount', styles: { halign: 'right' } }, { content: 'Open', styles: { halign: 'right' } }]],
            body: s.open_items.map(x => [dfmt(x.date), TYPE_L[x.type] ?? x.type, x.doc ?? '', dfmt(x.due), money(x.total), money(x.balance)]),
            foot: [['', '', '', '', { content: 'Balance', styles: { halign: 'right' } }, { content: money(s.balance.amount), styles: { halign: 'right' } }]], footStyles: { fillColor: [245, 247, 245], textColor: ink, fontStyle: 'bold' },
            columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } },
        });
        y = pdf.lastAutoTable.finalY + 18;
        if (history) {
            pdf.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...ink).text(`Invoices since ${dfmt(s.from)}`, M, y);
            y += 6;
        }
    }
    const openOnly = !(s.balance.source === 'quickbooks' && s.open_items.length);
    const invs = history ? s.invoices : openOnly ? s.invoices.filter(i => i.status !== 'paid' && Number(i.balance) > 0) : [];
    if (invs.length || history)
        autoTable(pdf, {
            startY: y, margin: { left: M, right: M }, styles: style, headStyles: head,
            head: [['Date', 'Invoice', 'Order', 'Due', { content: 'Total', styles: { halign: 'right' } }, { content: 'Open', styles: { halign: 'right' } }, '']],
            body: invs.map(i => [dfmt(i.invoice_date), i.inv_number, i.so_number ?? '', dfmt(i.due_date), money(i.total), i.balance ? money(i.balance) : '',
                i.status === 'paid' || !i.balance ? 'Paid' : i.past_due ? 'Past due' : 'Open']),
            columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } },
            didParseCell: h => { if (h.section === 'body' && h.column.index === 6 && h.cell.raw === 'Past due')
                h.cell.styles.textColor = [176, 30, 30]; },
        });
    const H = pdf.internal.pageSize.getHeight();
    pdf.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...mute)
        .text('Lifted Farms · DNA Organics, Inc. · Questions about your account? Reply to your invoice email or call your Lifted contact.', W / 2, H - 20, { align: 'center' });
    return pdf.output('blob');
}
export async function downloadStatement(s, history = true) {
    const b = await statementPdf(s, history);
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u;
    a.download = `Statement ${today()} - ${s.customer.name}.pdf`.replace(/[\\/:*?"<>|]/g, '');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
}
