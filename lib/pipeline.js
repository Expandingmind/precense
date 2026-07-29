// Shared analysis pipeline for all channels (Telegram, WhatsApp, iMessage-later).
// Given a video buffer + user, runs analysis, saves to DB, returns the reply text.
//
// The webhook that calls this is responsible for:
//   - identifying the user (channel-specific auth / handle mapping)
//   - downloading the video bytes (channel-specific media API)
//   - sending the reply back through its own channel

import { analyzeVideo } from './claude.js';
import {
  insertSubmission,
  updateSubmission,
  getSignature,
  recomputeSignature,
} from './supabase.js';

const MODEL = process.env.PRECENSE_MODEL || 'claude-haiku-4-5';

export async function analyzeAndPersist({
  user,          // { id, niche }
  source,        // 'telegram' | 'whatsapp' | ...
  channelFileId, // opaque channel-specific ID for the video (fk stored in submissions)
  videoBuffer,
  filename,
  mimeType,
  userNote,
}) {
  const submissionId = await insertSubmission({
    userId: user.id,
    source,
    urlOrFileId: channelFileId,
  });

  try {
    const signature = await getSignature(user.id);

    const result = await analyzeVideo({
      videoBuffer,
      filename,
      mimeType,
      userNote,
      niche: user.niche,
      signature,
    });

    if (!result.text) {
      await updateSubmission(submissionId, { precense_reply: null });
      return { ok: false, submissionId, reason: 'empty_model_response' };
    }

    await updateSubmission(submissionId, {
      extracted_features: result.features,
      precense_reply: result.text,
      metrics: {
        usage: result.usage,
        stop_reason: result.stopReason,
        claude_file_id: result.fileId,
        model: MODEL,
        channel: source,
      },
    });

    if (result.features) {
      await recomputeSignature(user.id);
    }

    return { ok: true, submissionId, replyText: result.text };
  } catch (err) {
    await updateSubmission(submissionId, {
      metrics: { error: err.message?.slice(0, 500) || 'unknown', channel: source },
    });
    throw err;
  }
}
