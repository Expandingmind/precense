import Anthropic from '@anthropic-ai/sdk';
import { toFile } from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from './prompt.js';

const client = new Anthropic();

const MODEL = process.env.PRECENSE_MODEL || 'claude-haiku-4-5';

export async function analyzeVideo({ videoBuffer, filename, mimeType, userNote }) {
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
        ? `The user forwarded this video and said: "${userNote.trim()}"\n\nWatch it and reply in your standard format.`
        : `The user forwarded this video (no note). Watch it and reply in your standard format.`,
    },
  ];

  const response = await client.beta.messages.create(
    {
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userContent }],
      betas: ['files-api-2025-04-14'],
    }
  );

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  return {
    text,
    usage: response.usage,
    stopReason: response.stop_reason,
    fileId: uploaded.id,
  };
}
