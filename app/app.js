// Precense app SPA — hash-routed. Requires an authenticated session.

// MVP-1 comms hub: strip nav back to Chats / Friends / Profile / Settings (+ Admin).
// Old marketplace views (campaigns/roster/invites/analytics) remain in HTML/JS but are unreachable.
const BASE_VIEWS = ['chats', 'friends', 'profile', 'settings'];
const ADMIN_VIEWS = ['chats', 'friends', 'admin', 'profile', 'settings'];

const ICONS = {
  chats: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  friends: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7"/><circle cx="17" cy="7" r="3"/><path d="M22 20c0-3-2-5-5-5"/></svg>`,
  profile: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>`,
  admin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l9 4v6c0 5-3.5 9-9 10-5.5-1-9-5-9-10V6l9-4z"/></svg>`,
};

const LABELS = {
  chats: 'Chats', friends: 'Friends', profile: 'Profile', settings: 'Settings', admin: 'Admin',
};

function activeRole() {
  return state.data?.user?.role === 'admin' ? 'admin' : 'regular';
}
function activeViews() {
  return activeRole() === 'admin' ? ADMIN_VIEWS : BASE_VIEWS;
}
function mobileViews() {
  return activeRole() === 'admin'
    ? ['chats', 'friends', 'admin', 'profile']
    : ['chats', 'friends', 'profile'];
}
const view = document.getElementById('view');
const sideNav = document.getElementById('side-nav');
const mobileNav = document.getElementById('mobile-nav');

const ICON_PLAY = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const ICON_HEART = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
const ICON_CLOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

let state = { data: null, error: null, session: null };

// -------- boot: require auth --------
async function boot() {
  try {
    state.session = await window.precenseAuth.getSession();
  } catch (e) {
    console.warn('auth check', e);
  }
  if (!state.session) {
    window.location.href = '/';
    return;
  }

  // Auto-redeem any pending invite stashed by /join/<token>.
  let stashedToken = null;
  try { stashedToken = sessionStorage.getItem('precense_invite_token'); } catch {}
  if (stashedToken) {
    try {
      await window.precenseAuth.redeemInvite(stashedToken);
    } catch (e) {
      console.warn('redeemInvite failed', e);
    }
    try { sessionStorage.removeItem('precense_invite_token'); } catch {}
  }

  // MVP-1: ensure a users row exists for this auth session (no role picker, no link sheet).
  try { await window.precenseAuth.ensureCommsUser(); } catch (e) { console.warn('ensureCommsUser', e); }

  await loadData();
  render();
}

async function loadData() {
  try {
    state.data = await window.precenseAuth.fetchUserData();
  } catch (e) {
    state.error = e.message;
    state.data = null;
  }
}

