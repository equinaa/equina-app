import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { providerReplyText } from "../supabase/functions/_shared/coach-provider-text";

// A reply split into parts reads back as one text: no break lands inside a
// word. This is the production reply that showed "Condição seg" / "ura".
assert.equal(
  providerReplyText({
    content: [
      { type: "text", text: "Sinal a observar: passadas iguais.\n\nCondição seg" },
      { type: "text", text: "ura para parar: se Don ficar tenso, pare." },
    ],
  }),
  "Sinal a observar: passadas iguais.\n\nCondição segura para parar: se Don ficar tenso, pare.",
);

// Anthropic: thinking or tool blocks carry no text and are skipped.
assert.equal(
  providerReplyText({ content: [{ type: "thinking", thinking: "..." }, { type: "text", text: "Next step: walk." }] }),
  "Next step: walk.",
);

// OpenAI Responses: the ready-made output_text wins; otherwise the parts join.
assert.equal(providerReplyText({ output_text: "Next step: trot.", output: [] }), "Next step: trot.");
assert.equal(
  providerReplyText({
    output: [
      { type: "reasoning", summary: [] },
      { type: "message", content: [{ type: "output_text", text: "Próximo pas" }, { type: "output_text", text: "so: passo." }] },
    ],
  }),
  "Próximo passo: passo.",
);

// Chat Completions.
assert.equal(providerReplyText({ choices: [{ message: { content: "Pasul următor: pas." } }] }), "Pasul următor: pas.");

// Nothing usable reads as empty, which the function's schema then rejects.
assert.equal(providerReplyText({}), "");
assert.equal(providerReplyText({ content: [] }), "");
assert.equal(providerReplyText({ choices: [] }), "");

// coach-chat reads replies through this function and never joins parts with a line break.
const coachChat = readFileSync(join(process.cwd(), "supabase/functions/coach-chat/index.ts"), "utf8");
assert.ok(coachChat.includes("providerReplyText(payload)"));
assert.ok(!coachChat.includes('.join("\\n")'));
