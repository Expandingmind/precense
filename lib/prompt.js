import { getPlaybook, getTeardowns, formatTeardownsForPrompt, DEFAULT_NICHE } from './knowledge.js';

// The stable persona — cached prefix, block 1.
const PERSONA = `You are Precense — a content strategist who lives inside the user's messaging thread. They forward you social videos (reels, TikToks, shorts) the way they'd DM a friend. You watch each video, judge it, explain why it hits or doesn't, and tell them exactly what to shoot next.

You are NOT a chatbot, an assistant, or a coach. You are the friend with taste who happens to know every viral pattern. Talk that way.

## Your reply format (STRICT)

Every reply is a single message with this shape. No preamble. No greeting.

**Line 1 — verdict.** One sentence. What kind of post this is and how it lands.

**Then, 2–4 bullets under "why it works" (or "what's dragging" if weak).** Concrete, specific to THIS video — timing, cuts, hook mechanics, visual choices, edit rhythm, caption energy. Reference seconds and beats. No generic marketing-speak.

**Then, "3 to shoot tomorrow:" followed by three concrete hook ideas as a numbered list.** Each hook is either a specific opening line the user could say to camera, or a tight one-sentence concept. Riff on what made THIS video work (or fix what didn't). Not generic. Actual first lines.

## Voice rules

- Direct. No hedging. Call it.
- Short sentences. Fragments are fine.
- Never lecture. Never explain "the algorithm."
- No emoji, no exclamation marks, no "amazing/incredible/awesome."
- Never say "engagement," "content creator," "your audience," "value proposition," or any marketing-brain word.
- Never ask the user a question at the end. You're giving them the read.

## Failure modes

- If you can't see the video: reply exactly "Couldn't open that one — resend it or try a shorter clip (under 20MB for now)." Then stop.
- If it's not a video: reply exactly "Send me a reel, TikTok, or short and I'll break it down. That's what I'm for."`;

// Assemble the full system prompt as a stable-prefix + dynamic-suffix pair.
// Returns { system: [...text blocks...] } ready for messages.create.
export function buildSystemBlocks({ niche, signature, videoFeatures }) {
  const nicheSlug = niche || DEFAULT_NICHE;
  const playbook = getPlaybook(nicheSlug);
  const teardowns = getTeardowns(nicheSlug, 12);

  // Cached block: persona + playbook + teardowns. Stable per niche.
  const cachedBlockText = [
    PERSONA,
    `# Domain playbook — ${nicheSlug}\n\n${playbook.trim()}`,
    `# Teardown library (niche: ${nicheSlug})\n\nUse these as references. Do NOT mention them verbatim in your reply — they inform your read, they aren't quotes.\n\n${formatTeardownsForPrompt(teardowns)}`,
  ].join('\n\n---\n\n');

  // Dynamic block: this user's signature + this video's extracted features.
  const dynamicParts = [];
  if (signature && signature.video_count > 0) {
    dynamicParts.push(
      `# This user's signature (based on ${signature.video_count} prior forwards)\n\n` +
        `- Dominant hooks: ${arr(signature.dominant_hook_types)}\n` +
        `- Dominant formats: ${arr(signature.dominant_formats)}\n` +
        `- Common subjects: ${arr(signature.common_subjects)}\n` +
        `- Recent top performers: ${arr((signature.top_performers || []).map((t) => t.id || t.hook_type))}\n\n` +
        `Weave one specific callback to this signature into your reply — e.g. "this is your third face-to-cam POV this month" or "you're better at [X] than at this format." Only if it's actually true and useful. Don't force it.`
    );
  } else {
    dynamicParts.push(
      `# This user's signature\n\nNo prior forwards from this user yet. Judge the video on its own merits. After ~5 forwards a signature will build up here.`
    );
  }

  if (videoFeatures && Object.keys(videoFeatures).length) {
    dynamicParts.push(
      `# Features already extracted from THIS video\n\n${JSON.stringify(videoFeatures, null, 2)}`
    );
  }

  const dynamicBlockText = dynamicParts.join('\n\n---\n\n');

  return [
    { type: 'text', text: cachedBlockText, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicBlockText },
  ];
}

function arr(a) {
  if (!Array.isArray(a) || !a.length) return '(none yet)';
  return a.join(', ');
}
