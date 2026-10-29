// Adaptador Cloudflare Pages Functions.
import { createApp } from '../../server/router.js';
export const onRequest = ({ request, env }) => createApp({ env })(request);
