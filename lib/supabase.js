import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const DEFAULT_NICHE = 'app-ugc';

// Upsert a user identified by whichever channel they came through.
// `channel` is 'telegram' | 'whatsapp'. Returns { id, niche, handle }.
export async function upsertChannelUser({ channel, chatId, phone, from = {} }) {
  const lookup = channel === 'telegram'
    ? { column: 'telegram_chat_id', value: chatId }
    : { column: 'whatsapp_phone', value: phone };

  if (!lookup.value) throw new Error(`upsertChannelUser: missing ${lookup.column}`);

  // Try to find an existing row
  const { data: existing, error: findErr } = await supabase
    .from('users')
    .select('id, niche, handle, first_name, telegram_chat_id, whatsapp_phone')
    .eq(lookup.column, lookup.value)
    .maybeSingle();
  if (findErr) throw new Error(`upsertChannelUser find: ${findErr.message}`);

  if (existing) {
    // Refresh light metadata if changed
    const patch = {};
    if (from.username && from.username !== existing.handle) patch.handle = from.username;
    if (from.first_name && from.first_name !== existing.first_name) patch.first_name = from.first_name;
    if (Object.keys(patch).length) {
      await supabase.from('users').update(patch).eq('id', existing.id);
    }
    return { id: existing.id, niche: existing.niche || DEFAULT_NICHE, handle: from.username || existing.handle };
  }

  // Insert new row
  const insertPayload = {
    handle: from.username || null,
    first_name: from.first_name || null,
    [lookup.column]: lookup.value,
  };
  const { data: created, error: insertErr } = await supabase
    .from('users')
    .insert(insertPayload)
    .select('id, niche, handle')
    .single();
  if (insertErr) throw new Error(`upsertChannelUser insert: ${insertErr.message}`);

  return { id: created.id, niche: created.niche || DEFAULT_NICHE, handle: created.handle };
}

// Legacy alias (telegram-only) — used by existing webhook until it's swapped.
export async function upsertUser(from, chatId) {
  return upsertChannelUser({ channel: 'telegram', chatId, from });
}

export async function setUserNiche(userId, niche) {
  const { error } = await supabase.from('users').update({ niche }).eq('id', userId);
  if (error) throw new Error(`setUserNiche: ${error.message}`);
}

export async function insertSubmission({ userId, source, urlOrFileId, extractedFeatures = null, metrics = null }) {
  const { data, error } = await supabase
    .from('submissions')
    .insert({
      user_id: userId,
      source,
      url_or_file_id: urlOrFileId,
      extracted_features: extractedFeatures,
      metrics,
    })
    .select('id')
    .single();
  if (error) throw new Error(`insertSubmission: ${error.message}`);
  return data.id;
}

export async function updateSubmission(id, patch) {
  const { error } = await supabase.from('submissions').update(patch).eq('id', id);
  if (error) throw new Error(`updateSubmission: ${error.message}`);
}

export async function getSignature(userId) {
  const { data, error } = await supabase
    .from('user_signature')
    .select('summary')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`getSignature: ${error.message}`);
  return data?.summary || null;
}

export async function recomputeSignature(userId) {
  const { data, error } = await supabase
    .from('submissions')
    .select('id, extracted_features, metrics, submitted_at')
    .eq('user_id', userId)
    .not('extracted_features', 'is', null)
    .order('submitted_at', { ascending: false });
  if (error) throw new Error(`recomputeSignature select: ${error.message}`);

  const submissions = data || [];
  const summary = summarize(submissions);

  const { error: upsertErr } = await supabase
    .from('user_signature')
    .upsert(
      {
        user_id: userId,
        summary,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  if (upsertErr) throw new Error(`recomputeSignature upsert: ${upsertErr.message}`);
  return summary;
}

function summarize(submissions) {
  const hookCounts = new Map();
  const formatCounts = new Map();
  const subjectCounts = new Map();
  for (const s of submissions) {
    const f = s.extracted_features || {};
    bump(hookCounts, f.hook_type);
    bump(formatCounts, f.format);
    bump(subjectCounts, f.subject);
  }
  return {
    dominant_hook_types: top(hookCounts, 3),
    dominant_formats: top(formatCounts, 3),
    common_subjects: top(subjectCounts, 5),
    top_performers: submissions.slice(0, 3).map((s) => ({
      id: s.id,
      hook_type: s.extracted_features?.hook_type,
      format: s.extracted_features?.format,
    })),
    video_count: submissions.length,
  };
}
function bump(map, key) { if (!key) return; map.set(key, (map.get(key) || 0) + 1); }
function top(map, n) { return Array.from(map.entries()).sort((a,b) => b[1]-a[1]).slice(0, n).map(([k]) => k); }
