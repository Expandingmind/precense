// Append a teardown to knowledge/teardowns/library.jsonl.
// Usage:
//   npm run add:teardown                  → interactive prompts
//   npm run add:teardown -- --json '{...}' → non-interactive, pass full JSON
//
// After appending, git add + commit + push to deploy the change.

import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB_PATH = join(__dirname, '..', 'knowledge', 'teardowns', 'library.jsonl');

const NICHES = ['app-ugc', 'faceless-creator', 'founder-b2b', 'lifestyle-personality'];
const SOURCES = ['tiktok', 'meta', 'instagram', 'youtube'];
const FORMATS = ['talking-head', 'screen-record', 'POV', 'skit', 'b-roll-vo', 'other'];
const METRICS = ['days_running', 'views', 'ctr', 'likes', 'unknown'];

const REQUIRED = ['id', 'niche', 'source', 'url', 'app_or_brand', 'format', 'hook_type', 'hook_summary', 'why_it_worked', 'pacing_notes', 'cta', 'performance', 'date_added'];

// --- non-interactive path ---
const jsonFlag = process.argv.indexOf('--json');
if (jsonFlag !== -1) {
  const raw = process.argv[jsonFlag + 1];
  if (!raw) fail('missing value after --json');
  const obj = safeParse(raw);
  validate(obj);
  ensureUniqueId(obj.id);
  append(obj);
  process.exit(0);
}

// --- interactive path ---
const rl = readline.createInterface({ input: stdin, output: stdout });

async function ask(label, opts = {}) {
  const suffix = opts.choices ? ` [${opts.choices.join(' | ')}]` : '';
  const dflt = opts.default != null ? ` (default: ${opts.default})` : '';
  const answer = (await rl.question(`${label}${suffix}${dflt}: `)).trim();
  if (!answer && opts.default != null) return opts.default;
  if (!answer && opts.required !== false) return ask(label, opts);
  if (opts.choices && answer && !opts.choices.includes(answer)) {
    console.log(`must be one of: ${opts.choices.join(', ')}`);
    return ask(label, opts);
  }
  return answer;
}

const today = new Date().toISOString().slice(0, 10);

const entry = {
  id: await ask('id (short-slug)'),
  niche: await ask('niche', { choices: NICHES }),
  source: await ask('source', { choices: SOURCES }),
  url: await ask('url'),
  app_or_brand: await ask('app_or_brand'),
  format: await ask('format', { choices: FORMATS }),
  hook_type: await ask('hook_type (short label)'),
  hook_summary: await ask('hook_summary (1 paraphrased line — do NOT paste full script)'),
  why_it_worked: await ask('why_it_worked (1-3 sentences)'),
  pacing_notes: await ask('pacing_notes'),
  cta: await ask('cta'),
  performance: {
    metric: await ask('performance.metric', { choices: METRICS, default: 'unknown' }),
    value: await ask('performance.value', { default: 'unknown' }),
  },
  date_added: await ask('date_added (YYYY-MM-DD)', { default: today }),
};

rl.close();

validate(entry);
ensureUniqueId(entry.id);
append(entry);

// --- helpers ---
function safeParse(raw) {
  try { return JSON.parse(raw); } catch (e) { fail(`invalid JSON: ${e.message}`); }
}
function validate(obj) {
  for (const f of REQUIRED) {
    if (obj[f] == null || obj[f] === '') fail(`missing field: ${f}`);
  }
  if (!NICHES.includes(obj.niche)) fail(`invalid niche: ${obj.niche}`);
  if (!SOURCES.includes(obj.source)) fail(`invalid source: ${obj.source}`);
  if (!FORMATS.includes(obj.format)) fail(`invalid format: ${obj.format}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(obj.date_added)) fail(`date_added must be YYYY-MM-DD`);
  if (typeof obj.performance !== 'object' || !obj.performance.metric) fail(`performance must be an object with metric+value`);
}
function ensureUniqueId(id) {
  const existing = readFileSync(LIB_PATH, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l).id);
  if (existing.includes(id)) fail(`id "${id}" already exists — pick a new slug`);
}
function append(obj) {
  appendFileSync(LIB_PATH, JSON.stringify(obj) + '\n', 'utf8');
  console.log(`\n✓ appended teardown "${obj.id}" to ${LIB_PATH}`);
  console.log('\nnext steps:');
  console.log('  git add knowledge/teardowns/library.jsonl');
  console.log(`  git commit -m "teardown: ${obj.id}"`);
  console.log('  git push');
  console.log('\n(vercel auto-deploys on push; live in ~30s)');
}
function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}