// -------- routing --------
function currentView() {
  const raw = (window.location.hash || '#chats').replace(/^#/, '').split('/')[0];
  return activeViews().includes(raw) ? raw : 'chats';
}

function tplIdFor(view) {
  return `tpl-${view}`;
}

function renderSideNav() {
  const items = activeViews();
  const mob = mobileViews();
  if (sideNav) {
    sideNav.innerHTML = items.map((v) => `
      <a href="#${v}" data-view="${v}">${ICONS[v] || ''}<span>${LABELS[v] || v}</span></a>
    `).join('');
  }
  if (mobileNav) {
    mobileNav.innerHTML = mob.map((v) => `
      <a href="#${v}" data-view="${v}" aria-label="${LABELS[v] || v}">${ICONS[v] || ''}<span>${LABELS[v] || v}</span></a>
    `).join('');
  }
}

function render() {
  renderSideNav();
  const v = currentView();
  const tpl = document.getElementById(tplIdFor(v));
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
  const initial = (u.first_name || u.handle || u.email || 'P').charAt(0).toUpperCase();
  document.querySelectorAll('[data-profile-initial]').forEach((el) => (el.textContent = initial));
  const nameEl = document.querySelector('[data-side-name]');
  const handleEl = document.querySelector('[data-side-handle]');
  if (nameEl) nameEl.textContent = u.first_name || u.handle || u.email || 'Guest';
  if (handleEl) handleEl.textContent = u.handle ? `@${u.handle}` : (u.email ? u.email : '@—');
}

function hydrate(v) {
  const d = state.data;
  if (v === 'chats') return hydrateChats();
  if (v === 'friends') return hydrateFriends();
  if (v === 'profile') return hydrateProfileEditor(d);
  if (v === 'admin') return hydrateAdminPanel();
}

// -------- team lead + admin data --------
let teamData = { loaded: false, teams: [], members: [], invites: [] };
let adminData = { loaded: false, teams: [], brand_orgs: [], recent_invites: [] };

async function ensureTeamData(force = false) {
  if (teamData.loaded && !force) return teamData;
  try {
    const res = await fetch('/api/team-data', {
      headers: { Authorization: `Bearer ${state.session.access_token}` },
    });
    if (!res.ok) throw new Error(`team-data ${res.status}`);
    teamData = { loaded: true, ...(await res.json()) };
  } catch (e) {
    console.warn('team data', e);
    teamData = { loaded: true, teams: [], members: [], invites: [], error: e.message };
  }
  return teamData;
}

async function ensureAdminData(force = false) {
  if (adminData.loaded && !force) return adminData;
  try {
    const res = await fetch('/api/admin-data', {
      headers: { Authorization: `Bearer ${state.session.access_token}` },
    });
    if (!res.ok) throw new Error(`admin-data ${res.status}`);
    adminData = { loaded: true, ...(await res.json()) };
  } catch (e) {
    console.warn('admin data', e);
    adminData = { loaded: true, teams: [], brand_orgs: [], recent_invites: [], error: e.message };
  }
  return adminData;
}

async function hydrateTeamLead(d, v) {
  const td = await ensureTeamData();
  const team = td.teams?.[0];
  setAll('[data-team-name]', team?.name || 'your team');
  setAll('[data-team-count]', String((td.members || []).length));
  setAll('[data-team-invites-open]', String((td.invites || []).filter((i) => !i.used_at).length));

  if (v === 'home' || v === 'roster') {
    const el = view.querySelector('#team-roster');
    if (el) el.innerHTML = renderRoster(td.members || [], team?.id);
  }
  if (v === 'invites') {
    const el = view.querySelector('#invites-list');
    if (el) el.innerHTML = renderInvites(td.invites || []);
    const teamIdInput = view.querySelector('[data-invite-team-id]');
    if (teamIdInput && team?.id) teamIdInput.value = team.id;
  }
}

async function hydrateAdmin() {
  const ad = await ensureAdminData();
  setAll('[data-admin-teams-count]', String((ad.teams || []).length));
  setAll('[data-admin-brands-count]', String((ad.brand_orgs || []).length));
  const el = view.querySelector('#admin-recent-invites');
  if (el) el.innerHTML = renderInvites(ad.recent_invites || []);
  const teamsEl = view.querySelector('#admin-teams');
  if (teamsEl) {
    teamsEl.innerHTML = (ad.teams || []).map((t) => `
      <article class="campaign-card">
        <div class="campaign-card-head"><h3>${escapeHtml(t.name)}</h3><span class="muted">${escapeHtml(t.owner_email || '')}</span></div>
        <div class="muted">default split ${t.default_team_take_pct}% · ${t.member_count || 0} creators</div>
      </article>
    `).join('') || '<p class="muted">No teams yet.</p>';
  }
}

function renderRoster(members, teamId) {
  if (!members.length) return `<p class="muted">No creators yet. Send an invite to onboard your first.</p>`;
  return members.map((m) => `
    <article class="campaign-card">
      <div class="campaign-card-head">
        <h3>${escapeHtml(m.display_name || 'unnamed')}</h3>
        <span class="status-pill" data-status="${escapeAttr(m.status)}">${escapeHtml(m.status)}</span>
      </div>
      <div class="split-editor">
        <label>Team take
          <input type="number" min="0" max="50" step="0.5" value="${m.team_take_pct}" data-member-id="${m.creator_profile_id}" onchange="updateSplit(${teamId}, ${m.creator_profile_id}, this.value, this)" />
          <span>%</span>
        </label>
        <span class="muted">creator keeps ${(100 - Number(m.team_take_pct) - Number(m.platform_take_pct || 10)).toFixed(1)}%</span>
      </div>
    </article>
  `).join('');
}

function renderInvites(invites) {
  if (!invites.length) return `<p class="muted">No invites yet.</p>`;
  return invites.map((i) => {
    const url = `${window.location.origin}/join/${i.token}`;
    const status = i.used_at ? 'used' : (i.expires_at && new Date(i.expires_at) < new Date()) ? 'expired' : 'open';
    return `
      <article class="campaign-card">
        <div class="campaign-card-head">
          <h3>${escapeHtml(i.email_hint || i.role)}</h3>
          <span class="status-pill" data-status="${status}">${status}</span>
        </div>
        <div class="muted">${escapeHtml(i.role)}${i.team_take_pct != null ? ` · ${i.team_take_pct}%` : ''}</div>
        <div class="invite-link">
          <input type="text" readonly value="${escapeAttr(url)}" onclick="this.select()" />
          <button class="btn btn-primary" onclick="copyText('${escapeAttr(url)}', this)">Copy</button>
        </div>
      </article>
    `;
  }).join('');
}

window.copyText = function (text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const old = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = old), 1200);
  });
};

window.updateSplit = async function (teamId, creatorProfileId, newPct, inputEl) {
  const pct = parseFloat(newPct);
  if (isNaN(pct) || pct < 0 || pct > 50) { inputEl.setCustomValidity('0..50 only'); inputEl.reportValidity(); return; }
  inputEl.setCustomValidity('');
  try {
    await window.precenseAuth.updateTeamMemberSplit(teamId, creatorProfileId, pct);
    await ensureTeamData(true);
    render();
  } catch (e) { alert(e.message); }
};

window.openGenerateInviteSheet = function () {
  const tpl = document.getElementById('tpl-generate-invite');
  if (!tpl || !sheetBody) return;
  sheetBody.innerHTML = '';
  sheetBody.appendChild(tpl.content.cloneNode(true));
  const teamIdInput = sheetBody.querySelector('[data-invite-team-id]');
  if (teamIdInput && teamData.teams?.[0]?.id) teamIdInput.value = teamData.teams[0].id;
  const defPctInput = sheetBody.querySelector('[data-invite-default-pct]');
  if (defPctInput && teamData.teams?.[0]?.default_team_take_pct != null) {
    defPctInput.value = teamData.teams[0].default_team_take_pct;
  }
  sheetBody.setAttribute('data-open', 'true');
  sheetBackdrop.setAttribute('data-open', 'true');
};

