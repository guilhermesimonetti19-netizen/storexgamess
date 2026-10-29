// Adaptador Vercel (Node runtime). Requer plano Pro para uso comercial (ver docs/COSTS.md).
import { createApp } from '../server/router.js';
let app; const get = () => (app ||= createApp({ env: process.env }));
const h = req => get()(req);
export { h as GET, h as POST, h as PUT, h as PATCH, h as DELETE, h as OPTIONS };
