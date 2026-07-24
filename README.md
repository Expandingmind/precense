# Precense

**The agent that studies your feed.**

Precense is an AI content strategist that lives in your messaging app — not another dashboard. You forward it your social videos (reels, TikToks, shorts) like you'd DM a friend. It watches what actually goes viral, finds the patterns across your best posts, learns your personal "signature," and tells you exactly what to make next.

The magic is the packaging: **you just forward it videos.**

---

## The Instagram constraint (why we're not launching there first)

The dream distribution is Instagram DMs — that's where creators already forward reels to each other. But shipping there requires:

- An Instagram **Business** account (users have to convert from Personal)
- A **Meta App Review** for the `instagram_manage_messages` permission
- A use-case description that reviewers routinely **reject** for "personal AI assistant / concierge" style products

So Instagram DM is a **later, gated milestone.** We're not blocking launch on it.

## Channel roadmap

| Channel      | Status          | Why                                                                 |
|--------------|-----------------|---------------------------------------------------------------------|
| **Telegram** | ✅ At launch    | Open Bot API. Receives video files natively. Zero review required. |
| **WhatsApp** | ✅ At launch    | Cloud API. Business verification is straightforward for this use case. |
| Instagram DM | 🟡 Soon (gated) | Requires Meta App Review — in the queue.                            |
| TikTok DM    | 🟡 Soon         | Waiting on platform DM API to open up.                              |

**Telegram first.** It's the fastest path from zero to a working, magical product with real users forwarding real videos. Everything we learn there compounds into the WhatsApp launch and the eventual Instagram push.

## What's in this repo (right now)

Just the marketing site — a static landing page for the waitlist. No backend yet.

- `index.html` — landing page
- `styles.css` — design system (Manrope + Roboto Mono, cream/ink palette, orange accent)
- `script.js` — scroll reveals + animated chat mockup

## What's next

- Telegram bot backend (video ingest → analysis → reply)
- Signature-learning pipeline (per-user pattern store)
- WhatsApp Cloud API adapter
- Instagram DM (post Meta review)

## Local dev

Any static server works. For example:

```bash
npx serve .
# or
python3 -m http.server 3000
```

## Deploy

Deployed on Vercel as a static site.
