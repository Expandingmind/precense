// Returns public Supabase config for the browser client.
// Safe to expose: anon/publishable keys are meant for the client and are RLS-protected.

export const config = { runtime: 'nodejs' };

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(200).json({
    supabase_url: process.env.SUPABASE_URL,
    supabase_anon_key: process.env.SUPABASE_ANON_KEY || '',
  });
}
