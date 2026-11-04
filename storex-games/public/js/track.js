const sid = (() => { try { let s = sessionStorage.getItem('sx_sid'); if (!s) { s = crypto.randomUUID().replace(/-/g, ''); sessionStorage.setItem('sx_sid', s); } return s; } catch { return null; } })();
export function track(type, extra = {}) {
  if (!sid || navigator.doNotTrack === '1' || location.pathname.startsWith('/admin')) return;
  try {
    let ref = null; try { ref = document.referrer ? new URL(document.referrer).hostname : null; } catch { /* */ }
    fetch('/api/track', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, sid, path: location.pathname.slice(0, 120), ref, ...extra }) }).catch(() => {});
  } catch { /* */ }
}