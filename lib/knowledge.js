import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', 'knowledge');

export const NICHES = ['app-ugc', 'faceless-creator', 'founder-b2b', 'lifestyle-personality'];
export const DEFAULT_NICHE = 'app-ugc';

// Load once per container (cold-start warm). If we add hot-reload later, cache-bust here.
const playbooks = Object.fromEntries(
  NICHES.map((slug) => [slug, safeReadPlaybook(slug)])
);

const teardowns = loadTeardowns();

function safeReadPlaybook(slug) {
  try {
    return readFileSync(join(ROOT, 'playbook', `${slug}.md`), 'utf8');
  } catch (e) {
    console.warn(`playbook missing for niche="${slug}"`);
    return '';
  }
}

function loadTeardowns() {
  try {
    const raw = readFileSync(join(ROOT, 'teardowns', 'library.jsonl'), 'utf8');
    return raw
      .split('\n')
      .map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        try {
          return JSON.parse(trimmed);
        } catch (e) {
          console.warn(`teardown parse error line ${i + 1}: ${e.message}`);
          return null;
        }
      })
      .filter(Boolean);
  } catch (e) {
    console.warn('teardowns library missing');
    return [];
  }
}

export function getPlaybook(niche) {
  return playbooks[niche] || playbooks[DEFAULT_NICHE] || '';
}

export function getTeardowns(niche, limit = 12) {
  const matches = teardowns.filter((t) => t.niche === niche);
  return matches.slice(0, limit);
}

export function formatTeardownsForPrompt(teardowns) {
  if (!teardowns.length) return '';
  return teardowns
    .map(
      (t, i) => `### Teardown ${i + 1} — ${t.id} (${t.format}, hook: ${t.hook_type})
- Source: ${t.source} · ${t.app_or_brand}
- Hook: ${t.hook_summary}
- Why it worked: ${t.why_it_worked}
- Pacing: ${t.pacing_notes}
- CTA: ${t.cta}
- Perf: ${t.performance?.metric || 'unknown'} = ${t.performance?.value || 'unknown'}`
    )
    .join('\n\n');
}

export function isValidNiche(slug) {
  return NICHES.includes(slug);
}
