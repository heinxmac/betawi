# Betawi booking: setup (heinx adds the keys)

The booking sheet sends a table request to `/api/book` (`functions/api/book.js`). The request goes to up to three places at once. Leave any part empty and it is skipped, so you can start with one. The guest sees "Request sent" only if at least one worked.

## Where the keys go
- **On this PC (testing):** the file `.dev.vars` in the site folder (`D:\studio2\sites\betawi\.dev.vars`). It is git-ignored. Then run `npm run preview:requests` and open http://127.0.0.1:8788. Open http://127.0.0.1:8788/api/book to see which parts are set (it never shows the values).
- **On the live site:** Cloudflare dashboard, the Pages project, Settings, Variables and Secrets. Add the same six names, each as a **Secret**. Redeploy after adding.
- Never put a key in code, in a message or in git.

## The six values
| Name | What it is | How to get it |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | The bot that alerts the restaurant | In Telegram, message @BotFather, send `/newbot`, copy the token |
| `TELEGRAM_CHAT_ID` | The chat the bot writes to | Add the bot to the restaurant's group (or message it), then open `https://api.telegram.org/bot<token>/getUpdates` and copy `chat.id` |
| `SHEET_WEBHOOK_URL` | The Google Apps Script web app | Make a Google Sheet, Extensions, Apps Script, paste `google-sheet/Code.gs`, Deploy as web app (run as you, access anyone), copy the URL |
| `SHEET_SECRET` | A long random text shared with the script | Make one up. Paste the SAME text into `SECRET` at the top of `Code.gs` and into this variable. After any edit to the script: Deploy, Manage deployments, Edit, New version |
| `NOTION_TOKEN` | Notion integration secret | notion.so/my-integrations, new integration, copy the secret |
| `NOTION_DB_ID` | The bookings database | Make a database with exactly these columns: Name (title), Guests (number), Date/Time (date), Phone (phone), Notes (text), Status (select: New, Confirmed, Seated). Share it with the integration. The ID is the long code in its URL |

## What a request does
1. The guest picks guests and seating, a day and a time (every 30 minutes, 12:00 to 21:30), then gives a name and mobile number.
2. The server checks the same rules again (day, time, party size, notice) and writes the Sheet row and Calendar event, the Notion card and the Telegram alert.
3. The Telegram alert has buttons that open WhatsApp to the guest with the reply already written: confirm the time, offer the time before or after, or say fully booked.
4. Until the keys are added the sheet shows "Booking opens soon" and nothing is sent.

## Rules to confirm with Dimple (set in `src/content/restaurant.json`, `reservations`)
Last table 1 hour before closing (9:30 PM), a table today needs 1 hour notice, a table is held 90 minutes, requests open 21 days ahead, up to 12 guests online (more: call). WhatsApp number: add it to `whatsapp` in `restaurant.json` (digits only, with country code) once Dimple says which number takes bookings. The sheet then also offers "Message us on WhatsApp".
