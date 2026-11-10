// 195: "View as" only applies in the tab it was started in. Each browser tab has its own id (sessionStorage keeps it through
// reloads). It goes on every database call (Supabase client headers) and every /api call (the fetch wrapper below).
export const TAB_ID = (() => {
    const make = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `t${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
    try {
        let v = sessionStorage.getItem('fm.tab');
        if (!v) {
            v = make();
            sessionStorage.setItem('fm.tab', v);
        }
        return v;
    }
    catch {
        return make();
    }
})();
let installed = false;
/** add X-Tab-Id to this app's own /api calls (the server passes it on when it asks the database who you are) */
export function installTabHeader() {
    if (installed || typeof window === 'undefined')
        return;
    installed = true;
    const orig = window.fetch.bind(window);
    window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.startsWith('/api/') || url.startsWith(`${location.origin}/api/`)) {
            const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
            h.set('X-Tab-Id', TAB_ID);
            return orig(input, { ...init, headers: h });
        }
        return orig(input, init);
    };
}
