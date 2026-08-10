import { supabase } from '../lib/supabase.js';

export const config = { runtime: 'nodejs' };

// POST /api/request-invite
// Public — captures a would-be signup for admin review.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const email = String(body?.email || '').trim().toLowerCase();
  const handle = String(body?.handle || '').trim();
  const role = ['creator', 'team_lead', 'brand'].includes(body?.role) ? body.role : 'creator';

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'valid email required' });
  }
  if (!handle) return res.status(400).json({ error: 'handle required' });

  const { error } = await supabase.from('invite_requests').upsert({
    email, handle, role, source: 'landing', requested_at: new Date().toISOString(),
  }, { onConflict: 'email' });

  if (error) {
    console.error('request-invite error', error);
    return res.status(500).json({ error: 'could not record request' });
  }
  return res.status(200).json({ ok: true });
}
