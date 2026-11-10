import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
/** The script this page loaded with, e.g. /assets/index-AbC123.js */
const mine = () => [...document.scripts].map(s => s.getAttribute('src') ?? '').find(s => /\/assets\/index-[^/]+\.js$/.test(s)) ?? null;
/** A tab left open keeps running the old app after a deploy. Check now and then and offer a reload. */
export function UpdateBanner() {
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const cur = mine();
        if (!cur || import.meta.env.DEV)
            return;
        let last = 0;
        const check = async () => {
            if (Date.now() - last < 60000)
                return;
            last = Date.now();
            try {
                const html = await fetch('/', { cache: 'no-store' }).then(r => r.text());
                const live = html.match(/\/assets\/index-[^"']+\.js/)?.[0];
                if (live && !cur.endsWith(live))
                    setReady(true);
            }
            catch { /* offline: try later */ }
        };
        const onVis = () => { if (document.visibilityState === 'visible')
            check(); };
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('focus', onVis);
        const iv = window.setInterval(check, 5 * 60000);
        return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis); clearInterval(iv); };
    }, []);
    if (!ready)
        return null;
    return _jsxs("div", { className: "update-bar", children: ["A new version of the app is out. ", _jsx("button", { className: "primary small", onClick: () => location.reload(), children: "Reload" })] });
}
