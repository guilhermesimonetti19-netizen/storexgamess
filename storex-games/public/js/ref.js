const K = 'sx_ref', DAYS = 30 * 864e5;
export function captureRef() {
  try { const c = new URLSearchParams(location.search).get('ref');
    if (c && /^[a-z0-9-]{3,30}$/i.test(c)) localStorage.setItem(K, JSON.stringify({ c: c.toLowerCase(), e: Date.now() + DAYS })); } catch { /* */ }
}
export function getRef() {
  try { const r = JSON.parse(localStorage.getItem(K)); return r && r.e > Date.now() ? r.c : undefined; } catch { return undefined; }
}