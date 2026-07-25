# Teardown Library

Real-world video teardowns Precense uses as few-shot references when analyzing a user's video. Loaded into the system prompt (cached) and filtered by the user's niche at request time.

## Schema (one JSON object per line, JSONL format)

| Field | Required | Notes |
|---|---|---|
| `id` | ✅ | Short kebab-case slug, unique across the library. |
| `niche` | ✅ | One of: `app-ugc`, `faceless-creator`, `founder-b2b`, `lifestyle-personality`. |
| `source` | ✅ | `tiktok` \| `meta` \| `instagram` \| `youtube`. |
| `url` | ✅ | Link to the original post. Placeholder URLs in seed entries are marked with `EXAMPLE` in the ID segment. |
| `app_or_brand` | ✅ | Free text — the app, brand, or creator category. |
| `format` | ✅ | `talking-head` \| `screen-record` \| `POV` \| `skit` \| `b-roll-vo` \| `other`. |
| `hook_type` | ✅ | Short label (e.g. `pattern-interrupt`, `dupe`, `insider-tell`, `firing-clients`). Reuse existing labels where possible so patterns aggregate. |
| `hook_summary` | ✅ | One paraphrased line describing the opener. **Do not paste long verbatim scripts** — paraphrase, keep it short. |
| `why_it_worked` | ✅ | 1–3 sentence analysis. What specifically made it convert / retain. |
| `pacing_notes` | ✅ | Concrete edit-level observations. Cuts, timestamps, on-screen elements. |
| `cta` | ✅ | What the ask was and how it was framed. |
| `performance` | ✅ | `{ "metric": "days_running \| views \| ctr \| likes", "value": "..." }`. If unknown, use `{"metric":"unknown","value":"unknown"}`. |
| `date_added` | ✅ | `YYYY-MM-DD`. |

## Rules

- **Append-only.** Add new lines. Do not rewrite or reorder existing lines. If a teardown is wrong, add a corrected line with a new ID and leave the old one — Claude will use whichever is more relevant.
- **One JSON object per line, no trailing commas, no line breaks inside an entry.**
- **`hook_summary` is paraphrased, not copied.** Never paste more than ~10 verbatim words of someone else's script.
- **Niche must match one of the four playbook slugs exactly** — otherwise the teardown will never be surfaced.

## Adding a teardown

```bash
npm run add:teardown
```

The script prompts for each field, validates the JSON, and appends. If you'd rather edit `library.jsonl` directly, fine — just keep the shape.

Files are bundled at deploy time, so new teardowns take effect after your next `git push` (Vercel auto-deploys, live in ~30s).