window.submitGenerateInvite = async function (formEl) {
  const errEl = document.getElementById('invite-err');
  const role = formEl.querySelector('select[name="role"]')?.value || 'creator';
  const teamId = Number(formEl.querySelector('input[name="team_id"]')?.value) || null;
  const pct = formEl.querySelector('input[name="team_take_pct"]')?.value;
  const emailHint = formEl.querySelector('input[name="email_hint"]')?.value?.trim() || null;
  try {
    await window.precenseAuth.generateInvite({
      role,
      teamId: role === 'creator' ? teamId : null,
      teamTakePct: pct ? Number(pct) : null,
      emailHint,
    });
    closeSheet();
    if (activeRole() === 'admin') await ensureAdminData(true);
    else await ensureTeamData(true);
    render();
  } catch (e) {
    if (errEl) { errEl.textContent = e.message; errEl.hidden = false; }
  }
};

window.openCreateTeamSheet = function () {
  const tpl = document.getElementById('tpl-create-team');
  if (!tpl || !sheetBody) return;
  sheetBody.innerHTML = '';
  sheetBody.appendChild(tpl.content.cloneNode(true));
  sheetBody.setAttribute('data-open', 'true');
  sheetBackdrop.setAttribute('data-open', 'true');
};

window.submitCreateTeam = async function (formEl) {
  const errEl = document.getElementById('team-err');
  const name = formEl.querySelector('input[name="name"]').value.trim();
  const ownerEmail = formEl.querySelector('input[name="owner_email"]').value.trim();
  const defPct = Number(formEl.querySelector('input[name="default_team_take_pct"]').value || 20);
  try {
    await window.precenseAuth.createTeam(name, ownerEmail, defPct);
    closeSheet();
    await ensureAdminData(true);
    render();
  } catch (e) {
    if (errEl) { errEl.textContent = e.message; errEl.hidden = false; }
  }
};

// -------- brand hydration --------
let brandData = { loaded: false, campaigns: [], roster: [], org: null };

async function ensureBrandData(force = false) {
  if (brandData.loaded && !force) return brandData;
  try {
    const res = await window.precenseAuth.fetchBrandData();
    brandData = { loaded: true, ...res };
  } catch (e) {
    console.warn('brand data', e);
    brandData = { loaded: true, campaigns: [], roster: [], org: null, error: e.message };
  }
  return brandData;
}

async function hydrateBrandHome(d) {
  const nameEl = view.querySelector('[data-greeting-name]');
  const firstName = (d.user?.first_name || d.user?.handle || d.user?.email?.split('@')[0] || 'friend').split(' ')[0];
  if (nameEl) nameEl.textContent = capitalize(firstName);

  const bd = await ensureBrandData();
  const orgNameEl = view.querySelector('[data-brand-name]');
  if (orgNameEl) orgNameEl.textContent = bd.org?.name || 'your brand';

  setAll('[data-brand-active-campaigns]', String((bd.campaigns || []).filter((c) => c.status === 'active').length));
  setAll('[data-brand-roster-size]', String((bd.roster || []).length));
  setAll('[data-brand-pending]', String((bd.pending_deliverables || 0)));

  const previewEl = view.querySelector('#brand-campaigns-preview');
  if (previewEl) previewEl.innerHTML = renderCampaignCards((bd.campaigns || []).slice(0, 4));
}

async function hydrateCampaigns() {
  const bd = await ensureBrandData();
  const el = view.querySelector('#campaigns-list');
  if (!el) return;
  const list = bd.campaigns || [];
  if (!list.length) {
    el.innerHTML = `<div class="empty-block"><p>No campaigns yet.</p><button class="btn btn-primary" onclick="openNewCampaignSheet()">+ Create your first</button></div>`;
    return;
  }
  el.innerHTML = renderCampaignCards(list);
}

function renderCampaignCards(list) {
  if (!list.length) return `<p class="muted">No campaigns yet.</p>`;
  return list.map((c) => `
    <article class="campaign-card">
      <div class="campaign-card-head">
        <h3>${escapeHtml(c.name)}</h3>
        <span class="status-pill" data-status="${escapeAttr(c.status)}">${escapeHtml(c.status)}</span>
      </div>
      ${c.brief ? `<p class="campaign-card-brief">${escapeHtml(c.brief)}</p>` : ''}
      <div class="campaign-card-meta">
        ${Array.isArray(c.target_hooks) && c.target_hooks.length
          ? c.target_hooks.map((h) => `<span class="sig-chip">${escapeHtml(h)}</span>`).join('')
          : '<span class="muted">no target hooks set</span>'}
      </div>
    </article>
  `).join('');
}

window.openNewCampaignSheet = function () {
  if (!sheetBody) return;
  const tpl = document.getElementById('tpl-new-campaign');
  if (!tpl) return;
  sheetBody.innerHTML = '';
  sheetBody.appendChild(tpl.content.cloneNode(true));
  sheetBody.setAttribute('data-open', 'true');
  sheetBackdrop.setAttribute('data-open', 'true');
};

