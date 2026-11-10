import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import './cportal.css';
const clean = () => history.replaceState(null, '', location.pathname);
// signed-out screens share the portal's look (cportal.css): black header with the logo, a white card for the form
function Shell({ title, sub, children, foot }) {
    useEffect(() => { document.title = 'Lifted Farms Orders'; }, []);
    return (_jsx("div", { className: "cp", children: _jsx("div", { className: "cp-col", children: _jsxs("div", { className: "cp-screen", style: { paddingBottom: 32 }, children: [_jsxs("header", { className: "cp-hdr cp-auth-hdr", children: [_jsx("img", { className: "cp-logo", src: "/logo-dark.svg", alt: "Lifted Farms" }), _jsx("h1", { children: title }), sub && _jsx("p", { className: "cp-sub", children: sub })] }), _jsxs("main", { className: "cp-main cp-lift", children: [_jsx("section", { className: "cp-card cp-authcard", children: children }), foot && _jsx("p", { className: "cp-meta", style: { margin: '4px 6px 0', textAlign: 'center' }, children: foot })] })] }) }) }));
}
function PasswordPair({ pw, setPw, pw2, setPw2 }) {
    return (_jsxs(_Fragment, { children: [_jsxs("label", { className: "cp-field", children: ["Password ", _jsx("span", { className: "cp-meta", style: { marginTop: -4 }, children: "8 or more characters" }), _jsx("input", { type: "password", autoComplete: "new-password", value: pw, onChange: e => setPw(e.target.value) })] }), _jsxs("label", { className: "cp-field", children: ["Password again", _jsx("input", { type: "password", autoComplete: "new-password", value: pw2, onChange: e => setPw2(e.target.value) })] }), pw2.length > 0 && pw !== pw2 && _jsx("p", { className: "cp-err", style: { margin: 0 }, children: "Passwords don't match" })] }));
}
// the sign-in screen remembers the last email that signed in on this device
const EMAIL_KEY = 'cp-last-email';
const lastEmail = () => { try {
    return localStorage.getItem(EMAIL_KEY) ?? '';
}
catch {
    return '';
} };
const rememberEmail = (e) => { try {
    localStorage.setItem(EMAIL_KEY, e.trim().toLowerCase());
}
catch { /* private mode */ } };
function SignInForm({ backend, onDone, email0 }) {
    const [email, setEmail] = useState(email0 ?? lastEmail());
    const [pw, setPw] = useState('');
    const [err, setErr] = useState(null);
    const [busy, setBusy] = useState(false);
    async function go(e) {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
            await backend.passwordSignIn(email, pw);
            rememberEmail(email);
            clean();
            onDone();
        }
        catch (x) {
            setErr(x.message);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("form", { className: "cp-authform", onSubmit: go, children: [_jsxs("label", { className: "cp-field", children: ["Email", _jsx("input", { type: "email", autoComplete: "username", value: email, onChange: e => setEmail(e.target.value), autoFocus: !email })] }), _jsxs("label", { className: "cp-field", children: ["Password", _jsx("input", { type: "password", autoComplete: "current-password", value: pw, onChange: e => setPw(e.target.value), autoFocus: !!email })] }), err && _jsx("p", { className: "cp-err", style: { margin: 0 }, children: err }), _jsx("button", { className: "cp-btn cp-full", disabled: busy || !email || !pw, children: busy ? 'Signing in…' : 'Sign in' })] }));
}
export function PortalLogin({ backend, onDone }) {
    return (_jsx(Shell, { title: "Customer Portal", sub: "Sign in to see your reserves, the open menu, and your orders.", foot: "New here or forgot your password? Ask your Lifted contact for a link.", children: _jsx(SignInForm, { backend: backend, onDone: onDone }) }));
}
// opened from an invite or reset link. An old link is never a dead end: if the login is already set up we show
// sign-in with the email filled in, and if they're already signed in we go straight into the portal.
export function PortalLink({ backend, kind, code, onDone }) {
    const [info, setInfo] = useState(undefined);
    const [pw, setPw] = useState('');
    const [pw2, setPw2] = useState('');
    const [err, setErr] = useState(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        (async () => {
            try {
                const [i, signedIn] = await Promise.all([backend.checkLink(code), backend.getUser()]);
                const live = i && i.kind === kind && (i.status ?? 'ok') === 'ok';
                // a used or unknown link while already signed in on this device: just open the portal
                if (!live && signedIn) {
                    clean();
                    onDone();
                    return;
                }
                setInfo(i && i.kind === kind ? i : i && i.status === 'signin' ? i : null);
            }
            catch (e) {
                setErr(String(e.message ?? e));
                setInfo(null);
            }
        })();
    }, [code]);
    async function go(e) {
        e.preventDefault();
        if (!info)
            return;
        setBusy(true);
        setErr(null);
        try {
            if (kind === 'invite')
                await backend.claimInvite(code, info.email, pw);
            else {
                await backend.resetPassword(code, pw);
                await backend.passwordSignIn(info.email, pw);
            }
            rememberEmail(info.email);
            clean();
            onDone();
        }
        catch (x) {
            setErr(x.message);
        }
        finally {
            setBusy(false);
        }
    }
    if (info === undefined)
        return _jsx(Shell, { title: "Customer Portal", children: _jsx("p", { className: "cp-meta", style: { margin: 0 }, children: "Checking your link\u2026" }) });
    if (info?.status === 'signin')
        return (_jsx(Shell, { title: `Welcome back${info.display_name ? `, ${info.display_name}` : ''}`, sub: "Your login is already set up. Sign in with your password.", foot: "Forgot your password? Ask your Lifted contact for a reset link.", children: _jsx(SignInForm, { backend: backend, onDone: onDone, email0: info.email }) }));
    if (!info || info.status === 'expired')
        return (_jsxs(Shell, { title: info ? 'This invite has expired' : "This link doesn't work", sub: "Ask your Lifted contact for a new one.", foot: "Already set up your login? Sign in with your email and password.", children: [_jsx("p", { className: "cp-meta", style: { margin: 0, fontSize: 15 }, children: err ?? (info ? 'Invites last 14 days. Your Lifted contact can send a fresh one in a minute.' : 'It may be incomplete. Try tapping it again, or sign in below.') }), _jsx("button", { className: "cp-btn cp-full", onClick: () => { clean(); onDone(); }, children: "Go to sign in" })] }));
    const ok = pw.length >= 8 && pw === pw2;
    return (_jsx(Shell, { title: kind === 'invite' ? `Welcome${info.display_name ? `, ${info.display_name}` : ''}` : 'Set a new password', sub: kind === 'invite' ? `Set a password for the ${info.customer_name ? info.customer_name + ' ' : ''}customer portal.` : 'Pick a new password for your login.', foot: kind === 'invite' ? 'Next time, just open lifted-orders.app and sign in with this email and password.' : undefined, children: _jsxs("form", { className: "cp-authform", onSubmit: go, children: [_jsxs("label", { className: "cp-field", children: ["Email", _jsx("input", { type: "email", name: "email", autoComplete: "username", value: info.email, readOnly: true })] }), _jsx(PasswordPair, { pw: pw, setPw: setPw, pw2: pw2, setPw2: setPw2 }), err && _jsx("p", { className: "cp-err", style: { margin: 0 }, children: err }), _jsx("button", { className: "cp-btn cp-full", disabled: busy || !ok, children: busy ? 'Saving…' : kind === 'invite' ? 'Create my login' : 'Save password' })] }) }));
}
// the signed-in portal itself (redesign, 150) lives in cportal.tsx
export { Portal } from './cportal';
