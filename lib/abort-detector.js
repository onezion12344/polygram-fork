/**
 * Detect "stop working on the current turn" signals in natural language.
 *
 * Mirrors OpenClaw's isAbortRequestText semantics: users should be able to
 * say "stop" / "стоп" / "cancel" / or just `/stop` and have polygram
 * interrupt the in-flight turn instead of queueing the message behind it.
 *
 * Conservative on purpose. False positives hijack user intent — "stop using
 * emoji" should NOT abort. So we require ONE of:
 *   1. The whole message (after stripping leading @-mention + trailing
 *      punctuation) is an exact match against a known abort phrase
 *      (HARD or SOFT phrases — see below), OR
 *   2. It starts with an explicit slash command: /stop, /abort, /cancel, OR
 *   3. The FIRST SENTENCE (split on . ! ?) is an exact match against the
 *      HARD phrases ONLY. Catches "Stop. I'll ask in another session." —
 *      clear abort intent with continuation. Does NOT trigger on
 *      "Wait? Something is off..." (rc.41 false-positive fix — soft words
 *      like "wait" / "hold on" are too conversational to abort on
 *      first-sentence alone).
 *
 * Hard phrases (whole-message OR first-sentence trigger):
 *   English: stop, cancel, abort, halt
 *   Russian: стоп, остановись, остановить, отмена, прекрати, прекращай,
 *            хватит, отставить
 *
 * Soft phrases (whole-message ONLY):
 *   English: wait, hold on, hold up, nevermind, never mind, nvm,
 *            forget it, forget that
 *   Russian: подожди, подожди-ка, забей, не надо, отмени
 *
 * The split exists because "wait", "hold on", "подожди" are commonly used
 * as conversational openers ("Wait? There is something wrong..." — Ivan DM
 * 2026-05-01 19:01) where the user is NOT asking the bot to stop, they're
 * flagging an issue. Hard phrases ("stop", "cancel", "abort") are
 * unambiguously about ending the current task.
 *
 * Not detected (on purpose):
 *   - "stop using markdown" → first sentence is the whole thing, not exact
 *   - "I said stop" → not at start / not exact match
 *   - "Wait? Something is wrong..." (rc.41) — soft word, multi-sentence
 *   - "Hold on, let me think" — same shape
 */

'use strict';

// HARD phrases: unambiguous abort intent. Trigger on whole-message OR
// first-sentence match.
const HARD_ABORT_PHRASES = new Set([
  // English
  'stop', 'cancel', 'abort', 'halt', 'escape', 'quit', 'exit',
  // Russian
  'стоп', 'остановись', 'остановить',
  'отмена', 'прекрати', 'прекращай', 'хватит', 'отставить',
  // Chinese
  '停下', '停止', '取消', '退出', '算了', '别做了',
]);

// SOFT phrases: conversational filler that COULD mean abort but commonly
// doesn't. Whole-message match only.
const SOFT_ABORT_PHRASES = new Set([
  // English
  'wait', 'hold on', 'hold up', 'nevermind', 'never mind', 'nvm',
  'forget it', 'forget that',
  // Russian
  'подожди', 'подожди-ка', 'забей', 'не надо', 'отмени',
]);

// Combined set for whole-message matching. Kept exported as ABORT_PHRASES
// for backward compatibility with any callers / tests that import it
// directly.
const ABORT_PHRASES = new Set([...HARD_ABORT_PHRASES, ...SOFT_ABORT_PHRASES]);

const ABORT_SLASH_RE = /^\/(stop|abort|cancel)(\s|$|@)/i;

// Strip leading @botname mentions ("@shumobot stop" → "stop"). Matches any
// @-prefixed word up to the first whitespace — loose because we check the
// remainder against an allowlist anyway.
const LEADING_MENTION_RE = /^@\S+\s+/;

// Trailing punctuation that doesn't change the meaning.
const TRAILING_PUNCT_RE = /[.!?,;:\s]+$/;

function normalize(text) {
  if (typeof text !== 'string') return '';
  return text
    .trim()
    .replace(LEADING_MENTION_RE, '')
    .replace(TRAILING_PUNCT_RE, '')
    .toLowerCase();
}

function isAbortRequest(text) {
  if (!text || typeof text !== 'string') return false;
  // ONLY slash commands trigger abort — no natural language guessing.
  // /stop, /abort, /cancel (optionally @-suffixed)
  return ABORT_SLASH_RE.test(text.trim());
}

module.exports = {
  isAbortRequest,
  ABORT_PHRASES,
  HARD_ABORT_PHRASES,
  SOFT_ABORT_PHRASES,
};
