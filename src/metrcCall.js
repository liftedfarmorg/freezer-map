// Calls the METRC server function (/api/metrc/run) from anywhere in the app (loads, Inbound).
export async function metrcRun(sb, body) {
    const { data } = await sb.auth.getSession();
    const r = await fetch('/api/metrc/run', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: `The server didn't answer (${r.status})` }));
    if (!r.ok)
        throw new Error(j.error ?? `Error ${r.status}`);
    return j;
}
/** open a manifest PDF straight from METRC (through T3) in a new tab */
export async function openMetrcManifest(sb, license, manifest) {
    const w = window.open('', '_blank'); // open now, while the click still counts (pop-up blockers)
    try {
        const r = await metrcRun(sb, { action: 'manifest_pdf', license, manifest });
        const bytes = Uint8Array.from(atob(r.base64), ch => ch.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: r.type || 'application/pdf' }));
        if (w)
            w.location.href = url;
        else {
            const a = document.createElement('a');
            a.href = url;
            a.download = `METRC manifest ${r.manifest}.pdf`;
            a.click();
        }
        setTimeout(() => URL.revokeObjectURL(url), 120000);
    }
    catch (e) {
        w?.close();
        throw e;
    }
}
