// Precense app SPA — hash-routed.

const VIEWS = ['home', 'saved', 'profile', 'settings'];
const view = document.getElementById('view');
const sideNav = document.getElementById('side-nav');
const mobileNav = document.getElementById('mobile-nav');

const ICON_PLAY = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const ICON_HEART = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
const ICON_CLOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const ICON_SPARK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/></svg>`;
const ICON_ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 5l7 7-7 7"/></svg>`;

let state = { loading: true, data: null, error: null };

// -------- data --------
async function loadData() {
  const params = new URLSearchParams(window.location.search);
  const handle = params.get('u') || '';
  try {
    const res = await fetch(`/api/user-data?u=${encodeURIComponent(handle)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
  } catch (e) {
    state.error = e.message;
    state.data = null;
  } finally {
    state.loading = false;
  }
}

// -------- routing --------
function currentView() {
  const raw = (window.location.hash || '#home').replace(/^#/, '').split('/')[0];
  return VIEWS.includes(raw) ? raw : 'home';
}

function render() {
  const v = currentView();
  const tpl = document.getElementById(`tpl-${v}`);
  if (!tpl) return;

  view.innerHTML = '';
  view.appendChild(tpl.content.cloneNode(true));

  updateNav(v);
  hydrateSide();
  hydrate(v);
  wireReveals();
  showDemoNoteIfNeeded();

  requestAnimationFrame(() => window.scrollTo({ top: 0 }));
}

function updateNav(v) {
  [sideNav, mobileNav].forEach((el) => {
    if (!el) return;
    el.querySelectorAll('a').forEach((a) => {
      if (a.dataset.view === v) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  });
}

function wireReveals() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.06, rootMargin: '0px 0px -60px 0px' });
  document.querySelectorAll('.reveal:not(.in)').forEach((el) => io.observe(el));
}

// -------- hydration --------
function hydrateSide() {
  const u = state.data?.user || {};
  const initial = (u.first_name || u.handle || 'P').charAt(0).toUpperCase();
  document.querySelectorAll('[data-profile-initial]').forEach((el) => (el.textContent = initial));
  const nameEl = document.querySelector('[data-side-name]');
  const handleEl = document.querySelector('[data-side-handle]');
  if (nameEl) nameEl.textContent = u.first_name || u.handle || 'Guest';
  if (handleEl) handleEl.textContent = u.handle ? `@${u.handle}` : '@—';
}

function hydrate(v) {
  const d = state.data;
  if (!d) return;
  if (v === 'home') hydrateHome(d);
  if (v === 'profile') hydrateProfile(d);
}

function hydrateHome(d) {
  const nameEl = view.querySelector('[data-greeting-name]');
  const firstName = (d.user?.first_name || d.user?.handle || 'friend').split(' ')[0];
  if (nameEl) nameEl.textContent = capitalize(firstName);

  const todayEl = view.querySelector('[data-today]');
  if (todayEl) todayEl.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long' });

  // Rail — signature summary + count
  const sig = d.signature || {};
  fillChips('[data-rail-hooks]', sig.dominant_hook_types, 'nothing yet');
  fillChips('[data-rail-formats]', sig.dominant_formats, 'nothing yet');
  fillChips('[data-rail-subjects]', sig.common_subjects, 'nothing yet');
  const railCount = view.querySelector('[data-rail-count]');
  if (railCount) railCount.textContent = String(sig.video_count || 0);

  // Feed
  const feedEl = view.querySelector('#feed');
  const emptyHint = view.querySelector('#empty-hint');
  if (!feedEl) return;

  const subs = d.submissions || [];
  if (!subs.length) {
    feedEl.remove();
    if (emptyHint) emptyHint.hidden = false;
    return;
  }

  feedEl.innerHTML = subs.map((s, i) => contentCardHtml(s, i)).join('');
  feedEl.querySelectorAll('.content-card-heart').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const active = btn.getAttribute('data-active') === 'true';
      btn.setAttribute('data-active', String(!active));
    });
  });
}

function contentCardHtml(sub, index) {
  const badge = sub.metrics?.badge || 'analyzed';
  const tone = sub.metrics?.tone || (index === 0 ? 'gold' : '');
  const take = shortenTake(sub.precense_reply);
  const when = timeAgo(sub.submitted_at);
  const bg = paletteFor(sub.extracted_features?.hook_type || String(index));
  return `
    <article class="content-card" data-id="${escapeAttr(sub.id)}">
      <div class="content-card-thumb" style="background: ${bg};"></div>
      <div class="content-card-top">
        <span class="content-card-badge"${tone ? ` data-tone="${tone}"` : ''}>${escapeHtml(badge)}</span>
        <button class="content-card-heart" aria-label="Save">${ICON_HEART}</button>
      </div>
      <div class="content-card-play">${ICON_PLAY}</div>
      <div class="content-card-take"><em>${escapeHtml(take)}</em></div>
      <div class="content-card-meta">${ICON_CLOCK}<span>${when}</span></div>
    </article>
  `;
}

function shortenTake(reply) {
  if (!reply) return 'tap to see the full teardown.';
  const first = reply.split(/(?<=[.!?])\s+/)[0] || reply;
  const clipped = first.length > 96 ? first.slice(0, 93) + '…' : first;
  return clipped.charAt(0).toLowerCase() + clipped.slice(1);
}

function paletteFor(seed) {
  const palettes = [
    'linear-gradient(160deg, #2d2419 0%, #6b4a2b 55%, #b48a55 100%)', // amber
    'linear-gradient(160deg, #1a2b26 0%, #2e5548 55%, #5c8f7e 100%)', // forest
    'linear-gradient(160deg, #241a26 0%, #4e2f56 55%, #825982 100%)', // plum
    'linear-gradient(160deg, #1a222d 0%, #2f4562 55%, #5f7ba0 100%)', // slate
    'linear-gradient(160deg, #2d2820 0%, #5c4f36 55%, #98835d 100%)', // olive
  ];
  let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return palettes[Math.abs(h) % palettes.length];
}

function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const d = Math.max(0, Math.round((now - then) / 86400000));
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.round(d / 7)}w ago`;
  return `${Math.round(d / 30)}mo ago`;
}

function hydrateProfile(d) {
  const u = d.user || {};
  const sig = d.signature || {};
  setAll('[data-profile-name]', u.first_name || '—');
  setAll('[data-profile-handle]', u.handle ? `@${u.handle}` : '—');
  setAll('[data-profile-niche]', u.niche || 'app-ugc');
  setAll('[data-profile-count]', String(sig.video_count || 0));

  fillChips('[data-sig-hooks]', sig.dominant_hook_types, 'nothing yet — send a video');
  fillChips('[data-sig-formats]', sig.dominant_formats, 'nothing yet');
  fillChips('[data-sig-subjects]', sig.common_subjects, 'nothing yet');

  const perfEl = view.querySelector('[data-sig-perf]');
  if (perfEl) {
    const perf = sig.top_performers || [];
    if (!perf.length) {
      perfEl.innerHTML = `<div class="sig-perf-item"><span class="sig-chip empty">nothing yet</span></div>`;
    } else {
      perfEl.innerHTML = perf.map((p) => `
        <div class="sig-perf-item">
          <strong>${escapeHtml(p.hook_type || '—')}</strong>
          <span class="side">${escapeHtml(p.format || '—')}</span>
        </div>
      `).join('');
    }
  }
}

function fillChips(sel, arr, empty) {
  const el = view.querySelector(sel);
  if (!el) return;
  if (!Array.isArray(arr) || !arr.length) {
    el.innerHTML = `<span class="sig-chip empty">${escapeHtml(empty)}</span>`;
    return;
  }
  el.innerHTML = arr.map((x) => `<span class="sig-chip">${escapeHtml(x)}</span>`).join('');
}

function setAll(sel, val) {
  document.querySelectorAll(sel).forEach((el) => (el.textContent = val));
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// -------- demo note --------
function showDemoNoteIfNeeded() {
  const existing = document.querySelector('.demo-note');
  if (existing) existing.remove();
  const d = state.data;
  if (d?.demo) {
    const note = document.createElement('div');
    note.className = 'demo-note';
    note.textContent = d.notFound ? `demo · handle "${d.notFound}" not found` : 'demo · add ?u=<handle> for real data';
    document.body.appendChild(note);
  }
}

// -------- interactions --------
window.setPromptText = function (chipEl) {
  const input = document.querySelector('.pill-input input');
  if (input) { input.value = chipEl.textContent.trim(); input.focus(); }
};

window.handlePrompt = function (formEl) {
  const val = formEl.querySelector('input').value.trim();
  if (!val) return;
  formEl.querySelector('input').value = '';
  openSheet('coming-soon');
};

const sheetBody = document.getElementById('sheet');
const sheetBackdrop = document.getElementById('sheet-backdrop');

window.openSheet = function (kind) {
  if (!sheetBody) return;
  let html = '';
  if (kind === 'coming-soon') {
    html = `
      <div class="sheet-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/></svg></div>
      <h2 class="sheet-title">In-app <em>chat</em> is coming.</h2>
      <p class="sheet-body">For now, Precense lives in Telegram. Open the bot to send a video and the reply will show up in your feed.</p>
      <a class="btn btn-primary btn-accent btn-lg sheet-cta" href="https://t.me/getprecense_bot" target="_blank" rel="noopener">Open @getprecense_bot</a>
      <span class="sheet-not-now" onclick="closeSheet()">Not now</span>
    `;
  } else if (kind === 'delete') {
    html = `
      <div class="sheet-icon" style="background:color-mix(in oklab,var(--danger) 12%,transparent);color:var(--danger)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></div>
      <h2 class="sheet-title">Delete <em>account</em>?</h2>
      <p class="sheet-body">This wipes your signature, every teardown, and unlinks the bot. Not reversible.</p>
      <button class="btn btn-primary btn-accent btn-lg sheet-cta" onclick="closeSheet()">Keep my account</button>
      <span class="sheet-not-now" onclick="closeSheet()">Actually delete</span>
    `;
  }
  sheetBody.innerHTML = html;
  sheetBody.setAttribute('data-open', 'true');
  sheetBody.setAttribute('aria-hidden', 'false');
  sheetBackdrop.setAttribute('data-open', 'true');
};

window.closeSheet = function () {
  if (!sheetBody) return;
  sheetBody.setAttribute('data-open', 'false');
  sheetBody.setAttribute('aria-hidden', 'true');
  sheetBackdrop.setAttribute('data-open', 'false');
};

// -------- bootstrap --------
window.addEventListener('hashchange', render);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

(async function boot() {
  await loadData();
  render();
})();
