import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { MODULES } from './types';
import { applyTheme } from './theme';
import { LANGS, lang, t } from './i18n';
import { pushOff, pushOn, pushState } from './push';
import { NotifyBox } from './notifyprefs';
/** Top bar ⚙: your own settings. Nothing here changes anyone else's view. */
export function MySettings({ backend, me, flash, onSaved }) {
    const p = me.access.prefs ?? {};
    const [name, setName] = useState(me.display_name ?? '');
    const [busy, setBusy] = useState(false);
    // your phone (SQL 200): goes on METRC manifests when you drive
    const [phone, setPhone] = useState(''), [phone0, setPhone0] = useState('');
    useEffect(() => { backend.myPhone().then(x => { setPhone(x ?? ''); setPhone0(x ?? ''); }).catch(() => { }); }, [backend]);
    const savePhone = async () => {
        setBusy(true);
        try {
            await backend.setMyPhone(phone);
            setPhone0(phone.trim());
            flash(t('Phone saved'));
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    };
    const mine = MODULES.filter(m => me.access.modules[m.key]);
    const lv = me.access.modules;
    async function savePref(x, msg = 'Saved') {
        msg = t(msg);
        setBusy(true);
        try {
            const out = await backend.setMyPrefs(x);
            onSaved(out, null);
            flash(msg);
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    }
    async function saveName() {
        setBusy(true);
        try {
            await backend.setMyName(name);
            onSaved(p, name.trim() || null);
            flash(t('Name saved'));
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const seg = (val, opts, on) => (_jsx("div", { className: "seg", children: opts.map(([v, l]) => _jsx("button", { disabled: busy, className: val === v ? 'on' : '', onClick: () => on(v), children: l }, v)) }));
    return (_jsxs("div", { className: "list mine", children: [_jsx("h2", { children: t('My settings') }), _jsxs("p", { className: "muted", children: [t('Just for you. Signed in as {e}', { e: me.real_email ?? me.email }), me.viewing_as ? ` (${t('viewing as {e}: changes are off', { e: me.email })})` : '', "."] }), _jsxs("section", { className: "dcard", children: [_jsx("h3", { children: t('Name') }), _jsxs("div", { className: "row", children: [_jsx("input", { value: name, placeholder: t('What the app shows'), onChange: e => setName(e.target.value) }), _jsx("button", { className: "primary small", disabled: busy || name.trim() === (me.display_name ?? ''), onClick: saveName, children: t('Save') })] }), _jsx("p", { className: "muted", children: t('Shows on your activity and in the top bar.') })] }), _jsxs("section", { className: "dcard", children: [_jsx("h3", { children: t('Phone') }), _jsxs("div", { className: "row", children: [_jsx("input", { type: "tel", value: phone, placeholder: "831-555-0100", onChange: e => setPhone(e.target.value) }), _jsx("button", { className: "primary small", disabled: busy || phone.trim() === phone0, onClick: savePhone, children: t('Save') })] }), _jsx("p", { className: "muted", children: t('So people in the app can reach you.') })] }), _jsxs("section", { className: "dcard", children: [_jsx("h3", { children: lang() === 'es' ? 'Idioma · Language' : 'Language · Idioma' }), seg(p.lang ?? 'en', LANGS, v => savePref({ lang: v }, v === 'es' ? 'Idioma: español' : 'Language: English')), _jsx("p", { className: "muted", children: t('Screens show in this language. An Admin can also set it for you.') })] }), _jsxs("section", { className: "dcard", children: [_jsx("h3", { children: t('Look') }), seg(p.theme ?? 'system', [['system', t('Match device')], ['light', t('Light')], ['dark', t('Dark')]], v => { applyTheme(v); savePref({ theme: v }, 'Theme saved'); })] }), _jsxs("section", { className: "dcard", children: [_jsx("h3", { children: t('When the app opens') }), mine.length > 1 && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Start in') }), seg(p.start_module ?? '', [['', t('Where I left off')], ...mine.map(m => [m.key, t(m.label)])], v => savePref({ start_module: (v || null) }))] }), lv.distribution && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Freezer site') }), seg(p.start_site ?? 'OHR', [['OHR', 'OHR'], ['GVR', 'GVR']], v => savePref({ start_site: v }))] })] }), _jsx(NotifySection, { backend: backend, p: p, busy: busy, savePref: savePref, phone: phone0 }), lv.sales && _jsxs("section", { className: "dcard", children: [_jsx("h3", { children: t('Emails') }), lv.sales === 'admin' && _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", disabled: busy, checked: p.notify?.requests !== false, onChange: e => savePref({ notify: { ...p.notify, requests: e.target.checked } }) }), _jsxs("span", { children: [_jsx("b", { children: t('Reserve requests') }), " ", _jsx("span", { className: "muted", children: t('when a customer asks to change a reserve') })] })] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", disabled: busy, checked: p.notify?.orders !== false, onChange: e => savePref({ notify: { ...p.notify, orders: e.target.checked } }) }), _jsxs("span", { children: [_jsx("b", { children: t('New orders') }), " ", _jsx("span", { className: "muted", children: t('when a customer places an order in the portal') })] })] })] }), (me.access.owner || lv.compliance === 'admin') && _jsxs("section", { className: "dcard", children: [_jsx("h3", { children: t('METRC emails') }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", disabled: busy, checked: p.notify?.metrc_pull === true, onChange: e => savePref({ notify: { ...p.notify, metrc_pull: e.target.checked } }) }), _jsxs("span", { children: [_jsx("b", { children: t('METRC pull problems') }), " ", _jsx("span", { className: "muted", children: t("when a license's nightly METRC pull doesn't finish") })] })] })] }), _jsxs("section", { className: "dcard", children: [_jsx("h3", { children: t('What you can use') }), me.access.owner ? _jsx("p", { children: t('Owner: every module, as Admin.') }) : mine.length ? _jsx("div", { className: "dlist", children: mine.map(m => (_jsxs("div", { className: "drow", children: [_jsxs("span", { children: [_jsx("b", { children: t(m.label) }), _jsxs("span", { className: "muted", children: [" \u00B7 ", lv[m.key] === 'admin' && m.key !== 'admin' ? `${t(m.user)} ${t(m.admin)}` : t(m.user)] })] }), _jsx("span", { className: "pill", children: t(m.key === 'admin' ? 'On' : lv[m.key] === 'admin' ? 'Admin' : lv[m.key] === 'view' ? 'View only' : 'User') })] }, m.key))) })
                        : _jsx("p", { className: "muted", children: t('Nothing yet.') }), _jsx("p", { className: "muted", children: t('Ask someone with the Admin module if you need more.') })] })] }));
}
/** 216: alerts (deliveries, your loads, your modules' alerts) by push, email or text */
function NotifySection({ backend, p, busy, savePref, phone }) {
    const [st, setSt] = useState(null);
    const [work, setWork] = useState(false);
    const [msg, setMsg] = useState(null);
    useEffect(() => { pushState().then(setSt).catch(() => setSt('unsupported')); }, []);
    const sb = backend.client();
    const nf = (p.notify ?? {});
    async function toggle() {
        if (!sb)
            return;
        setWork(true);
        setMsg(null);
        try {
            if (st === 'on') {
                await pushOff(sb);
                setSt('off');
            }
            else {
                await pushOn(sb);
                setSt('on');
            }
        }
        catch (e) {
            setMsg(e.message);
        }
        finally {
            setWork(false);
        }
    }
    return _jsxs("section", { className: "dcard", children: [_jsx("h3", { children: t('Notifications') }), _jsx("p", { className: "muted", children: t('Delivery alerts, the loads you drive, and alerts for the modules you run.') }), _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Push on this device') }), st === 'ios_needs_home' ? _jsx("p", { className: "muted small", children: t('To get notifications on iPhone: tap Share, then Add to Home Screen, and open Lifted from the Home Screen.') })
                        : st === 'unsupported' ? _jsx("p", { className: "muted small", children: t("This browser can't show notifications.") })
                            : st === 'blocked' ? _jsx("p", { className: "warn-t small", children: t('Notifications are blocked for this site. Allow them in the browser or phone settings.') })
                                : _jsxs("div", { className: "row", children: [_jsx("button", { className: st === 'on' ? 'ghost small' : 'primary small', disabled: work || !st, onClick: toggle, children: st === 'on' ? t('Turn off on this device') : t('Turn on notifications') }), st === 'on' && _jsx("span", { className: "muted small", children: t('On for this device') })] }), msg && _jsx("p", { className: "neg small", children: msg })] }), _jsx(NotifyBox, { nf: nf, busy: busy, phone: phone, onSave: x => savePref({ notify: { ...p.notify, ...x } }) })] });
}
