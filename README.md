# Betawi preview

Private preview for Betawi Restaurant, JLT. Unsigned lead: show it only to Betawi. Preview stays noindex (meta tag, `public/_headers`, `public/robots.txt`).

- Base: Burma Road v5 (Astro, Cloudflare Pages, deploy by git push only). Booking engine copied from Bandung (heinx, 20 Nov 2026). `NODE_VERSION=22` in Cloudflare build settings.
- Pages: `/` home, `/menu`, `/privacy`, 404.
- Design lock: `design/DESIGN.md`. Menu data: `src/content/menu.json` (Talabat prices, all still to confirm). Venue facts: `src/content/restaurant.json` (hours and WhatsApp number still open).
- Booking: the sheet posts a table request to `/api/book` (`functions/api/book.js`). It saves to Google Sheet and Calendar (`google-sheet/Code.gs`), Notion and Telegram, whichever have keys. Until heinx adds the keys, the server answers 502 and the sheet shows "Booking opens soon". Nothing is sent.
- Keys: Cloudflare dashboard (Secrets) and the git-ignored `.dev.vars` (template `.dev.vars.example`). heinx enters them. Never in code or git.
- Build: `npm run build`. Test booking locally with the function: `npm run preview:requests`, then open http://127.0.0.1:8788 (and http://127.0.0.1:8788/api/book to see which keys are set).
