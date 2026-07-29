// WhatsApp Cloud API — send + download media helpers.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api

import crypto from 'node:crypto';

const GRAPH = 'https://graph.facebook.com/v20.0';

function token() { return process.env.WHATSAPP_ACCESS_TOKEN; }
function phoneNumberId() { return process.env.WHATSAPP_PHONE_NUMBER_ID; }
function appSecret() { return process.env.WHATSAPP_APP_SECRET; }
function verifyToken() { return process.env.WHATSAPP_VERIFY_TOKEN; }

// ---- Webhook verification ----

// GET verification: return the challenge if the verify_token matches ours.
export function verifyChallenge(query) {
  if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === verifyToken()) {
    return String(query['hub.challenge'] || '');
  }
  return null;
}

// POST signature verification: Meta signs each payload with our App Secret.
export function verifySignature(rawBody, signatureHeader) {
  if (!appSecret()) return false;
  if (!signatureHeader) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret()).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch { return false; }
}

// ---- Send ----

export async function sendMessage(toE164, text) {
  const r = await fetch(`${GRAPH}/${phoneNumberId()}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toE164,
      type: 'text',
      text: { preview_url: false, body: text },
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`whatsapp sendMessage ${r.status}: ${body}`);
  }
  return r.json();
}

// WhatsApp has no "typing indicator" API for cloud businesses (as of writing).
// We use a mark-as-read to at least surface the blue tick.
export async function markRead(messageId) {
  await fetch(`${GRAPH}/${phoneNumberId()}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  }).catch(() => {});
}

// ---- Media download ----

// Two-step: fetch media metadata to get a signed URL, then download the bytes.
export async function downloadMedia(mediaId) {
  const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!metaRes.ok) throw new Error(`whatsapp media meta ${metaRes.status}`);
  const meta = await metaRes.json();
  if (!meta.url) throw new Error('whatsapp media meta missing url');

  const binRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!binRes.ok) throw new Error(`whatsapp media bytes ${binRes.status}`);
  const buf = Buffer.from(await binRes.arrayBuffer());
  return {
    buffer: buf,
    mime: meta.mime_type || 'video/mp4',
    filename: `whatsapp_${mediaId}.mp4`,
    size: buf.length,
  };
}

// ---- Message parsing ----

// Given a WhatsApp webhook message object, return the video info if present.
export function extractVideo(message) {
  if (message.type === 'video' && message.video?.id) {
    return {
      mediaId: message.video.id,
      mime: message.video.mime_type || 'video/mp4',
      caption: message.video.caption,
    };
  }
  if (message.type === 'document' && message.document?.mime_type?.startsWith('video/')) {
    return {
      mediaId: message.document.id,
      mime: message.document.mime_type,
      caption: message.document.caption,
      filename: message.document.filename,
    };
  }
  return null;
}
