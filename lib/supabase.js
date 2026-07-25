import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export async function upsertUser(from, chatId) {
  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        telegram_chat_id: chatId,
        telegram_username: from.username || null,
        first_name: from.first_name || null,
      },
      { onConflict: 'telegram_chat_id' }
    )
    .select('id')
    .single();
  if (error) throw new Error(`upsertUser: ${error.message}`);
  return data.id;
}

export async function insertVideo({ userId, fileId, messageId, sizeBytes }) {
  const { data, error } = await supabase
    .from('videos')
    .insert({
      user_id: userId,
      telegram_file_id: fileId,
      telegram_message_id: messageId,
      file_size_bytes: sizeBytes,
      status: 'analyzing',
    })
    .select('id')
    .single();
  if (error) throw new Error(`insertVideo: ${error.message}`);
  return data.id;
}

export async function completeVideo(id, replyText, analysis) {
  await supabase
    .from('videos')
    .update({
      status: 'done',
      reply_text: replyText,
      analysis,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id);
}

export async function failVideo(id, errorMessage) {
  await supabase
    .from('videos')
    .update({
      status: 'error',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id);
}