window.submitNewCampaign = async function (formEl) {
  const errEl = document.getElementById('campaign-err');
  const name = formEl.querySelector('input[name="name"]').value.trim();
  const brief = formEl.querySelector('input[name="brief"]').value.trim();
  const hooksRaw = formEl.querySelector('input[name="target_hooks"]').value.trim();
  const target_hooks = hooksRaw ? hooksRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (!name) return;
  try {
    await window.precenseAuth.createCampaign({ name, brief, target_hooks });
    closeSheet();
    await ensureBrandData(true);
    render();
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || String(e); errEl.hidden = false; }
  }
};

function hydrateHome(d) {
  const nameEl = view.querySelector('[data-greeting-name]');
  const firstName = (d.user?.first_name || d.user?.handle || d.user?.email?.split('@')[0] || 'friend').split(' ')[0];
  if (nameEl) nameEl.textContent = capitalize(firstName);

  const todayEl = view.querySelector('[data-today]');
  if (todayEl) todayEl.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long' });

  const sig = d.signature || {};
  fillChips('[data-rail-hooks]', sig.dominant_hook_types, 'nothing yet');
  fillChips('[data-rail-formats]', sig.dominant_formats, 'nothing yet');
  fillChips('[data-rail-subjects]', sig.common_subjects, 'nothing yet');
  const railCount = view.querySelector('[data-rail-count]');
  if (railCount) railCount.textContent = String(sig.video_count || 0);

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
    'linear-gradient(160deg, #2d2419 0%, #6b4a2b 55%, #b48a55 100%)',
    'linear-gradient(160deg, #1a2b26 0%, #2e5548 55%, #5c8f7e 100%)',
    'linear-gradient(160deg, #241a26 0%, #4e2f56 55%, #825982 100%)',
    'linear-gradient(160deg, #1a222d 0%, #2f4562 55%, #5f7ba0 100%)',
    'linear-gradient(160deg, #2d2820 0%, #5c4f36 55%, #98835d 100%)',
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

function setAll(sel, val) { document.querySelectorAll(sel).forEach((el) => (el.textContent = val)); }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s); }

