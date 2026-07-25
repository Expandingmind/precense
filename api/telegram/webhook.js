import { waitUntil } from '@vercel/functions';
import { sendMessage, sendChatAction, downloadFile, extractVideo } from '../../lib/telegram.js';
import {
  upsertUser,
  setUserNiche,
  insertSubmission,
  updateSubmission,
  getSignature,
  recomputeSignature,
} from '../../lib/supabase.js';
import { analyzeVideo } from '../../lib/claude.js';
import { NICHES, isValidNiche } from '../../lib/knowledge.js';

export const config = { runtime: 'nodejs' };

const MAX_BYTES = 20 * 1024 * 1024;

const WELCOME = `hey. i'm precense.

forward me any reel, tiktok, or short — the ones you posted, or ones you want to study — and i'll tell you why they hit and what to make next.

just send. no setup.

your niche is set to *app-ugc* by default. change it with /niche if you're in a different lane (${NICHES.join(', ')}).`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(200).send('ok');
    return;
  }
  if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    res.status(403).send('forbidden');
    return;
  }

  const update = req.body;
  if (!update || typeof update !== 'object') {
    res.status(400).send('bad json');
    return;
  }

  waitUntil(handleUpdate(update).catch((err) => console.error('handleUpdate error', err)));
  res.status(200).send('ok');
}

async function handleUpdate(update) {
  const message = update.message || update.edited_message;
  if (!message) return;

  const chatId = message.chat.id;
  const user = await upsertUser(message.from, chatId);

  const text = message.text?.trim();

  if (text === '/start' || text === '/help') {
    await sendMessage(chatId, WELCOME);
    return;
  }

  if (text?.startsWith('/niche')) {
    await handleNicheCommand(chatId, user, text);
    return;
  }

  const video = extractVideo(message);

  if (!video) {
    if (text) {
      await sendMessage(chatId, "Send me a reel, TikTok, or short and I'll break it down. That's what I'm for.");
    }
    return;
  }

  if (video.size && video.size > MAX_BYTES) {
    await sendMessage(
      chatId,
      `That video is ${(video.size / 1024 / 1024).toFixed(1)}MB — I can only pull files under 20MB right now (Telegram limit). Try a shorter clip or a lower-res export.`
    );
    return;
  }

  const submissionId = await insertSubmission({
    userId: user.id,
    source: 'telegram',
    urlOrFileId: video.fileId,
  });

  sendChatAction(chatId, 'typing');
  const typingLoop = setInterval(() => sendChatAction(chatId, 'typing'), 4000);

  try {
    const buffer = await downloadFile(video.fileId);
    const signature = await getSignature(user.id);

    const result = await analyzeVideo({
      videoBuffer: buffer,
      filename: video.filename,
      mimeType: video.mime,
      userNote: message.caption,
      niche: user.niche,
      signature,
    });

    clearInterval(typingLoop);

    if (!result.text) {
      await sendMessage(chatId, "Couldn't open that one — resend it or try a shorter clip (under 20MB for now).");
      await updateSubmission(submissionId, { precense_reply: null });
      return;
    }

    await sendMessage(chatId, result.text, { replyTo: message.message_id });

    await updateSubmission(submissionId, {
      extracted_features: result.features,
      precense_reply: result.text,
      metrics: {
        usage: result.usage,
        stop_reason: result.stopReason,
        claude_file_id: result.fileId,
        model: process.env.PRECENSE_MODEL || 'claude-haiku-4-5',
      },
    });

    if (result.features) {
      await recomputeSignature(user.id);
    }
  } catch (err) {
    clearInterval(typingLoop);
    console.error('analyze error', err);
    await updateSubmission(submissionId, {
      metrics: { error: err.message?.slice(0, 500) || 'unknown' },
    });
    await sendMessage(
      chatId,
      "Hit a snag on that one. Try resending — or a shorter clip if it was long. If it keeps failing, that's on me, not you."
    );
  }
}

async function handleNicheCommand(chatId, user, text) {
  const parts = text.split(/\s+/);
  const arg = parts[1];

  if (!arg) {
    await sendMessage(
      chatId,
      `your niche is *${user.niche}*.\n\nchange it with:\n${NICHES.map((n) => `\`/niche ${n}\``).join('\n')}`
    );
    return;
  }

  if (!isValidNiche(arg)) {
    await sendMessage(chatId, `unknown niche. pick one: ${NICHES.join(', ')}`);
    return;
  }

  await setUserNiche(user.id, arg);
  await sendMessage(chatId, `niche set to *${arg}*. next video i read will use that playbook.`);
}
