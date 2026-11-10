import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
// Scan a METRC tag's barcode with the phone camera. The scanner code only loads when you tap Scan.
// Two ways: live camera (sharper settings for long tag barcodes), or "Take a photo", which uses the
// phone's full-resolution camera and works better on long, thin barcodes.
import { useEffect, useRef, useState } from 'react';
const TAG = /^[0-9A-Z]{24}$/;
const pickTag = (text) => {
    const t = text.trim().toUpperCase().replace(/\s/g, '');
    const m = t.match(/[0-9A-Z]{24}/)?.[0] ?? t;
    return TAG.test(m) ? m : null;
};
async function zxing() {
    const [{ BrowserMultiFormatReader }, lib] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
    const hints = new Map();
    hints.set(lib.DecodeHintType.POSSIBLE_FORMATS, [lib.BarcodeFormat.CODE_128, lib.BarcodeFormat.CODE_39, lib.BarcodeFormat.QR_CODE, lib.BarcodeFormat.DATA_MATRIX]);
    hints.set(lib.DecodeHintType.TRY_HARDER, true);
    return { reader: new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80, delayBetweenScanSuccess: 300 }), lib };
}
/** decode a still photo: try it as-is, rotated, and a few sizes (phone photos are big and often sideways) */
async function decodePhoto(file) {
    const { reader } = await zxing();
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
        for (const width of [1600, 2400, 1000]) {
            for (const rot of [0, 90]) {
                const c = document.createElement('canvas');
                const s = Math.min(1, width / Math.max(img.width, img.height));
                const w = Math.round(img.width * s), h = Math.round(img.height * s);
                c.width = rot ? h : w;
                c.height = rot ? w : h;
                const g = c.getContext('2d');
                if (rot) {
                    g.translate(h, 0);
                    g.rotate(Math.PI / 2);
                }
                g.drawImage(img, 0, 0, w, h);
                try {
                    const tag = pickTag(reader.decodeFromCanvas(c).getText());
                    if (tag)
                        return tag;
                }
                catch { /* try the next one */ }
            }
        }
        return null;
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
export function ScanButton({ onScan, disabled, compact }) {
    const [open, setOpen] = useState(false);
    return (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "ghost small scanbtn", disabled: disabled, onClick: () => setOpen(true), title: "Scan the tag's barcode", children: compact ? '📷' : '📷 Scan' }), open && _jsx(Scanner, { onClose: () => setOpen(false), onScan: t => { setOpen(false); onScan(t); } })] }));
}
export function Scanner({ onClose, onScan, typed }) {
    const [typing, setTyping] = useState('');
    const video = useRef(null);
    const photo = useRef(null);
    const [err, setErr] = useState(null);
    const [seen, setSeen] = useState(null);
    const [busy, setBusy] = useState(false);
    const [miss, setMiss] = useState(false);
    const [torch, setTorch] = useState(null);
    const [torchOn, setTorchOn] = useState(false);
    useEffect(() => {
        let stop = null;
        let done = false;
        (async () => {
            try {
                const { reader } = await zxing();
                if (done || !video.current)
                    return;
                const controls = await reader.decodeFromConstraints({
                    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                }, video.current, result => {
                    if (!result || done)
                        return;
                    const tag = pickTag(result.getText());
                    if (tag) {
                        done = true;
                        controls.stop();
                        navigator.vibrate?.(30);
                        onScan(tag);
                    }
                    else
                        setSeen(result.getText());
                });
                stop = () => controls.stop();
                if (done) {
                    stop();
                    return;
                }
                // continuous focus and a little zoom help with long, thin barcodes (where the phone allows it)
                const track = video.current.srcObject?.getVideoTracks()[0];
                const caps = (track?.getCapabilities?.() ?? {});
                const adv = [];
                if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous'))
                    adv.push({ focusMode: 'continuous' });
                const z = caps.zoom;
                if (z && z.max >= 1.5)
                    adv.push({ zoom: Math.min(2, z.max) });
                if (adv.length)
                    track?.applyConstraints({ advanced: adv }).catch(() => { });
                if (caps.torch)
                    setTorch(() => (on) => track?.applyConstraints({ advanced: [{ torch: on }] }).catch(() => { }));
            }
            catch (e) {
                const m = e.message ?? String(e);
                setErr(/permission|denied|NotAllowed/i.test(m) ? 'Camera access was blocked. Allow the camera for this site (iPhone: Settings > Chrome or Safari > Camera), then try again. Or use Take a photo.' : `Couldn't start the live camera (${m}). Use Take a photo instead.`);
            }
        })();
        return () => { done = true; stop?.(); };
    }, []);
    async function fromPhoto(f) {
        setBusy(true);
        setMiss(false);
        try {
            const tag = await decodePhoto(f);
            if (tag) {
                navigator.vibrate?.(30);
                onScan(tag);
            }
            else
                setMiss(true);
        }
        catch {
            setMiss(true);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsx("div", { className: "scrim scanner", onClick: onClose, children: _jsxs("div", { className: "scanbox", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "row between", children: [_jsx("b", { children: "Point at the barcode on the tag" }), _jsx("button", { className: "ghost small", onClick: onClose, children: "\u2715" })] }), err ? _jsx("p", { className: "warn-t", children: err }) : _jsxs("div", { className: "scanview", children: [_jsx("video", { ref: video, muted: true, playsInline: true }), _jsx("i", { className: "scanframe" })] }), seen && _jsxs("p", { className: "muted small-note", children: ["Read \"", seen, "\", which isn't a METRC tag. Try the tag's own barcode."] }), _jsx("p", { className: "muted small-note", children: "Turn the phone sideways so the barcode fills the box, about 4 to 6 inches away. It fills in by itself once it reads." }), _jsxs("div", { className: "row scanactions", children: [_jsx("button", { className: "primary", disabled: busy, onClick: () => photo.current?.click(), children: busy ? 'Reading photo…' : '📸 Take a photo instead' }), torch && _jsx("button", { className: "ghost", onClick: () => { torch(!torchOn); setTorchOn(!torchOn); }, children: torchOn ? 'Light off' : 'Light on' })] }), typed && _jsxs("form", { className: "row scantype", onSubmit: e => { e.preventDefault(); const tg = pickTag(typing); if (tg)
                        onScan(tg); }, children: [_jsx("input", { className: "mono grow-in", value: typing, onChange: e => setTyping(e.target.value.toUpperCase().replace(/\s/g, '')), placeholder: "Or type the full tag", "aria-label": "Type the tag" }), _jsx("button", { className: "ghost", disabled: !pickTag(typing), children: "Go" })] }), miss && _jsx("p", { className: "warn-t small-note", children: "Couldn't read a tag in that photo. Get closer so the barcode fills most of the picture, keep it flat and in focus, and try again." }), _jsx("input", { ref: photo, type: "file", accept: "image/*", capture: "environment", hidden: true, onChange: e => { const f = e.target.files?.[0]; e.target.value = ''; if (f)
                        fromPhoto(f); } })] }) }));
}
