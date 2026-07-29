import { supabase } from '../lib/supabase.js';

export const config = { runtime: 'nodejs' };

// GET /api/user-data
// Authenticated: pass Authorization: Bearer <supabase_access_token>
// Falls back to demo data if no auth (for the landing preview).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) {
    return res.status(200).json({ demo: true, ...demoPayload() });
  }

  const authUser = await verifyToken(token);
  if (!authUser) {
    return res.status(401).json({ error: 'invalid token' });
  }

  try {
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, handle, first_name, niche, telegram_chat_id, email, auth_user_id, created_at')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();

    if (userErr) throw userErr;
    if (!user) {
      // Auth exists but no row yet — needs the link/onboarding flow
      return res.status(200).json({
        needs_link: true,
        auth_user: { id: authUser.id, email: authUser.email },
      });
    }

    const [{ data: subs }, { data: sig }] = await Promise.all([
      supabase
        .from('submissions')
        .select('id, source, url_or_file_id, extracted_features, metrics, precense_reply, submitted_at')
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false })
        .limit(24),
      supabase
        .from('user_signature')
        .select('summary, updated_at')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    return res.status(200).json({
      demo: false,
      user,
      signature: sig?.summary || null,
      signature_updated_at: sig?.updated_at || null,
      submissions: subs || [],
    });
  } catch (e) {
    console.error('user-data error', e);
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

function demoPayload(handle = 'demo') {
  return {
    user: { handle, first_name: 'Jah', niche: 'app-ugc' },
    signature: {
      dominant_hook_types: ['pattern-interrupt', 'dupe', 'POV'],
      dominant_formats: ['talking-head', 'screen-record'],
      common_subjects: ['AI photo editor', 'productivity apps', 'day-1 series'],
      top_performers: [
        { id: 'demo-1', hook_type: 'pattern-interrupt', format: 'talking-head' },
        { id: 'demo-2', hook_type: 'dupe', format: 'screen-record' },
        { id: 'demo-3', hook_type: 'POV', format: 'talking-head' },
      ],
      video_count: 12,
    },
    submissions: [
      { id: 'demo-1', submitted_at: new Date(Date.now() - 3 * 86400e3).toISOString(),
        extracted_features: { hook_type: 'pattern-interrupt', format: 'talking-head', subject: 'AI photo editor unboxing', pacing: 'hard cuts every 1.5s' },
        precense_reply: 'top 8% of your last 30. hook lands at 0:00.4 — your fastest ever. the 0:11 reveal matches your pattern-break signature.',
        metrics: { badge: '3.4× median', tone: 'gold' } },
      { id: 'demo-2', submitted_at: new Date(Date.now() - 6 * 86400e3).toISOString(),
        extracted_features: { hook_type: 'dupe', format: 'screen-record', subject: 'productivity app comparison', pacing: 'slow build, payoff at 0:14' },
        precense_reply: 'solid — comparison frame does the persuasion. show the app 3s earlier next time.',
        metrics: { badge: 'top 12%' } },
      { id: 'demo-3', submitted_at: new Date(Date.now() - 9 * 86400e3).toISOString(),
        extracted_features: { hook_type: 'POV', format: 'talking-head', subject: 'creator burnout POV', pacing: 'reveal at 0:07' },
        precense_reply: 'this one hits. your POV format is meaningfully stronger than your talking-head — do more.',
        metrics: { badge: 'retention 74%' } },
      { id: 'demo-4', submitted_at: new Date(Date.now() - 13 * 86400e3).toISOString(),
        extracted_features: { hook_type: 'listicle', format: 'b-roll-vo', subject: '5 tools I use daily', pacing: 'quick cuts, no dead air' },
        precense_reply: "middle of the pack. the listicle format is playing it safe — your best posts take a stronger stance.",
        metrics: { badge: 'watch again' } },
    ],
  };
}