// -------- demo note --------
function showDemoNoteIfNeeded() {
  document.querySelectorAll('.demo-note').forEach((n) => n.remove());
  if (state.data?.demo) {
    const note = document.createElement('div');
    note.className = 'demo-note';
    note.textContent = 'demo · no data yet';
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

function openLinkSheet() {
  if (!sheetBody) return;
  const tpl = document.getElementById('tpl-link-sheet');
  if (!tpl) return;
  sheetBody.innerHTML = '';
  sheetBody.appendChild(tpl.content.cloneNode(true));
  sheetBody.setAttribute('data-open', 'true');
  sheetBackdrop.setAttribute('data-open', 'true');
}

window.linkHandleSubmit = async function (formEl) {
  const input = formEl.querySelector('input');
  const errEl = document.getElementById('link-err');
  const val = input.value.trim();
  if (!val) return;
  errEl.hidden = true;
  try {
    await window.precenseAuth.linkTelegramHandle(val);
    closeSheet();
    await loadData();
    render();
  } catch (e) {
    // If no telegram row found, offer to create a placeholder auth-only row
    const msg = String(e.message || e);
    if (/no telegram user found/i.test(msg)) {
      try {
        await window.precenseAuth.ensureAuthUserRow();
        closeSheet();
        await loadData();
        render();
        return;
      } catch (e2) {
        errEl.textContent = e2.message || String(e2);
        errEl.hidden = false;
        return;
      }
    }
    errEl.textContent = msg;
    errEl.hidden = false;
  }
};

function openRoleSheet() {
  if (!sheetBody) return;
  const tpl = document.getElementById('tpl-onboard-role');
  if (!tpl) return;
  sheetBody.innerHTML = '';
  sheetBody.appendChild(tpl.content.cloneNode(true));
  sheetBody.setAttribute('data-open', 'true');
  sheetBackdrop.setAttribute('data-open', 'true');
}

window.selectRole = async function (role) {
  const errEl = document.getElementById('role-err');
  if (errEl) errEl.hidden = true;
  if (role === 'creator') {
    await submitRole('creator');
    return;
  }
  // brand → reveal the brand-name field
  const form = document.getElementById('brand-name-form');
  if (form) {
    form.hidden = false;
    form.querySelector('input[name="brand_name"]')?.focus();
  }
  sheetBody.querySelectorAll('.role-card').forEach((el) => {
    el.setAttribute('aria-selected', el.dataset.role === 'brand' ? 'true' : 'false');
  });
};

window.submitRole = async function (role, formEl) {
  const errEl = document.getElementById('role-err');
  const brandName = formEl ? formEl.querySelector('input[name="brand_name"]').value.trim() : null;
  try {
    await window.precenseAuth.setUserRole(role, brandName);
    closeSheet();
    await loadData();
    render();
  } catch (e) {
    if (errEl) {
      errEl.textContent = e.message || String(e);
      errEl.hidden = false;
    }
  }
};

window.signOut = async function () { await window.precenseAuth.signOut(); };

// -------- bootstrap --------
window.addEventListener('hashchange', render);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

boot();

// ====================================================================
// MVP-1 COMMS HUB — chats, friends, profile editor, admin panel
// ====================================================================

let commsState = {
  conversations: [],
  activeConversationId: null,
  messages: [],
  members: [],
  friends: [],
  incoming: [],
  outgoing: [],
  search: [],
  admin: { users: [], reports: [] },
  channel: null,     // Realtime channel for the active conversation
  presence: new Map(),
};

async function supa() {
  return window.precenseAuth.getClient();
}

async function meUserId() {
  return state.data?.user?.id || null;
}

// -------- chats --------
async function loadConversations() {
  const c = await supa();
  const meId = await meUserId();
  const { data, error } = await c
    .from('conversations')
    .select('id, kind, title, avatar_url, last_message_at, created_at, conversation_members!inner(user_id, last_read_at)')
    .eq('conversation_members.user_id', meId)
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) { console.warn(error); return []; }
  return data || [];
}

async function loadOtherMembers(convId) {
  const c = await supa();
  const { data, error } = await c
    .from('conversation_members')
    .select('user_id, role, last_read_at, users!inner(id, display_name, handle, avatar_url, last_seen_at, role)')
    .eq('conversation_id', convId);
  if (error) { console.warn(error); return []; }
  return (data || []).map((m) => ({ ...m.users, member_role: m.role, last_read_at: m.last_read_at }));
}

async function loadMessages(convId, limit = 80) {
  const c = await supa();
  const { data, error } = await c
    .from('messages')
    .select('id, conversation_id, sender_user_id, body, kind, reply_to_id, created_at, edited_at, deleted_at, message_attachments(id, storage_path, mime_type, bytes)')
    .eq('conversation_id', convId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) { console.warn(error); return []; }
  return data || [];
}

async function hydrateChats() {
  commsState.conversations = await loadConversations();
  const listEl = view.querySelector('#chat-list');
  if (listEl) listEl.innerHTML = renderConvList(commsState.conversations);

  const currentId = commsState.activeConversationId || commsState.conversations[0]?.id;
  if (currentId) await openConversation(currentId);
}

function renderConvList(convs) {
  if (!convs.length) return `<div class="empty-block"><p class="muted">No chats yet.</p><button class="btn btn-primary" onclick="openNewChatSheet()">Start one</button></div>`;
  return convs.map((cv) => {
    const title = cv.title || (cv.kind === 'dm' ? 'Direct message' : 'Group');
    const meMember = cv.conversation_members?.find(m => m.user_id === state.data?.user?.id);
    const unread = cv.last_message_at && (!meMember?.last_read_at || new Date(cv.last_message_at) > new Date(meMember.last_read_at));
    const isActive = commsState.activeConversationId === cv.id;
    return `
      <button class="conv-item${isActive ? ' active' : ''}${unread ? ' unread' : ''}" onclick="openConversation(${cv.id})">
        <span class="conv-avatar">${escapeHtml((title[0] || '#').toUpperCase())}</span>
        <span class="conv-meta">
          <span class="conv-title">${escapeHtml(title)}</span>
          <span class="conv-sub">${cv.kind === 'announcement' ? 'Announcements' : cv.kind === 'group' ? 'Group' : 'DM'}</span>
        </span>
        ${unread ? '<span class="unread-dot"></span>' : ''}
      </button>
    `;
  }).join('');
}

window.openConversation = async function (id) {
  commsState.activeConversationId = id;
  const conv = commsState.conversations.find((c) => c.id === id);
  const [members, messages] = await Promise.all([loadOtherMembers(id), loadMessages(id)]);
  commsState.members = members;
  commsState.messages = messages;

  // Update sidebar highlight
  const listEl = view.querySelector('#chat-list');
  if (listEl) listEl.innerHTML = renderConvList(commsState.conversations);

  const paneEl = view.querySelector('#chat-pane');
  if (paneEl) paneEl.innerHTML = renderChatPane(conv, members, messages);
  scrollThreadToBottom();
  subscribeToConversation(id);
  markConversationRead(id);
};

function renderChatPane(conv, members, messages) {
  const title = conv?.title || otherMemberName(members) || 'Chat';
  const canPost = conv?.kind !== 'announcement' || ['admin','team_lead'].includes(state.data?.user?.role);
  return `
    <div class="chat-head">
      <div class="chat-head-title">${escapeHtml(title)}</div>
      <div class="chat-head-sub">${members.length} member${members.length === 1 ? '' : 's'}</div>
    </div>
    <div class="thread" id="thread">
      ${messages.map((m) => renderMessage(m)).join('')}
      <div id="typing-row" class="typing-row" hidden></div>
    </div>
    <form class="composer" onsubmit="event.preventDefault(); sendChatMessage(this);" ${canPost ? '' : 'hidden'}>
      <label class="attach-btn" title="Attach">
        <input type="file" accept="image/*,video/*" hidden onchange="attachToNextMessage(this)" />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.19 9.19a1 1 0 0 1-1.41-1.41l8.48-8.48"/></svg>
      </label>
      <input type="text" name="body" placeholder="Message…" autocomplete="off" oninput="onTyping()" required />
      <button type="submit" class="btn btn-primary">Send</button>
    </form>
    ${canPost ? '' : `<div class="composer-locked">Only admins and team leads can post to announcements.</div>`}
  `;
}

function otherMemberName(members) {
  const me = state.data?.user?.id;
  const other = members.find((m) => m.id !== me);
  return other?.display_name || other?.handle || null;
}

function renderMessage(m) {
  const meId = state.data?.user?.id;
  const mine = m.sender_user_id === meId;
  const sender = commsState.members.find((x) => x.id === m.sender_user_id);
  const name = sender?.display_name || sender?.handle || 'unknown';
  const when = new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const attachments = (m.message_attachments || []).map((a) => attachmentHtml(a)).join('');
  return `
    <div class="msg${mine ? ' mine' : ''}" data-id="${m.id}">
      ${mine ? '' : `<div class="msg-sender">${escapeHtml(name)}</div>`}
      ${m.body ? `<div class="msg-body">${escapeHtml(m.body)}</div>` : ''}
      ${attachments}
      <div class="msg-time">${when}</div>
    </div>
  `;
}

function attachmentHtml(a) {
  const url = attachmentUrl(a.storage_path);
  if ((a.mime_type || '').startsWith('image/')) {
    return `<a class="msg-attach" href="${url}" target="_blank"><img src="${url}" alt="" loading="lazy"/></a>`;
  }
  if ((a.mime_type || '').startsWith('video/')) {
    return `<video class="msg-attach" src="${url}" controls preload="metadata"></video>`;
  }
  return `<a class="msg-attach msg-attach-file" href="${url}" target="_blank">📎 Download attachment</a>`;
}

function attachmentUrl(path) {
  const base = state.data?.supabase_url || window.__SUPABASE_URL || '';
  return `${base}/storage/v1/object/public/attachments/${path}`;
}

async function subscribeToConversation(convId) {
  if (commsState.channel) {
    try { await commsState.channel.unsubscribe(); } catch {}
    commsState.channel = null;
  }
  const c = await supa();
  const meId = await meUserId();
  const ch = c.channel(`conv:${convId}`)
    .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
        async (payload) => {
          const [enriched] = await loadMessages(convId, 1).then(() => loadMessages(convId));
          commsState.messages = await loadMessages(convId);
          const threadEl = view.querySelector('#thread');
          if (threadEl) {
            threadEl.innerHTML = commsState.messages.map((m) => renderMessage(m)).join('') + '<div id="typing-row" class="typing-row" hidden></div>';
            scrollThreadToBottom();
          }
          markConversationRead(convId);
        })
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload?.user_id === meId) return;
      showTypingIndicator(payload?.display_name);
    })
    .on('presence', { event: 'sync' }, () => {
      const s = ch.presenceState();
      commsState.presence = new Map(Object.entries(s));
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ user_id: meId, at: Date.now() });
      }
    });
  commsState.channel = ch;
}

