import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useState } from 'react';
const Ctx = createContext(null);
export const useTagCtx = () => useContext(Ctx);
export function TagSuggestProvider({ sb, site, children }) {
    const search = async (w, q = null, count = 200) => {
        if (!sb)
            return null;
        const { data, error } = await sb.rpc('tag_search', { p_pallet: w.pallet ?? null, p_slot: w.slot ?? null, p_site: w.site ?? site, p_q: q || null,
            p_purpose: w.purpose ?? 'mixed', p_type: w.type ?? 'package', p_count: count });
        return error ? null : data;
    };
    return _jsx(Ctx.Provider, { value: { search, sb }, children: children });
}
/** suggestions for one tag box: the next available tags, and as the user types, every available tag that matches */
export function useTagSearch(w, typed) {
    const c = useContext(Ctx);
    const [pool, setPool] = useState(null);
    const [hits, setHits] = useState(null);
    const key = `${w.pallet ?? ''}|${w.slot ?? ''}|${w.purpose ?? ''}|${w.type ?? ''}|${w.site ?? ''}`;
    useEffect(() => { let on = true; c?.search(w).then(p => { if (on)
        setPool(p); }); return () => { on = false; }; }, [c, key]);
    const q = typed.trim().toUpperCase();
    useEffect(() => {
        if (!c || q.length < 3 || !pool?.from_metrc) {
            setHits(null);
            return;
        }
        let on = true;
        const t = setTimeout(() => c.search(w, q, 200).then(p => { if (on && p)
            setHits({ q, tags: p.tags }); }), 250);
        return () => { on = false; clearTimeout(t); };
    }, [c, key, q, pool?.from_metrc]);
    const tags = q.length >= 3 && hits?.q === q ? hits.tags : pool?.tags ?? [];
    // a full tag that isn't on the list: warn (it may be used, voided, on another license, or held for something else)
    const off = !!pool?.from_metrc && q.length === 24 && hits?.q === q && !hits.tags.includes(q);
    return { pool, tags, off };
}
