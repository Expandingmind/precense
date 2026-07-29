import { waitUntil } from '@vercel/functions';
import { upsertChannelUser, setUserNiche } from '../../lib/supabase.js';
import {
  verifyChallenge,
  verifySignature,
  sendMessage,
  markRead,
  downloadMedia,
  extractVideo,
} from '../../lib/whatsapp.js';
import { analyzeAndPersist } from '../../lib/pipeline.js';
import { NICHES, isValidNiche } from '../../lib/knowledge.js';

export const config = {
  runtime: 'nodejs',
  api: { bodyParser: false }, // we need the raw body for HMAC signature verification
};

// WhatsApp Cloud API caps inbound media at 16MB. We enforce a friendly message above that.
const MAX_BYTES = 16 * 1024 * 1024;

const WELCOME = `hey. i'm precense.

send me any reel, tiktok, or short — the ones you posted, or ones you want to study — and i'll tell you why they hit and what to make next.

just send. no setup.`;

export default async function handler(req, res) {
  // 1. GET verification handshake (Meta pings this once when you configure the webhook)
  if (req.method === 'GET') {
    const challenge = verifyChallenge(req.query || {});
    if (challenge) {
      res.status(200).send(challenge);
    } else {
      res.status(403).send('forbidden');
    }
    return;
  }

  if (req.method !== 'POST') { res.status(200).send('ok'); return; }

  // 2. Read the raw body (bodyParser disabled) and verify Meta's HMAC signature
  const raw = await readRaw(req);
  const sig = req.headers['x-hub-signature-256'];
  if (!verifySignature(raw, sig)) {
    res.status(403).send('bad signature');
    return;
  }

  let payload;
  try { payload = JSON.parse(raw.toString('utf8')); }
  catch { res.status(400).send('bad json'); return; }

  // 3. Ack Meta immediately (must reply within a few seconds), process in background
  waitUntil(handlePayload(payload).catch((err) => console.error('whatsapp handle error', err)));
  res.status(200).send('ok');
}

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function handlePayload(payload) {
  const entries = payload.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};
      const contacts = value.contacts || [];
      const messages = value.messages || [];
      for (const message of messages) {
        const contact = contacts.find((c) => c.wa_id === message.from) || {};
        try { await handleMessage(message, contact); }
        catch (e) { console.error('whatsapp handleMessage error', e); }
      }
    }
  }
}

async function handleMessage(message, contact) {
  const phone = message.from; // e164 without '+' — that's WhatsApp's convention
  const displayName = contact?.profile?.name || null;
  const user = await upsertChannelUser({
    channel: 'whatsapp',
    phone,
    from: { first_name: displayName },
  });

  // Best-effort blue-tick
  if (message.id) markRead(message.id);

  const textBody = message.text?.body?.trim() || message.button?.text?.trim() || '';

  // Slash commands (users often send /start out of habit)
  if (textBody === '/start' || textBody === '/help' || /^(hi|hello|hey|start)$/i.test(textBody)) {
    await sendMessage(phone, WELCOME);
    return;
  }

  if (textBody.startsWith('/niche')) {
    await handleNicheCommand(phone, user, textBody);
    return;
  }

  const video = extractVideo(message);

  if (!video) {
    // Non-video message (text link, image, sticker, etc.)
    if (message.type === 'text' && /(instagram|tiktok|youtube|youtu\.be)/i.test(textBody)) {
      await sendMessage(
        phone,
        "I can only watch attached videos right now — video URLs are on the roadmap. Save the reel and share the file with me and I'll break it down."
      );
      return;
    }
    if (message.type !== 'text') {
      await sendMessage(phone, "Send me a reel, TikTok, or short as a video attachment and I'll break it down.");
    }
    return;
  }

  try {
    const media = await downloadMedia(video.mediaId);
    if (media.size > MAX_BYTES) {
      await sendMessage(
        phone,
        `That video is ${(media.size / 1024 / 1024).toFixed(1)}MB — WhatsApp caps me at 16MB. Try a shorter clip or lower-res export.`
      );
      return;
    }

    const result = await analyzeAndPersist({
      user,
      source: 'whatsapp',
      channelFileId: video.mediaId,
      videoBuffer: media.buffer,
      filename: video.filename || media.filename,
      mimeType: video.mime || media.mime,
      userNote: video.caption,
    });

    if (!result.ok) {
      await sendMessage(phone, "Couldn't open that one — try resending, or send a shorter clip (under 16MB).");
      return;
    }
    await sendMessage(phone, result.replyText);
  } catch (err) {
    console.error('whatsapp analyze error', err);
    await sendMessage(
      phone,
      "Hit a snag on that one. Try resending — or a shorter clip if it was long. If it keeps failing, that's on me, not you."
    );
  }
}

async function handleNicheCommand(phone, user, text) {
  const arg = text.split(/\s+/)[1];
  if (!arg) {
    await sendMessage(
      phone,
      `your niche is *${user.niche}*.\n\nchange it with:\n${NICHES.map((n) => `/niche ${n}`).join('\n')}`
    );
    return;
  }
  if (!isValidNiche(arg)) {
    await sendMessage(phone, `unknown niche. pick one: ${NICHES.join(', ')}`);
    return;
  }
  await setUserNiche(user.id, arg);
  await sendMessage(phone, `niche set to *${arg}*. next video i read will use that playbook.`);
}