let typingTimer = null;
window.onTyping = async function () {
  if (!commsState.channel) return;
  const now = Date.now();
  if (typingTimer && now - typingTimer < 2000) return;
  typingTimer = now;
  commsState.channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: state.data?.user?.id, display_name: state.data?.user?.display_name || state.data?.user?.handle } });
};

let typingClearTimer = null;
function showTypingIndicator(name) {
  const el = view.querySelector('#typing-row');
  if (!el) return;
  el.hidden = false;
  el.textContent = `${name || 'Someone'} is typing…`;
  clearTimeout(typingClearTimer);
  typingClearTimer = setTimeout(() => { el.hidden = true; }, 2500);
}

function scrollThreadToBottom() {
  const el = view.querySelector('#thread');
  if (el) el.scrollTop = el.scrollHeight;
}

async function markConversationRead(convId) {
  try {
    const c = await supa();
    await c.rpc('mark_read', { p_conversation_id: convId });
  } catch (e) { console.warn(e); }
}

window.sendChatMessage = async function (formEl) {
  const input = formEl.querySelector('input[name="body"]');
  const body = input.value.trim();
  if (!body || !commsState.activeConversationId) return;
  input.value = '';
  try {
    const c = await supa();
    const { error } = await c.rpc('send_message', {
      p_conversation_id: commsState.activeConversationId,
      p_body: body,
      p_kind: 'text',
      p_reply_to: null,
    });
    if (error) throw error;
  } catch (e) { alert(e.message); }
};

// Attachment upload — pending message state
let pendingAttachment = null;
window.attachToNextMessage = async function (fileInput) {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) return alert('20MB max');
  try {
    const c = await supa();
    const meId = await meUserId();
    const path = `${meId}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`;
    const { error: upErr } = await c.storage.from('attachments').upload(path, file, { contentType: file.type });
    if (upErr) throw upErr;
    // Send an empty-body message with attachment metadata (falls back: send " " so send_message accepts).
    const { data: msgId, error: msgErr } = await c.rpc('send_message', {
      p_conversation_id: commsState.activeConversationId,
      p_body: '📎',
      p_kind: 'text',
      p_reply_to: null,
    });
    if (msgErr) throw msgErr;
    await c.rpc('attach_to_message', { p_message_id: msgId, p_storage_path: path, p_mime: file.type, p_bytes: file.size });
    fileInput.value = '';
  } catch (e) { alert(e.message); }
};

// -------- friends --------
async function loadFriends() {
  const c = await supa();
  const meId = await meUserId();
  const [{ data: rows }, { data: incoming }, { data: outgoing }] = await Promise.all([
    c.from('friendships').select('*, requester:users!friendships_requester_user_id_fkey(id, display_name, handle, avatar_url), addressee:users!friendships_addressee_user_id_fkey(id, display_name, handle, avatar_url)').eq('status', 'accepted').or(`requester_user_id.eq.${meId},addressee_user_id.eq.${meId}`),
    c.from('friendships').select('*, requester:users!friendships_requester_user_id_fkey(id, display_name, handle, avatar_url)').eq('addressee_user_id', meId).eq('status', 'pending'),
    c.from('friendships').select('*, addressee:users!friendships_addressee_user_id_fkey(id, display_name, handle, avatar_url)').eq('requester_user_id', meId).eq('status', 'pending'),
  ]);
  const friends = (rows || []).map((r) => (r.requester_user_id === meId ? r.addressee : r.requester));
  return { friends, incoming: incoming || [], outgoing: outgoing || [] };
}

