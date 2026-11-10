import { useEffect, useRef } from 'react';
const handlers = [];
export function useScanHandler(h) {
    const ref = useRef(h);
    ref.current = h;
    useEffect(() => {
        const entry = ref;
        handlers.push(entry);
        return () => { const i = handlers.indexOf(entry); if (i >= 0)
            handlers.splice(i, 1); };
    }, []);
}
export async function routeScan(tag) {
    for (let i = handlers.length - 1; i >= 0; i--) {
        const h = handlers[i].current;
        if (h && await h(tag))
            return true;
    }
    return false;
}
export const sameTag = (a, b) => !!a && a.trim().toUpperCase() === b.trim().toUpperCase();
