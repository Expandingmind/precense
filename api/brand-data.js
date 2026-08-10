import { supabase } from '../lib/supabase.js';

export const config = { runtime: 'nodejs' };

// GET /api/brand-data
// Returns the active brand org for the authenticated user, plus campaigns + roster.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'not authenticated' });

  const authUser = await verifyToken(token);
  if (!authUser) return res.status(401).json({ error: 'invalid token' });

  try {
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, role, active_brand_org_id')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();
    if (userErr) throw userErr;
    if (!user) return res.status(404).json({ error: 'no user row' });
    if (user.role !== 'brand') return res.status(403).json({ error: 'not a brand user' });

    const orgId = user.active_brand_org_id;
    if (!orgId) return res.status(200).json({ org: null, campaigns: [], roster: [] });

    const [{ data: org }, { data: campaigns }, { data: roster }, { count: pending }] = await Promise.all([
      supabase.from('brand_orgs').select('id, name, slug, logo_url, website').eq('id', orgId).maybeSingle(),
      supabase.from('campaigns').select('id, name, brief, target_hooks, target_formats, status, budget_cents, currency, starts_at, ends_at, created_at').eq('brand_org_id', orgId).order('created_at', { ascending: false }),
      supabase.from('creator_roster').select('creator_profile_id, status, added_at, notes, creator_profiles(id, display_name, niche, visibility)').eq('brand_org_id', orgId),
      supabase.from('deliverables').select('id', { count: 'exact', head: true }).in('status', ['submitted', 'revising']).in('campaign_id',
        (await supabase.from('campaigns').select('id').eq('brand_org_id', orgId)).data?.map((c) => c.id) || [0]
      ),
    ]);

    return res.status(200).json({
      org: org || null,
      campaigns: campaigns || [],
      roster: roster || [],
      pending_deliverables: pending || 0,
    });
  } catch (e) {
    console.error('brand-data error', e);
    return res.status(500).json({ error: e.message });
  }
}

async function verifyToken(token) {
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.SUPABASE_ANON_KEY,
      },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