async function hydrateFriends() {
  const d = await loadFriends();
  commsState.friends = d.friends; commsState.incoming = d.incoming; commsState.outgoing = d.outgoing;
  const el = view.querySelector('#friends-content');
  if (el) el.innerHTML = renderFriendsPanel();
}

function renderFriendsPanel() {
  return `
    <div class="section-head reveal in">
      <h1 class="h1-lg">Friends</h1>
    </div>
    <form class="pill-input" onsubmit="event.preventDefault(); doPeopleSearch(this);">
      <input type="text" name="q" placeholder="Find people by name, handle, or email…" />
      <button class="pill-input-send" type="submit">Search</button>
    </form>
    <div id="people-results" class="card-list reveal"></div>

    ${commsState.incoming.length ? `
      <h2 class="h2" style="margin-top:1.5rem;">Incoming requests</h2>
      <div class="card-list">${commsState.incoming.map((r) => `
        <article class="campaign-card">
          <div class="campaign-card-head">
            <h3>${escapeHtml(r.requester.display_name || r.requester.handle || 'user')}</h3>
            <div style="display:flex; gap:.5rem;">
              <button class="btn btn-primary" onclick="respondFriend(${r.requester.id}, true)">Accept</button>
              <button class="btn" onclick="respondFriend(${r.requester.id}, false)">Decline</button>
            </div>
          </div>
        </article>`).join('')}</div>
    ` : ''}

    <h2 class="h2" style="margin-top:1.5rem;">Your friends</h2>
    <div class="card-list">
      ${commsState.friends.length ? commsState.friends.map((f) => `
        <article class="campaign-card">
          <div class="campaign-card-head">
            <h3>${escapeHtml(f.display_name || f.handle || 'friend')}</h3>
            <div style="display:flex; gap:.5rem;">
              <button class="btn btn-primary" onclick="dmUser(${f.id})">Message</button>
              <button class="btn" onclick="blockUser(${f.id})">Block</button>
            </div>
          </div>
        </article>`).join('') : '<p class="muted">No friends yet — search for someone above.</p>'}
    </div>
  `;
}

window.doPeopleSearch = async function (formEl) {
  const q = formEl.querySelector('input[name="q"]').value.trim();
  const c = await supa();
  const { data, error } = await c.rpc('search_people', { p_query: q, p_limit: 20 });
  const el = view.querySelector('#people-results');
  if (error) { el.innerHTML = `<p class="muted">${error.message}</p>`; return; }
  if (!data?.length) { el.innerHTML = `<p class="muted">No matches.</p>`; return; }
  el.innerHTML = data.map((p) => `
    <article class="campaign-card">
      <div class="campaign-card-head">
        <h3>${escapeHtml(p.display_name || p.handle || 'user')}</h3>
        <div style="display:flex; gap:.5rem;">
          <button class="btn btn-primary" onclick="requestFriend(${p.id}, this)">Add friend</button>
          <button class="btn" onclick="dmUser(${p.id})">Message</button>
        </div>
      </div>
    </article>`).join('');
};

window.requestFriend = async function (id, btn) {
  try {
    const c = await supa();
    const { error } = await c.rpc('send_friend_request', { p_addressee_user_id: id });
    if (error) throw error;
    if (btn) { btn.textContent = 'Requested'; btn.disabled = true; }
  } catch (e) { alert(e.message); }
};

window.respondFriend = async function (id, accept) {
  try {
    const c = await supa();
    const { error } = await c.rpc('respond_friend_request', { p_requester_user_id: id, p_accept: accept });
    if (error) throw error;
    await hydrateFriends();
  } catch (e) { alert(e.message); }
};

window.blockUser = async function (id) {
  if (!confirm('Block this user?')) return;
  try {
    const c = await supa();
    const { error } = await c.rpc('block_user', { p_user_id: id });
    if (error) throw error;
    await hydrateFriends();
  } catch (e) { alert(e.message); }
};

window.dmUser = async function (id) {
  try {
    const c = await supa();
    const { data, error } = await c.rpc('open_dm', { p_other_user_id: id });
    if (error) throw error;
    window.location.hash = '#chats';
    await hydrateChats();
    await openConversation(data);
  } catch (e) { alert(e.message); }
};

// -------- profile editor --------
function hydrateProfileEditor(d) {
  const u = d?.user || {};
  const container = view.querySelector('#profile-editor');
  if (!container) return;
  container.innerHTML = `
    <form class="card" style="padding:1.25rem; display:flex; flex-direction:column; gap:.9rem;" onsubmit="event.preventDefault(); saveProfile(this);">
      <div style="display:flex; align-items:center; gap:1rem;">
        <div class="avatar-large" id="avatar-preview" style="background-image:url('${escapeAttr(u.avatar_url || '')}')">${!u.avatar_url ? escapeHtml((u.display_name?.[0] || '?').toUpperCase()) : ''}</div>
        <label class="btn">
          Change avatar
          <input type="file" accept="image/*" hidden onchange="uploadAvatar(this)" />
        </label>
      </div>
      <label style="display:flex; flex-direction:column; gap:.3rem;">
        <span class="muted">Display name</span>
        <input class="pill-input" style="padding:.6rem .8rem;" type="text" name="display_name" value="${escapeAttr(u.display_name || '')}" required />
      </label>
      <label style="display:flex; flex-direction:column; gap:.3rem;">
        <span class="muted">Bio</span>
        <textarea class="pill-input" style="padding:.6rem .8rem; min-height:80px;" name="bio">${escapeHtml(u.bio || '')}</textarea>
      </label>
      <div><button class="btn btn-primary" type="submit">Save profile</button></div>
    </form>
  `;
}

