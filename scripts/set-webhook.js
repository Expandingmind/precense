// Registers the Telegram webhook with our Vercel deployment URL.
// Usage: TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... WEBHOOK_URL=https://precense.vercel.app/api/telegram/webhook node scripts/set-webhook.js

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const url = process.env.WEBHOOK_URL;

if (!token || !secret || !url) {
  console.error('Missing TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, or WEBHOOK_URL');
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    url,
    secret_token: secret,
    allowed_updates: ['message', 'edited_message'],
    drop_pending_updates: true,
  }),
});

const json = await res.json();
console.log(JSON.stringify(json, null, 2));
if (!json.ok) process.exit(1);
