export const ISSUE_LABEL = {
    weight: "Weight doesn't match", not_in_metrc: 'In the app, not active in METRC', not_in_app: 'In METRC, not in the app',
    closed_in_app: 'Closed in the app, active in METRC', other_license: 'Different license', item: "Item doesn't match",
    on_hold: 'On hold / failed lab test in METRC', tag_pending: 'No tag yet in the app', stale: "Hasn't moved in a while",
};
export const ISSUE_ORDER = ['weight', 'not_in_metrc', 'not_in_app', 'closed_in_app', 'other_license', 'item', 'on_hold', 'tag_pending', 'stale'];
export const ACTIONS = ['Use METRC', 'Keep app', 'Ignore'];
/** clones, seeds, immature plants: the app doesn't track these as pallets yet */
export const isPlant = (r) => r.issue === 'not_in_app' && /\b(clones?|seeds?|immature|plants?|teens?)\b/i.test(`${r.metrc_item ?? ''} ${r.strain ?? ''}`);
/** what METRC shows, in words, including "never there" */
export const shows = (r) => r.explain ?? (r.issue === 'not_in_metrc' ? 'Never created in METRC (tag not found under any license this season)' : '');
const r2 = (x) => (x == null ? null : Math.round(Number(x) * 100) / 100);
const d = (iso) => (iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' }) : '');
/** the key that ties a row back when the Excel comes back: issue | tag | pallet id */
export const rowKey = (r) => [r.issue, r.tag ?? '', r.pallet_id ?? ''].join('|');
const COLS = ['Key', 'Issue', 'Site', 'License', 'Package', 'Tag', 'Strain / item', 'App lbs', 'METRC lbs', 'Difference', 'App spot', 'METRC location', 'METRC last change', 'What METRC shows', 'Action', 'Reason'];
function cells(r) {
    const diff = r.app_lbs != null && r.metrc_lbs != null ? r2(r.metrc_lbs - r.app_lbs) : null;
    return [rowKey(r), ISSUE_LABEL[r.issue], r.site ?? '', r.license, r.code ?? '', r.tag ?? '', r.strain ?? r.metrc_item ?? '',
        r2(r.app_lbs), r2(r.metrc_lbs), diff, r.app_spot ?? '', r.metrc_location ?? '', d(r.metrc_changed), [shows(r), r.note].filter(Boolean).join(' · '), '', ''];
}
const sorted = (rows) => [...rows].sort((a, b) => ISSUE_ORDER.indexOf(a.issue) - ISSUE_ORDER.indexOf(b.issue) || (a.site ?? '').localeCompare(b.site ?? '') || (a.code ?? a.tag ?? '').localeCompare(b.code ?? b.tag ?? ''));
export async function reconExcel(rows, name) {
    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const head = COLS.map(c => ({ value: c, fontWeight: 'bold', backgroundColor: c === 'Action' || c === 'Reason' ? '#FFF4CC' : '#E8EFE9' }));
    const body = sorted(rows).map(r => cells(r).map((v, i) => ({ value: v ?? null, type: typeof v === 'number' ? Number : String, ...(i >= 14 ? { backgroundColor: '#FFFBEA' } : {}) })));
    const help = [[{ value: 'How to use this sheet', fontWeight: 'bold' }], ...[
            'One row per mismatch between METRC and the app (pulled through T3).',
            'Action: Use METRC (change the app to match METRC), Keep app (METRC needs fixing; the app stays), or Ignore.',
            'Reason: why (e.g. "sent to Bear Labs 10/16, not entered in the app"). It is saved with every change.',
            'Leave the Key column alone. Save, then drop this file on Compliance > METRC > Reconcile to apply the rows in bulk.',
        ].map(t => [{ value: t }])];
    await writeXlsxFile([
        { data: [head, ...body], sheet: 'Mismatches', stickyRowsCount: 1,
            columns: [8, 30, 6, 15, 9, 27, 28, 9, 9, 10, 16, 16, 12, 60, 13, 40].map(width => ({ width })) },
        { data: help, sheet: 'How to use', columns: [{ width: 110 }] },
    ]).toFile(`${name}.xlsx`);
}
export async function reconPdf(rows, o) {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
    const W = pdf.internal.pageSize.getWidth(), M = 28;
    const green = [22, 101, 52], mute = [105, 115, 108];
    pdf.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...green).text('METRC vs APP: MISMATCHES', M, M + 8);
    pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...mute);
    pdf.text(`${rows.length} row${rows.length === 1 ? '' : 's'} · METRC pulled ${o.pulled} · printed ${new Date().toLocaleString()} by ${o.who}`, M, M + 22);
    let y = M + 34;
    for (const issue of ISSUE_ORDER) {
        const g = sorted(rows.filter(r => r.issue === issue));
        if (!g.length)
            continue;
        autoTable(pdf, {
            startY: y, margin: { left: M, right: M },
            head: [[{ content: `${ISSUE_LABEL[issue]}  (${g.length})`, colSpan: 11, styles: { fillColor: green, textColor: 255, fontStyle: 'bold' } }],
                ['Site', 'Package', 'Tag', 'Strain / item', 'App lbs', 'METRC lbs', 'Diff', 'App spot', 'METRC loc.', 'What METRC shows', 'Action / reason']],
            body: g.map(r => { const c = cells(r); return [c[2], c[4], r.tag ?? '', c[6], c[7] ?? '', c[8] ?? '', c[9] ?? '', c[10], c[11], c[13], '']; }),
            styles: { fontSize: 7, cellPadding: 2.5, overflow: 'linebreak', valign: 'top' },
            headStyles: { fillColor: [232, 239, 233], textColor: 30, fontStyle: 'bold' },
            columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 40 }, 2: { cellWidth: 96 }, 3: { cellWidth: 92 }, 4: { cellWidth: 38, halign: 'right' }, 5: { cellWidth: 40, halign: 'right' },
                6: { cellWidth: 34, halign: 'right' }, 7: { cellWidth: 56 }, 8: { cellWidth: 56 }, 9: { cellWidth: 'auto' }, 10: { cellWidth: 80 } },
            didDrawPage: () => { pdf.setFontSize(7).setTextColor(...mute).text(`${o.name} · page ${pdf.getNumberOfPages()}`, W - M, pdf.internal.pageSize.getHeight() - 12, { align: 'right' }); },
        });
        y = pdf.lastAutoTable.finalY + 14;
    }
    if (!rows.length)
        pdf.setFontSize(11).setTextColor(30).text('Everything matches.', M, y + 10);
    pdf.save(`${o.name}.pdf`);
}