window.uploadAvatar = async function (fileInput) {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return alert('5MB max');
  try {
    const c = await supa();
    const meId = await meUserId();
    const path = `${meId}/avatar_${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`;
    const { error: upErr } = await c.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: true });
    if (upErr) throw upErr;
    const { data: pub } = c.storage.from('avatars').getPublicUrl(path);
    const url = pub.publicUrl;
    const { error: rpcErr } = await c.rpc('update_profile', { p_display_name: null, p_bio: null, p_avatar_url: url });
    if (rpcErr) throw rpcErr;
    await loadData();
    render();
  } catch (e) { alert(e.message); }
};

window.saveProfile = async function (formEl) {
  const display_name = formEl.querySelector('input[name="display_name"]').value.trim();
  const bio = formEl.querySelector('textarea[name="bio"]').value;
  try {
    const c = await supa();
    const { error } = await c.rpc('update_profile', { p_display_name: display_name, p_bio: bio, p_avatar_url: null });
    if (error) throw error;
    await loadData();
    render();
  } catch (e) { alert(e.message); }
};

// -------- admin panel --------
async function hydrateAdminPanel() {
  const c = await supa();
  const [{ data: users }, { data: reports }] = await Promise.all([
    c.from('users').select('id, display_name, handle, email, role, last_seen_at').order('id', { ascending: false }).limit(200),
    c.from('reports').select('id, reason, detail, status, created_at, reporter_user_id, reported_user_id, message_id').eq('status', 'open').order('created_at', { ascending: false }),
  ]);
  commsState.admin = { users: users || [], reports: reports || [] };
  const el = view.querySelector('#admin-body');
  if (!el) return;
  el.innerHTML = `
    <h2 class="h2">Users</h2>
    <div class="card-list">
      ${commsState.admin.users.map((u) => `
        <article class="campaign-card">
          <div class="campaign-card-head">
            <h3>${escapeHtml(u.display_name || u.handle || u.email || 'user')}</h3>
            <span class="status-pill" data-status="${escapeAttr(u.role)}">${escapeHtml(u.role)}</span>
          </div>
          <div class="muted">${escapeHtml(u.email || '')}</div>
          <div style="display:flex; gap:.5rem; margin-top:.4rem;">
            ${u.role !== 'team_lead' ? `<button class="btn btn-primary" onclick="adminSetRole(${u.id}, 'team_lead')">Promote to team_lead</button>` : ''}
            ${u.role === 'team_lead' ? `<button class="btn" onclick="adminSetRole(${u.id}, 'regular')">Demote to regular</button>` : ''}
          </div>
        </article>
      `).join('')}
    </div>

    <h2 class="h2" style="margin-top:1.5rem;">Open reports</h2>
    <div class="card-list">
      ${commsState.admin.reports.length ? commsState.admin.reports.map((r) => `
        <article class="campaign-card">
          <div class="campaign-card-head">
            <h3>${escapeHtml(r.reason)}</h3>
            <span class="muted">${new Date(r.created_at).toLocaleString()}</span>
          </div>
          <div class="muted">${escapeHtml(r.detail || '')}</div>
        </article>`).join('') : '<p class="muted">No open reports.</p>'}
    </div>
  `;
}

window.adminSetRole = async function (id, role) {
  try {
    const c = await supa();
    const { error } = await c.rpc('admin_set_role', { p_user_id: id, p_role: role });
    if (error) throw error;
    await hydrateAdminPanel();
  } catch (e) { alert(e.message); }
};

// -------- new-chat sheet (group creation) --------
window.openNewChatSheet = function () {
  const tpl = document.getElementById('tpl-new-chat');
  if (!tpl || !sheetBody) return;
  sheetBody.innerHTML = '';
  sheetBody.appendChild(tpl.content.cloneNode(true));
  sheetBody.setAttribute('data-open', 'true');
  sheetBackdrop.setAttribute('data-open', 'true');
};

window.submitNewGroup = async function (formEl) {
  const title = formEl.querySelector('input[name="title"]').value.trim();
  const handlesRaw = formEl.querySelector('input[name="handles"]').value.trim();
  if (!title) return;
  try {
    const c = await supa();
    let userIds = [];
    if (handlesRaw) {
      const handles = handlesRaw.split(',').map(s => s.trim()).filter(Boolean);
      const results = await Promise.all(handles.map(h => c.rpc('search_people', { p_query: h, p_limit: 1 })));
      userIds = results.flatMap(r => (r.data || []).map(u => u.id));
    }
    const { data, error } = await c.rpc('create_group', { p_title: title, p_user_ids: userIds });
    if (error) throw error;
    closeSheet();
    await hydrateChats();
    await openConversation(data);
  } catch (e) { alert(e.message); }
};
