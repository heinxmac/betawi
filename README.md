# Betawi

Website for Betawi Restaurant, Lake Terrace Tower, JLT, Dubai. Designed and built by heinx.

It is a demo preview: it stays `noindex` (meta tag, `public/_headers`, `public/robots.txt`).

- Stack: Astro, deployed on Cloudflare Pages from this repository. Set `NODE_VERSION=22` in the Cloudflare build settings. Build command `npm run build`, output folder `dist`.
- Pages: `/` home, `/menu/`, one page per dish, `/privacy/`, 404.
- Content: menu in `src/content/menu.json`, venue facts and story in `src/content/restaurant.json`.
- Booking: the sheet posts a table request to `/api/book` (`functions/api/book.js`). It saves to a Google Sheet and Calendar (`google-sheet/Code.gs`), Notion and Telegram, whichever have keys. Without keys the sheet shows "Booking opens soon" and nothing is sent. Setup steps: `BOOKING-SETUP.md`.
- Keys go in the Cloudflare dashboard (Secrets) and the git-ignored `.dev.vars` (template `.dev.vars.example`). Never in code or git.
- Local: `npm install`, `npm run dev`. Test the booking function locally with `npm run preview:requests`, then open http://127.0.0.1:8788.
