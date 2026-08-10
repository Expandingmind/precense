// Precense app SPA — hash-routed. Requires an authenticated session.

const CREATOR_VIEWS = ['home', 'saved', 'profile', 'settings'];
const BRAND_VIEWS = ['home', 'campaigns', 'roster', 'analytics', 'profile', 'settings'];
const TEAM_LEAD_VIEWS = ['home', 'roster', 'invites', 'profile', 'settings'];
const ADMIN_VIEWS = ['home', 'admin', 'profile', 'settings'];

const ICONS = {
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/></svg>`,
  saved: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
  profile: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>`,
  campaigns: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v4H4z"/><path d="M4 12h10v8H4z"/><path d="M18 12h2v8h-2z"/></svg>`,
  roster: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7"/><circle cx="17" cy="7" r="3"/><path d="M22 20c0-3-2-5-5-5"/></svg>`,
  analytics: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10"/><path d="M12 20V4"/><path d="M20 20v-7"/></svg>`,
};

const LABELS = {
  home: 'Home', saved: 'Saved', profile: 'Profile', settings: 'Settings',
  campaigns: 'Campaigns', roster: 'Creators', analytics: 'Analytics',
  invites: 'Invites', admin: 'Admin',
};

function activeRole() {
  const r = state.data?.user?.role;
  return ['brand', 'team_lead', 'admin'].includes(r) ? r : 'creator';
}
function activeViews() {
  const r = activeRole();
  if (r === 'brand') return BRAND_VIEWS;
  if (r === 'team_lead') return TEAM_LEAD_VIEWS;
  if (r === 'admin') return ADMIN_VIEWS;
  return CREATOR_VIEWS;
}
function mobileViews() {
  const r = activeRole();
  if (r === 'brand') return ['home', 'campaigns', 'roster', 'profile'];
  if (r === 'team_lead') return ['home', 'roster', 'invites', 'profile'];
  if (r === 'admin') return ['home', 'admin', 'profile'];
  return ['home', 'saved', 'profile'];
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

  await loadData();
  // Onboarding gate: role first, then channel link.
  if (state.data?.needs_link) {
    openLinkSheet();
  } else if (state.data?.user && !state.data.user.onboarded_at) {
    openRoleSheet();
  }
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
  const raw = (window.location.hash || '#home').replace(/^#/, '').split('/')[0];
  return activeViews().includes(raw) ? raw : 'home';
}

function tplIdFor(view) {
  const r = activeRole();
  if (view === 'home' && r === 'brand') return 'tpl-brand-home';
  if (view === 'home' && r === 'team_lead') return 'tpl-team-home';
  if (view === 'home' && r === 'admin') return 'tpl-admin-home';
  if (view === 'roster' && r === 'team_lead') return 'tpl-team-roster';
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
  if (!d || d.needs_link) {
    // Render empty-state hydration
    if (v === 'home') {
      const nameEl = view.querySelector('[data-greeting-name]');
      if (nameEl) nameEl.textContent = 'there';
    }
    return;
  }
  const r = activeRole();
  if (r === 'brand') {
    if (v === 'home') hydrateBrandHome(d);
    if (v === 'campaigns') hydrateCampaigns(d);
    return;
  }
  if (r === 'team_lead') {
    if (v === 'home' || v === 'roster' || v === 'invites') hydrateTeamLead(d, v);
    return;
  }
  if (r === 'admin') {
    if (v === 'home' || v === 'admin') hydrateAdmin(d, v);
    return;
  }
  if (v === 'home') hydrateHome(d);
  if (v === 'profile') hydrateProfile(d);
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
