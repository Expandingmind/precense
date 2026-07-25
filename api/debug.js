import { supabase } from '../lib/supabase.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.query.k !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    res.status(403).send('nope');
    return;
  }

  const out = {
    env: {
      TELEGRAM_BOT_TOKEN: !!process.env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_WEBHOOK_SECRET: !!process.env.TELEGRAM_WEBHOOK_SECRET,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  };

  // Supabase test
  try {
    const { data, error } = await supabase.from('users').select('id').limit(1);
    out.supabase = error ? { error: error.message } : { ok: true, sample_count: data.length };
  } catch (e) {
    out.supabase = { throw: e.message };
  }

  // Telegram bot identity
  try {
    const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
    const j = await r.json();
    out.telegram = j.ok ? { username: j.result.username, id: j.result.id } : { error: j };
  } catch (e) {
    out.telegram = { throw: e.message };
  }

  // Anthropic identity (models list is a cheap auth check)
  try {
    const r = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
    });
    const j = await r.json();
    out.anthropic = r.ok ? { ok: true, model_count: j.data?.length } : { status: r.status, body: j };
  } catch (e) {
    out.anthropic = { throw: e.message };
  }

  res.status(200).json(out);
}
