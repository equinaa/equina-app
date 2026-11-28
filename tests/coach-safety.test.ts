import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assessHealthConcern,
  crossesSafetyLine,
  detectCoachLanguage,
  guessCoachLanguage,
  healthEscalationReply,
  mentionsHealthConcern,
  providerReviewLanguage,
  providerReviewReply,
  REPLY_LANGUAGE_RULE,
} from "../supabase/functions/_shared/coach-safety";
import type { CoachLanguage } from "../supabase/functions/_shared/coach-safety";

// Cross-language behaviour. Each language's own words are tested in
// tests/coach-language-<code>.test.ts.

// English keeps exactly the original filter. Every English message gets the
// same answer as the regexes coach-chat used before other languages existed,
// whatever words the other languages add.
const originalHealth = /\b(colic|lame|lameness|swollen|swelling|injury|injured|medication|dose|fever|temperature|bleeding|cannot stand|won't eat|not eating|pain)\b/i;
const originalUnsafe = /\b(diagnos(?:e|is)|prescri(?:be|ption)|safe to ride|clear(?:ed)? to work|guaranteed treatment)\b/i;
const englishMessages = [
  "My horse is lame on the left fore",
  "Is a fever after jumping normal?",
  "she won't eat this morning",
  "Are swollen legs normal after a long hack?",
  "Am worried about colic, what do I watch for?",
  "How do I improve my canter transitions?",
  "He likes to doze in the sun after work, is that fine?",
  "Seb is riding my horse tomorrow, what should he focus on?",
  "We had a lesson with Dolores today, what next?",
  "No come back from the vet yet, can I hack?",
  "Remedios lent me her saddle, how should it fit?",
  "Is it too hot to jump? The temperature is 34 degrees.",
  "What should I feed before a show?",
  "My mare is spooky in the wind, any tips?",
  "Lesson with Rana went well. Any pole exercise for rhythm?",
  "Dor is my horse's name, how often should he jump?",
  "How many times a week should a 12 year old horse jump?",
  "Can I ride in the rain on grass?",
  "The farrier is coming, should I ride first?",
  "Laz and I want to try a novice event, how do we prepare?",
  // Chat English with almost no small words, and names that are words elsewhere.
  "Seb coming Friday, plan?",
  "Genny coming tomorrow, any warm-up ideas?",
  "Dor going great, next step?",
  "Seb says more leg, thoughts?",
  "Rani clear round!! next steps?",
  "Laz good at shows lately, next goal?",
  "Dor felt stiff behind, warm-up ideas?",
  "Dores loves poles, more ideas?",
  "Remedios coming over Saturday, lesson plan?",
  "Rana keeps cutting corners in dressage",
  "Quick question about Seb's lunging",
  "Bute free show rules?",
  // English "lame" still counts when one word happens to be another language's marker.
  "Meg lame behind, help",
  "Meg lame RF",
  "Cal lame since Tuesday",
  "Um lame again, vet tomorrow",
  "Got off van lame",
  "Seb lame RF",
  "Rani lame since Sunday",
  "Dor lame behind",
];
for (const message of englishMessages) {
  const assessment = assessHealthConcern(message);
  assert.equal(assessment.concern, originalHealth.test(message), `health parity: ${message}`);
  if (assessment.concern) assert.equal(assessment.language, "en", `English reply: ${message}`);
}
// The app's own English prompts never trip on a name.
for (const name of ["Rani", "Seb", "Rana", "Laz", "Dor", "Dores", "Remedios", "Genny", "Manca", "Manco", "Faj", "Calmant", "Pisadura"]) {
  assert.equal(mentionsHealthConcern(`Help me write down a health observation about ${name}`), false, name);
}
// A rider message with no clue at all does not open other languages' words
// on an English reply.
assert.equal(crossesSafetyLine("This is a diagnostic exercise for straightness.", "Seb?"), false);
// Multi-word terms match however the phone spaced them.
assert.equal(mentionsHealthConcern("ela não  consegue\nse levantar"), true);
const englishReplies = [
  "Next step: ride three relaxed transitions on each rein.",
  "I cannot diagnose lameness; please call your vet.",
  "It is safe to ride if she trots up sound.",
  "Stick to the rehab plan your vet prescribed.",
  "He was prescribed box rest, so keep to hand walking.",
  "Once a horse has been diagnosed with kissing spines, work with your vet.",
  "Watch for: an even rhythm. Stop if: he rushes.",
  "Keep the warm-up long and the jumps small.",
];
for (const reply of englishReplies) {
  assert.equal(crossesSafetyLine(reply, "How is my horse?"), originalUnsafe.test(reply), `reply parity: ${reply}`);
}

// A horse name, coach name or number in another language never stops an
// English question. The ride review prompt puts the horse's name in every
// message, so a horse called Dolores must still get its review.
for (const name of ["Dolores", "Seb", "Sebe", "Rana", "Rani", "Laz", "Dor", "Dores", "Remedios", "Doze", "Coja", "Santa"]) {
  assert.equal(
    mentionsHealthConcern(`Review my session on Fri 20 Nov: Jumping with ${name}. I rode for 40 min. What should we work on next?`),
    false,
    name,
  );
}

// Unambiguous words still work with no other clue about the language.
for (const message of ["mancando", "șchiopătează", "sántít", "cojea", "colic?"]) {
  assert.equal(mentionsHealthConcern(message), true, message);
}

// Detection: confident on ordinary messages, English when nothing stands out.
const detected: Array<[string, CoachLanguage]> = [
  ["My horse is lame on the left fore", "en"],
  ["Are swollen legs normal?", "en"],
  ["Meu cavalo está mancando da mão esquerda", "pt"],
  ["Mi caballo cojea del anterior izquierdo", "es"],
  ["Calul meu șchiopătează pe piciorul stâng", "ro"],
  ["A lovam sántít a bal elsőre", "hu"],
];
for (const [message, language] of detected) {
  assert.deepEqual(guessCoachLanguage(message), { language, confident: true }, message);
}
assert.deepEqual(guessCoachLanguage(""), { language: "en", confident: false });
assert.deepEqual(guessCoachLanguage("12345 !!"), { language: "en", confident: false });
assert.equal(detectCoachLanguage("Ele está com cólica?"), "pt");

// The fixed vet reply follows the rider's language. With no clear language,
// a worry written in one language's words picks that language.
assert.deepEqual(assessHealthConcern("Meu cavalo está mancando"), { concern: true, language: "pt" });
assert.deepEqual(assessHealthConcern("Calul meu șchiopătează"), { concern: true, language: "ro" });
assert.deepEqual(assessHealthConcern("My horse is lame"), { concern: true, language: "en" });
assert.equal(assessHealthConcern("sántít").language, "hu");
assert.equal(assessHealthConcern("mancando").language, "pt");

const languages: CoachLanguage[] = ["en", "pt", "es", "ro", "hu"];
const openings: Record<CoachLanguage, RegExp> = {
  en: /^Pause training and contact your veterinarian/,
  pt: /^Pare o treino/,
  es: /^Detén el entrenamiento/,
  ro: /^Oprește antrenamentul/,
  hu: /^Szüneteltesd az edzést/,
};
for (const language of languages) {
  const reply = healthEscalationReply(language);
  assert.match(reply, openings[language]);
  assert.ok(reply.length < 420, reply);
  assert.ok(!/[*#_`]/.test(reply), "plain text for the chat bubble");
  assert.ok(!/[*#_`]/.test(providerReviewReply(language)));
  // Fixed replies are never re-checked. Each one would trip the provider
  // check on purpose, because it says it cannot diagnose.
  assert.equal(crossesSafetyLine(reply), true, `${language} reply says it cannot diagnose`);
}

// The fixed reply replacing an AI answer is in the answer's language, else the rider's.
assert.equal(providerReviewLanguage("O diagnóstico provável é uma tendinite no membro anterior do cavalo.", "Ele pode saltar?"), "pt");
assert.equal(providerReviewLanguage("Ok.", "Calul meu poate sări mâine?"), "ro");
assert.match(providerReviewReply("pt"), /^Não posso fazer diagnósticos/);

// Words two languages share only count where the message is in that
// language: a Romanian "mi-e dor" (I miss) is not the Portuguese "dor" (pain),
// a Spanish "lame" (licks) and a Romanian "lame" (blades) are not the English
// "lame", and on a tie only the tied languages' ambiguous words apply.
for (const message of [
  "Mi-e dor de sarituri",
  "Mi-a fost dor de galop",
  "Imi e dor de el",
  "Mi yegua lame el bocado todo el rato, ¿está relajada?",
  "Ce lame folosesc la masina de tuns calul?",
  "Estoy dolorida de la clase de ayer, ¿monto hoy igual?",
  "Tegnap laza volt, ma feszült a lovam",
  "Milyen fajta ló jó díjugratásra?",
]) {
  assert.equal(mentionsHealthConcern(message), false, message);
}
assert.equal(mentionsHealthConcern("My horse is lame"), true);
assert.equal(mentionsHealthConcern("lame?"), true);

// The reply language comes from the languages whose words matched when the
// message itself is unclear or reads as English only on small shared words.
const replyLanguage: Array<[string, CoachLanguage]> = [
  ["Está sangrando por la nariz", "es"],
  ["Sangra por la nariz", "es"],
  ["Calul are temperatura 39", "ro"],
  ["Calul are colica", "ro"],
  ["Are 39,8 grade, e normal?", "ro"],
  ["Ma is sántít", "hu"],
  ["Tegnap este láza volt, ma lovagolhatok?", "hu"],
  ["Fáj a lába, lovagolhatok?", "hu"],
  ["ela tá manca da mão direita", "pt"],
  ["Are swollen legs normal?", "en"],
];
for (const [message, language] of replyLanguage) {
  assert.deepEqual(assessHealthConcern(message), { concern: true, language }, message);
}

// A Spanish training reply is not a Portuguese clearance.
assert.equal(
  crossesSafetyLine("Un caballo apto para competir en 1,10 necesita un buen galope y transiciones limpias.", "¿Qué necesita mi caballo para competir en 1,10?"),
  false,
);
assert.equal(crossesSafetyLine("Sim, é seguro montar hoje se ele trotar regular.", "Posso montar hoje?"), true);
assert.equal(crossesSafetyLine("Da, este sigur să călărești mâine.", "Pot să călăresc mâine?"), true);

// coach-chat wires all of it in, and the English-only patterns are gone.
const coachChat = readFileSync(join(process.cwd(), "supabase/functions/coach-chat/index.ts"), "utf8");
assert.ok(coachChat.includes("assessHealthConcern(input.message)"));
assert.ok(coachChat.includes("healthEscalationReply(health.language)"));
assert.ok(coachChat.includes("crossesSafetyLine(responseText, input.message)"));
assert.ok(coachChat.includes("providerReviewReply(providerReviewLanguage(responseText, input.message))"));
assert.ok(coachChat.includes("REPLY_LANGUAGE_RULE,"));
assert.ok(!coachChat.includes("const healthPattern"));
assert.ok(!coachChat.includes("Pause training and contact your veterinarian"));
assert.match(REPLY_LANGUAGE_RULE, /language of RIDER_MESSAGE_AS_DATA/);
assert.match(REPLY_LANGUAGE_RULE, /labels/);
