import { supabase } from '../lib/supabase.js';

export const config = { runtime: 'nodejs' };

// GET /api/admin-data — admin only. Global view: all teams, all brands, recent invites.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'not authenticated' });

  const authUser = await verifyToken(token);
  if (!authUser) return res.status(401).json({ error: 'invalid token' });

  try {
    const { data: user } = await supabase
      .from('users').select('id, role').eq('auth_user_id', authUser.id).maybeSingle();
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'admin only' });

    const [{ data: teams }, { data: brandOrgs }, { data: recentInvites }] = await Promise.all([
      supabase.from('teams').select('id, name, default_team_take_pct, owner_user_id, created_at').order('created_at', { ascending: false }),
      supabase.from('brand_orgs').select('id, name, created_at').order('created_at', { ascending: false }),
      supabase.from('creator_invites').select('token, role, team_id, brand_org_id, team_take_pct, email_hint, expires_at, used_at, created_at').order('created_at', { ascending: false }).limit(40),
    ]);

    // Enrich teams with owner email + member count.
    const ownerIds = Array.from(new Set((teams || []).map((t) => t.owner_user_id)));
    const [{ data: owners }, { data: counts }] = await Promise.all([
      ownerIds.length
        ? supabase.from('users').select('id, email, handle').in('id', ownerIds)
        : Promise.resolve({ data: [] }),
      teams?.length
        ? supabase.from('team_members').select('team_id').in('team_id', teams.map((t) => t.id))
        : Promise.resolve({ data: [] }),
    ]);
    const emailById = new Map((owners || []).map((o) => [o.id, o.email || o.handle]));
    const countByTeam = new Map();
    (counts || []).forEach((c) => countByTeam.set(c.team_id, (countByTeam.get(c.team_id) || 0) + 1));
    const enrichedTeams = (teams || []).map((t) => ({
      ...t,
      owner_email: emailById.get(t.owner_user_id) || null,
      member_count: countByTeam.get(t.id) || 0,
    }));

    return res.status(200).json({
      teams: enrichedTeams,
      brand_orgs: brandOrgs || [],
      recent_invites: recentInvites || [],
    });
  } catch (e) {
    console.error('admin-data error', e);
    return res.status(500).json({ error: e.message });
  }
}

async function verifyToken(token) {
  const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY },
  });
  if (!r.ok) return null;
  return r.json();
}
