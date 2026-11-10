const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
export async function pushState() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
        return ios() && !standalone() ? 'ios_needs_home' : 'unsupported';
    if (Notification.permission === 'denied')
        return 'blocked';
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
}
function keyBytes(b64) {
    const s = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
const device = () => {
    const u = navigator.userAgent;
    const what = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android phone' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows computer' : 'Device';
    const br = /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : /Firefox\//.test(u) ? 'Firefox' : '';
    return `${what}${br ? ` · ${br}` : ''}`;
};
export async function pushOn(sb) {
    const { data: key, error } = await sb.rpc('push_public_key');
    if (error)
        throw new Error(/Could not find the function|schema cache/i.test(error.message) ? 'Run 216 in Supabase first' : error.message);
    if (!key)
        throw new Error('Push isn\'t set up on the server yet');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted')
        throw new Error('Notifications were not allowed. Allow them for this site in the browser or phone settings.');
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub)
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    const j = sub.toJSON();
    const { error: e2 } = await sb.rpc('push_subscribe', { p: { endpoint: j.endpoint, keys: j.keys, device: device() } });
    if (e2)
        throw new Error(e2.message);
}
export async function pushOff(sb) {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
        await sb.rpc('push_unsubscribe', { p_endpoint: sub.endpoint });
        await sub.unsubscribe();
    }
}
/** send what's queued right away (the server also sends every minute) */
export function kickNotify(sb) {
    const go = (tok) => fetch('/api/notify/run', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: '{}' }).catch(() => { });
    if (sb)
        sb.auth.getSession().then(({ data }) => go(data.session?.access_token)).catch(() => go());
    else
        go();
}
