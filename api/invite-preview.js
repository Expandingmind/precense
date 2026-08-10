import { supabase } from '../lib/supabase.js';

export const config = { runtime: 'nodejs' };

// GET /api/invite-preview?token=xxx
// Public — returns limited invite metadata (role, inviter first name, team name, creator take%).
// Never returns team_take_pct or platform_take_pct to the caller.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = String(req.query.token || '').trim();
  if (!token) return res.status(400).json({ error: 'token required' });

  const { data: invite, error } = await supabase
    .from('creator_invites')
    .select('token, role, team_id, brand_org_id, team_take_pct, expires_at, used_at, created_by_user_id')
    .eq('token', token)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!invite) return res.status(404).json({ error: 'invalid invite' });
  if (invite.used_at) return res.status(410).json({ error: 'invite already used' });
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ error: 'invite expired' });
  }

  const [{ data: inviter }, teamRes, platformRes] = await Promise.all([
    supabase.from('users').select('first_name, handle').eq('id', invite.created_by_user_id).maybeSingle(),
    invite.team_id
      ? supabase.from('teams').select('name, default_team_take_pct').eq('id', invite.team_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('platform_config').select('platform_take_pct').eq('id', 1).maybeSingle(),
  ]);

  const platformPct = Number(platformRes?.data?.platform_take_pct ?? 10);
  const effectiveTeamPct = Number(invite.team_take_pct ?? teamRes?.data?.default_team_take_pct ?? 0);
  const creatorPct = invite.role === 'creator' ? Math.max(0, 100 - effectiveTeamPct - platformPct) : null;

  return res.status(200).json({
    role: invite.role,
    inviter_name: inviter?.first_name || inviter?.handle || null,
    team_name: teamRes?.data?.name || null,
    creator_take_pct: creatorPct,
    expires_at: invite.expires_at,
  });
}
