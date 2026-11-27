import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  crossesSafetyLine,
  detectCoachLanguage,
  healthEscalationReply,
  mentionsHealthConcern,
  providerReviewReply,
  REPLY_LANGUAGE_RULE,
} from "../supabase/functions/_shared/coach-safety";

// The health stop catches the same worries in every language riders write in.
for (const message of [
  // en (the original list still works)
  "My horse is lame on the left fore",
  "she won’t eat this morning",
  "Is a fever after jumping normal?",
  // pt
  "Meu cavalo está mancando da mão esquerda",
  "A égua está manca desde ontem",
  "Ele está com cólica?",
  "o casco está inchado e quente",
  "Meu cavalo não está comendo",
  "ela não consegue se levantar",
  "Sinto que ele tem dor nas costas",
  "Que dose de remédio posso dar?",
  // es
  "Mi caballo cojea del anterior izquierdo",
  "Tiene fiebre y no come",
  "le duele el lomo",
  // ro
  "Calul meu șchiopătează pe piciorul stâng",
  "Iapa are febră și nu mănâncă",
  "Are o umflătură la genunchi",
  "Cred că îl doare spatele",
  // hu
  "A lovam sántít a bal elsőre",
  "A lovam lába fájdalmas és duzzadt",
  "Láza van és nem eszik",
]) {
  assert.equal(mentionsHealthConcern(message), true, message);
}

// Ordinary training questions stay with Ralf, including the words that look
// alike across languages and were left out on purpose.
for (const message of [
  "How do I improve my canter transitions?",
  "Como melhorar o galope do meu cavalo puro-sangue lusitano?",
  "Vou treinar na Santa Cruz amanhã, o que preparo?",
  "¿Cómo trabajo la flexión con mi caballo pura sangre?",
  "Ce poate mânca un cal înainte de concurs? Vreau un plan de antrenament.",
  "Am un cal pur-sânge, cum lucrez la galop?",
  "Hogyan javíthatok a lovam ügetésén?",
  "Pastele verzi sunt bune pentru antrenament?",
]) {
  assert.equal(mentionsHealthConcern(message), false, message);
}

// Language of the replies Equina writes itself.
const languageOf: Array<[string, ReturnType<typeof detectCoachLanguage>]> = [
  ["My horse is lame on the left fore", "en"],
  ["Meu cavalo está mancando da mão esquerda", "pt"],
  ["Ele está com cólica?", "pt"],
  ["Mi caballo cojea del anterior izquierdo", "es"],
  ["¿Mi yegua tiene fiebre?", "es"],
  ["Calul meu șchiopătează pe piciorul stâng", "ro"],
  ["Calul nu mananca", "ro"],
  ["A lovam sántít a bal elsőre", "hu"],
  ["Láza van és nem eszik", "hu"],
  ["colic?", "en"],
  ["", "en"],
];
for (const [message, language] of languageOf) {
  assert.equal(detectCoachLanguage(message), language, message);
}

// The fixed vet reply follows the rider's language and keeps its meaning.
assert.match(healthEscalationReply("My horse is lame"), /^Pause training and contact your veterinarian/);
assert.match(healthEscalationReply("Meu cavalo está mancando"), /^Pare o treino e fale com o seu veterinário/);
assert.match(healthEscalationReply("Mi caballo cojea"), /^Detén el entrenamiento y habla con tu veterinario/);
assert.match(healthEscalationReply("Calul meu șchiopătează"), /^Oprește antrenamentul și sună medicul veterinar/);
assert.match(healthEscalationReply("A lovam sántít"), /^Szüneteltesd az edzést, és fordulj az állatorvoshoz/);
for (const message of ["My horse is lame", "Meu cavalo está mancando", "Mi caballo cojea", "Calul meu șchiopătează", "A lovam sántít"]) {
  const reply = healthEscalationReply(message);
  assert.ok(reply.length < 420, reply);
  // A fixed reply never trips the provider check that would replace it.
  assert.ok(/diagn/i.test(reply), "each reply still says it cannot diagnose");
  assert.ok(!/[*#_`]/.test(reply), "plain text for the chat bubble");
  assert.ok(!/[*#_`]/.test(providerReviewReply(message)));
}
assert.match(providerReviewReply("Meu cavalo pode voltar a saltar?"), /^Não posso fazer diagnósticos/);
assert.match(providerReviewReply("Pot să sar cu calul mâine?"), /^Nu pot pune diagnostice/);

// The provider check reads every language too.
for (const reply of [
  "Based on this I would diagnose a tendon strain.",
  "Isso parece uma tendinite; o diagnóstico mais provável é...",
  "Le recetaría un antiinflamatorio.",
  "Diagnosticul probabil este o entorsă.",
  "A diagnózis valószínűleg ínhúzódás.",
  "Posso prescrever um anti-inflamatório.",
]) {
  assert.equal(crossesSafetyLine(reply), true, reply);
}
for (const reply of [
  "Next step: ride three relaxed transitions on each rein.",
  "Próximo passo: faça três transições tranquilas em cada mão.",
  "Pasul următor: trei tranziții liniștite pe fiecare mână.",
  // Spanish "receta" is also a recipe; only "recetar" counts.
  "Una buena receta: calentamiento largo y pausas cortas.",
]) {
  assert.equal(crossesSafetyLine(reply), false, reply);
}

// The function wires all of it in, and the English-only patterns are gone.
const coachChat = readFileSync(join(process.cwd(), "supabase/functions/coach-chat/index.ts"), "utf8");
assert.ok(coachChat.includes("mentionsHealthConcern(input.message)"));
assert.ok(coachChat.includes("healthEscalationReply(input.message)"));
assert.ok(coachChat.includes("crossesSafetyLine(responseText)"));
assert.ok(coachChat.includes("providerReviewReply(input.message)"));
assert.ok(coachChat.includes("REPLY_LANGUAGE_RULE,"));
assert.ok(!coachChat.includes("const healthPattern"));
assert.ok(!coachChat.includes("Pause training and contact your veterinarian"));
assert.match(REPLY_LANGUAGE_RULE, /language of RIDER_MESSAGE_AS_DATA/);
assert.match(REPLY_LANGUAGE_RULE, /labels/);
