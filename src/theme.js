export function applyTheme(t) {
    const v = t === 'light' || t === 'dark' ? t : null;
    if (v)
        document.documentElement.dataset.theme = v;
    else
        delete document.documentElement.dataset.theme;
    try {
        if (v)
            localStorage.setItem('fm.theme', v);
        else
            localStorage.removeItem('fm.theme');
    }
    catch { /* private mode */ }
}
export function savedTheme() { try {
    return localStorage.getItem('fm.theme') || 'system';
}
catch {
    return 'system';
} }
