import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
/** a settings area that folds up; remembers open/closed per browser */
export function Fold({ id, title, count, right, open: def = false, force, children }) {
    const key = `fold.${id}`;
    const [open, setOpen] = useState(() => { try {
        const v = localStorage.getItem(key);
        return v == null ? def : v === '1';
    }
    catch {
        return def;
    } });
    const shown = force || open;
    return (_jsxs("section", { className: `fold ${shown ? 'open' : ''}`, children: [_jsxs("div", { className: "fold-h", onClick: () => { const v = !open; setOpen(v); try {
                    localStorage.setItem(key, v ? '1' : '0');
                }
                catch { /* private */ } }, children: [_jsx("span", { className: "fold-arrow", children: shown ? '▾' : '▸' }), _jsx("b", { children: title }), count != null && _jsxs("span", { className: "muted", children: [" ", count] }), _jsx("span", { className: "grow" }), right && _jsx("span", { onClick: e => e.stopPropagation(), children: right })] }), shown && _jsx("div", { className: "fold-b", children: children })] }));
}
// who's signed in (set by App once it knows): lets deep screens check "Admin of this module" without passing it down
let acc = null;
export const setMyAccess = (a) => { acc = a; };
export const isAdminOf = (m) => !!acc && (acc.owner || acc.modules[m] === 'admin');
export const isOwnerMe = () => !!acc?.owner;
/** can work in a module (User or Admin, not View) */
export const canEditMod = (m) => !!acc && (acc.owner || ['user', 'admin'].includes(acc.modules[m] ?? ''));
/** the permissions grid (058): can I do this action in this module? Before 058: falls back to the level that used to be needed. */
export function can(m, action, fallback = 'admin') {
    if (!acc)
        return false;
    if (acc.owner)
        return true;
    const p = acc.perms?.[m]?.[action];
    if (p != null)
        return p;
    return fallback === 'user' ? canEditMod(m) : isAdminOf(m);
}
/** Admin of any module (or Owner): can change strain names, colors and other names */
export const isAnyAdmin = () => !!acc && (acc.owner || Object.values(acc.modules).includes('admin'));
