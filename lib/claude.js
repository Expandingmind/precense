import Anthropic from '@anthropic-ai/sdk';
import { toFile } from '@anthropic-ai/sdk';
import { buildSystemBlocks } from './prompt.js';

const client = new Anthropic();

const MODEL = process.env.PRECENSE_MODEL || 'claude-haiku-4-5';

const FEATURE_SCHEMA = {
  type: 'object',
  properties: {
    reply_markdown: {
      type: 'string',
      description: 'The final natural-language reply to send back to the user in Telegram. Markdown allowed.',
    },
    features: {
      type: 'object',
      description: 'Structured extraction of what this video actually is, for Precense signature memory.',
      properties: {
        hook_type: {
          type: 'string',
          description: 'Short label matching the playbook vocabulary (pattern-interrupt, problem-callout, dupe, POV, transformation, authority-stack, insider-tell, listicle, countdown, firing-clients, storytime, etc.). Reuse existing labels if possible.',
        },
        format: {
          type: 'string',
          enum: ['talking-head', 'screen-record', 'POV', 'skit', 'b-roll-vo', 'other'],
        },
        subject: {
          type: 'string',
          description: 'What the video is about in 3-6 words. e.g. "AI photo editor unboxing", "seed-round advice", "day-1 no-phone morning".',
        },
        pacing: {
          type: 'string',
          description: 'Short observation on cut cadence, e.g. "hard cuts every 1.5s, slows after 0:08".',
        },
      },
      required: ['hook_type', 'format', 'subject', 'pacing'],
      additionalProperties: false,
    },
  },
  required: ['reply_markdown', 'features'],
  additionalProperties: false,
};

export async function analyzeVideo({ videoBuffer, filename, mimeType, userNote, niche, signature }) {
  const uploaded = await client.beta.files.upload({
    file: await toFile(videoBuffer, filename, { type: mimeType }),
    betas: ['files-api-2025-04-14'],
  });

  const userContent = [
    {
      type: 'document',
      source: { type: 'file', file_id: uploaded.id },
    },
    {
      type: 'text',
      text: userNote?.trim()
        ? `The user forwarded this video and said: "${userNote.trim()}"\n\nWatch it and reply in your standard format. Also extract the video's features for the signature store.`
        : `The user forwarded this video (no note). Watch it and reply in your standard format. Also extract the video's features for the signature store.`,
    },
  ];

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: buildSystemBlocks({ niche, signature, videoFeatures: null }),
    messages: [{ role: 'user', content: userContent }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: FEATURE_SCHEMA,
      },
    },
    betas: ['files-api-2025-04-14'],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) {
    return { text: '', features: null, usage: response.usage, stopReason: response.stop_reason, fileId: uploaded.id };
  }

  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    // Structured output should always be valid JSON, but hedge in case.
    return { text: textBlock.text.trim(), features: null, usage: response.usage, stopReason: response.stop_reason, fileId: uploaded.id };
  }

  return {
    text: (parsed.reply_markdown || '').trim(),
    features: parsed.features || null,
    usage: response.usage,
    stopReason: response.stop_reason,
    fileId: uploaded.id,
  };
}
