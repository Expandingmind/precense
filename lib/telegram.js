const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;
const FILE_API = `https://api.telegram.org/file/bot${TOKEN}`;

export async function sendMessage(chatId, text, opts = {}) {
  const res = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_to_message_id: opts.replyTo,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`sendMessage ${res.status}: ${body}`);
  }
  return res.json();
}

export async function sendChatAction(chatId, action) {
  await fetch(`${API}/sendChatAction`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  }).catch(() => {});
}

// Telegram Bot API caps getFile at 20MB.
export async function getFileUrl(fileId) {
  const res = await fetch(`${API}/getFile?file_id=${fileId}`);
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`getFile failed: ${JSON.stringify(json)}`);
  }
  return `${FILE_API}/${json.result.file_path}`;
}

export async function downloadFile(fileId) {
  const url = await getFileUrl(fileId);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

export function extractVideo(message) {
  if (message.video) {
    return {
      fileId: message.video.file_id,
      size: message.video.file_size,
      mime: message.video.mime_type || 'video/mp4',
      filename: `video_${message.video.file_unique_id}.mp4`,
    };
  }
  if (message.document && message.document.mime_type?.startsWith('video/')) {
    return {
      fileId: message.document.file_id,
      size: message.document.file_size,
      mime: message.document.mime_type,
      filename: message.document.file_name || `video_${message.document.file_unique_id}.mp4`,
    };
  }
  if (message.animation) {
    return {
      fileId: message.animation.file_id,
      size: message.animation.file_size,
      mime: message.animation.mime_type || 'video/mp4',
      filename: `gif_${message.animation.file_unique_id}.mp4`,
    };
  }
  return null;
}
