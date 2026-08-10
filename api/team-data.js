import { supabase } from '../lib/supabase.js';

export const config = { runtime: 'nodejs' };

// GET /api/team-data — returns teams owned by caller + roster + invites.
// Only accessible to team_lead role (and admin, who sees all teams they own).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'not authenticated' });

  const authUser = await verifyToken(token);
  if (!authUser) return res.status(401).json({ error: 'invalid token' });

  try {
    const { data: user } = await supabase
      .from('users').select('id, role').eq('auth_user_id', authUser.id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'no user row' });
    if (!['team_lead', 'admin'].includes(user.role)) return res.status(403).json({ error: 'not a team lead' });

    const { data: teams } = await supabase
      .from('teams').select('id, name, slug, default_team_take_pct, created_at')
      .eq('owner_user_id', user.id).order('created_at', { ascending: false });

    const teamIds = (teams || []).map((t) => t.id);
    const [{ data: members }, { data: invites }, platformRes] = await Promise.all([
      teamIds.length
        ? supabase
            .from('team_members')
            .select('team_id, creator_profile_id, team_take_pct, status, joined_at, creator_profiles(display_name, niche)')
            .in('team_id', teamIds).order('joined_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      teamIds.length
        ? supabase
            .from('creator_invites')
            .select('token, role, team_id, team_take_pct, email_hint, expires_at, used_at, created_at')
            .in('team_id', teamIds).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      supabase.from('platform_config').select('platform_take_pct').eq('id', 1).maybeSingle(),
    ]);

    const platformPct = Number(platformRes?.data?.platform_take_pct ?? 10);
    const flatMembers = (members || []).map((m) => ({
      team_id: m.team_id,
      creator_profile_id: m.creator_profile_id,
      team_take_pct: Number(m.team_take_pct),
      platform_take_pct: platformPct,
      status: m.status,
      joined_at: m.joined_at,
      display_name: m.creator_profiles?.display_name || null,
      niche: m.creator_profiles?.niche || null,
    }));

    return res.status(200).json({
      teams: teams || [],
      members: flatMembers,
      invites: invites || [],
      platform_take_pct: platformPct,
    });
  } catch (e) {
    console.error('team-data error', e);
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
