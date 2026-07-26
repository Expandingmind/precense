// Precense app SPA — hash-routed, single file.

const VIEWS = ['home', 'saved', 'profile', 'settings'];
const view = document.getElementById('view');
const nav = document.getElementById('nav');

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
  hydrate(v);
  wireReveals();
  showDemoNoteIfNeeded();
  window.scrollTo({ top: 0, behavior: 'instant' in ScrollBehavior ? 'instant' : 'auto' });
}

function updateNav(v) {
  nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.view === v) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function wireReveals() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
  document.querySelectorAll('.reveal:not(.in)').forEach((el) => io.observe(el));
}

// -------- hydration --------
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
  // wire hearts
  feedEl.querySelectorAll('.content-card-heart').forEach((btn) => {
    btn.addEventListener('click', () => {
      const active = btn.getAttribute('data-active') === 'true';
      btn.setAttribute('data-active', String(!active));
    });
  });
}

function contentCardHtml(sub, index) {
  const badge = sub.metrics?.badge || 'analyzed';
  const tone = sub.metrics?.tone || (index === 0 ? 'gold' : '');
  const take = shortenTake(sub.precense_reply);
  const hue = pickHue(sub.extracted_features?.hook_type || String(index));
  const bg = `linear-gradient(180deg, ${hue.top} 0%, ${hue.bottom} 100%)`;
  return `
    <article class="content-card">
      <div class="content-card-thumb" style="background-image: ${bg};"></div>
      <div class="content-card-top">
        <span class="content-card-badge"${tone ? ` data-tone="${tone}"` : ''}>${escapeHtml(badge)}</span>
        <button class="content-card-heart" aria-label="Save">♥</button>
      </div>
      <div class="content-card-take"><span class="card-play">▸</span><em>${escapeHtml(take)}</em></div>
    </article>
  `;
}

function shortenTake(reply) {
  if (!reply) return 'tap to see the full teardown.';
  // First sentence, lowercase-first, trimmed.
  const first = reply.split(/(?<=[.!?])\s+/)[0] || reply;
  const clipped = first.length > 110 ? first.slice(0, 107) + '…' : first;
  return clipped.charAt(0).toLowerCase() + clipped.slice(1);
}

function pickHue(seed) {
  const palettes = [
    { top: '#3f2a15', bottom: '#7a4a1e' },
    { top: '#1e3a30', bottom: '#3d6b52' },
    { top: '#2b1e2e', bottom: '#55365c' },
    { top: '#2d281a', bottom: '#5c5330' },
    { top: '#1b2a3a', bottom: '#3b5273' },
  ];
  let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return palettes[Math.abs(h) % palettes.length];
}

function hydrateProfile(d) {
  const u = d.user || {};
  const sig = d.signature || {};
  set('[data-profile-name]', u.first_name || '—');
  set('[data-profile-handle]', u.handle ? `@${u.handle}` : '—');
  set('[data-profile-niche]', u.niche || 'app-ugc');
  set('[data-profile-count]', String(sig.video_count || 0));

  const initial = (u.first_name || u.handle || 'P').charAt(0).toUpperCase();
  set('[data-profile-initial]', initial);

  fillChips('[data-sig-hooks]', sig.dominant_hook_types, 'nothing yet — send a video');
  fillChips('[data-sig-formats]', sig.dominant_formats, 'nothing yet');
  fillChips('[data-sig-subjects]', sig.common_subjects, 'nothing yet');

  const perfEl = view.querySelector('[data-sig-perf]');
  if (perfEl) {
    const perf = sig.top_performers || [];
    if (!perf.length) {
      perfEl.innerHTML = `<div class="sig-perf-item"><span class="sig-chip empty">nothing yet</span></div>`;
    } else {
      perfEl.innerHTML = perf
        .map((p) => `<div class="sig-perf-item"><strong>${escapeHtml(p.hook_type || '—')}</strong><span>${escapeHtml(p.format || '—')}</span></div>`)
        .join('');
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

function set(sel, val) {
  view.querySelectorAll(sel).forEach((el) => (el.textContent = val));
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// -------- demo note --------
function showDemoNoteIfNeeded() {
  const existing = document.querySelector('.demo-note');
  if (existing) existing.remove();
  const d = state.data;
  if (d?.demo) {
    const note = document.createElement('div');
    note.className = 'demo-note';
    note.textContent = d.notFound ? `demo mode · handle "${d.notFound}" not found` : 'demo mode · add ?u=<handle> to see your data';
    document.body.appendChild(note);
  }
}

// -------- interactions --------
window.setPromptText = function (chipEl) {
  const input = document.querySelector('.hero-pill input');
  if (input) { input.value = chipEl.textContent.trim(); input.focus(); }
};

window.handlePrompt = function (formEl) {
  const val = formEl.querySelector('input').value.trim();
  if (!val) return;
  // No inline analysis yet — direct the user to Telegram for now.
  formEl.querySelector('input').value = '';
  openSheet('coming-soon');
};

const sheetBody = document.getElementById('sheet');
const sheetBackdrop = document.getElementById('sheet-backdrop');
const sheetOriginal = sheetBody ? sheetBody.innerHTML : '';

window.openSheet = function (kind) {
  if (!sheetBody) return;
  if (kind === 'coming-soon') {
    sheetBody.innerHTML = `
      <div class="sheet-icon">✦</div>
      <h2 class="sheet-title">In-app <em>chat</em> is coming.</h2>
      <p class="sheet-body">For now, Precense lives in Telegram. Open the bot to send a video and the reply will show up in your feed.</p>
      <a class="btn btn-primary sheet-cta" href="https://t.me/getprecense_bot" target="_blank" rel="noopener">Open @getprecense_bot</a>
      <span class="sheet-not-now" onclick="closeSheet()">Not now</span>
    `;
  } else {
    sheetBody.innerHTML = sheetOriginal;
  }
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
