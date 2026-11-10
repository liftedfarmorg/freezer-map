import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { t } from './i18n';
export const NOTIFY_TYPES = [
    ['t_load_assigned', 'Put on a load', 'when you\'re picked as the driver of a load'],
    ['t_load_left', 'Load departed: record your stops', 'when a load you drive leaves, with the link to record each stop'],
    ['t_delivery', 'Delivery problems', 'a stop that wasn\'t a plain delivery (rejected, not delivered)'],
    ['t_metrc', 'METRC follow-ups', 'manifests to void or rejections to check after a delivery'],
    ['t_staging', 'Move back to GVR', 'a GVR pallet staged at OHR whose order was cancelled or isn\'t shipping within 2 days'],
    ['t_acct', 'Accounting flags', 'a credit memo is needed (order cancelled after its invoice)'],
    ['t_other', 'Other alerts', 'everything else for the modules you\'re in'],
];
const CHANNELS = [['alerts_push', 'Push', true], ['alerts_email', 'Email', false], ['alerts_text', 'Text', false]];
export function NotifyBox({ nf, onSave, busy, only, phone, notes = true }) {
    const on = (k, dflt) => nf[k] ?? dflt;
    return _jsxs("div", { className: "notifybox", children: [_jsx("div", { className: "muted small", children: t('How') }), _jsx("div", { className: "row wrap", style: { gap: 12 }, children: CHANNELS.map(([k, l, d]) => _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", disabled: busy, checked: on(k, d), onChange: e => onSave({ [k]: e.target.checked }) }), _jsx("span", { children: t(l) })] }, k)) }), notes && _jsxs("p", { className: "muted small", children: [t('Push needs it turned on for each phone or computer. Email starts once Lifted\'s email sending is connected; texts once texting is connected.'), phone === null || phone === '' ? ` ${t('Texts need a phone number.')}` : ''] }), _jsx("div", { className: "muted small", style: { marginTop: 6 }, children: t('What') }), NOTIFY_TYPES.filter(([k]) => !only || only.includes(k)).map(([k, l, w]) => _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", disabled: busy, checked: on(k, true), onChange: e => onSave({ [k]: e.target.checked }) }), _jsxs("span", { children: [_jsx("b", { children: t(l) }), " ", _jsx("span", { className: "muted", children: t(w) })] })] }, k))] });
}
// 224: Admin > Settings > Alerts: extra people per alert type, on top of the module's own people
export function AlertPeopleAll({ sb, flash }) {
    const [rows, setRows] = useState(null);
    const [edit, setEdit] = useState({});
    const [busy, setBusy] = useState(null);
    const load = () => sb?.rpc('alert_people_list').then(({ data, error }) => { if (error)
        flash(error.message, true);
    else
        setRows((data ?? [])); });
    useEffect(() => { load(); }, [sb]);
    if (!sb)
        return null;
    if (!rows)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    return _jsxs("section", { className: "dcard", children: [_jsx("h3", { children: "Who gets alerts" }), _jsx("p", { className: "muted small", children: "Each alert goes to the people in its module. Add anyone else here (emails, separated by commas). Each person picks push / email and which types they want in My settings; Admins can set it for them in Users." }), rows.map(r => {
                const v = edit[r.kind] ?? r.people;
                return _jsxs("div", { className: "field", style: { marginTop: 10 }, children: [_jsxs("label", { children: [_jsx("b", { children: r.label }), " ", _jsxs("span", { className: "muted small", children: ["\u00B7 goes to ", r.who, ", plus:"] })] }), _jsxs("div", { className: "row wrap", children: [_jsx("input", { style: { minWidth: 320, flex: 1 }, value: v, placeholder: "name@lifted-organics.com", onChange: e => setEdit(x => ({ ...x, [r.kind]: e.target.value })) }), _jsx("button", { className: "primary small", disabled: busy === r.kind || v === r.people, onClick: async () => {
                                        setBusy(r.kind);
                                        const { error } = await sb.rpc('set_alert_people', { p_kind: r.kind, p_emails: v });
                                        setBusy(null);
                                        if (error)
                                            flash(error.message, true);
                                        else {
                                            flash('Saved');
                                            setEdit(x => { const y = { ...x }; delete y[r.kind]; return y; });
                                            load();
                                        }
                                    }, children: "Save" })] })] }, r.kind);
            })] });
}
