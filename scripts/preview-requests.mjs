// "npm run preview:requests": builds the site with reservation requests switched on, then serves it
// together with the reservation function (functions/api/book.js), the way Cloudflare Pages will.
// The function reads its secrets from the git-ignored file .dev.vars (copy .dev.vars.example).
// Open http://127.0.0.1:8788 when it says "Ready".
//
// The scripts are run through node directly because the folder path contains "&", which breaks
// npm's usual Windows launchers.
import { spawnSync } from 'node:child_process';

const run = (args, env = {}) => {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(['node_modules/astro/bin/astro.mjs', 'build'], { PUBLIC_BOOKING_REQUESTS: 'true' });
run(['node_modules/wrangler/bin/wrangler.js', 'pages', 'dev', 'dist', '--ip', '127.0.0.1', '--port', '8788', '--compatibility-date', '2026-10-01'], { NO_D1_WARNING: 'true' });
