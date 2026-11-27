import assert from "node:assert/strict";
import { romanian } from "../supabase/functions/_shared/coach-language-ro";
import {
  assessHealthConcern,
  crossesSafetyLine,
  foldForMatching,
  guessCoachLanguage,
  healthEscalationReply,
  mentionsHealthConcern,
  providerReviewReply,
} from "../supabase/functions/_shared/coach-safety";

// Romanian. Riders often type on the phone without diacritics, so most
// messages come in both spellings. Cross-language behaviour is tested in
// tests/coach-safety.test.ts.

// Health worries stop the AI and get the Romanian vet reply.
const healthMessages = [
  // Colic.
  "Calul meu are colici de azi dimineata",
  "Cred ca iapa face colica, ce fac?",
  "Il doare burta, nu stiu ce sa fac",
  "Iapa are crampe la burta de o ora",
  "nu a facut balegar de ieri si sta intins",
  "Mi-a zis antrenorul ca are colici",
  // Lameness.
  "Calul meu șchiopătează pe piciorul stâng",
  "Calul meu schioapata de piciorul stang din fata",
  "e schiop de ieri",
  "Iapa e schioapa dupa show",
  "A inceput sa schiopateze dupa concurs",
  "nu calca bine pe piciorul din spate",
  "merge sontac-sontac de cand l-am potcovit",
  "nu pune piciorul jos",
  // Swelling, heat, inflammation.
  "i s-a umflat genunchiul",
  "Mi se pare ca e umflat",
  "Are o umflatura la genunchi",
  "are o umflatura la jaret",
  "Genunchiul se umflă după lucru",
  "S-a umflat sub chingă",
  "tendonul e cald la atingere",
  "Cred ca are tendinita la stangul din fata",
  "are edem la picioarele din spate",
  "Cred ca are un abces la copita",
  "are puroi la copita",
  "cred ca are laminita",
  "ii lacrimeaza ochiul stang",
  "tine ochiul inchis de azi",
  // Wounds and injuries.
  "s-a taiat la picior in gard",
  "s-a lovit in boxa noaptea trecuta",
  "calul s-a accidentat la antrenament",
  "s-a ranit la cap",
  "Cum îngrijesc rănile de la picior?",
  "Cum ingrijesc ranile de la picior?",
  "Are o rană la picior",
  "Calul are rani pe spate",
  "Rana e infectata",
  "are o taietura adanca deasupra copitei",
  "Am gasit-o cu o zgarietura mare pe piept",
  "Cred ca are o ruptura de tendon",
  // Medication and dosing.
  "Cat bute ii pot da?",
  "Pot sa-i dau un antiinflamator?",
  "Ce antibiotic ii dau pentru rana?",
  "Ce tratament sa-i fac?",
  "Cum dozez fenilbutazona?",
  "Ce doza de flunixin ii dau?",
  "Pot sa-i dau un calmant inainte de transport?",
  "I-am facut o injectie cu dexametazona, pot sa-l calaresc?",
  "Cat medicament ii dau?",
  // Fever.
  "are febra 39.5",
  "febra mare de ieri",
  "Mi se pare ca are febra",
  "Iapa are febră și nu mănâncă",
  "Calul are temperatură mare de aseară",
  "Ce temperatură are calul? 39.5",
  // Bleeding, breathing, choke.
  "Ii curge sange din nas dupa galop",
  "sangereaza din nas",
  "are sange in urina",
  "s-a inecat cu peleti",
  "ii iese mancare pe nas",
  "respira greu dupa efort",
  "tuseste de o saptamana",
  "cred ca a facut rabdomioliza",
  "Se tăvălește mult și transpiră, cred că e colică",
  "Are diaree de ieri",
  // Not eating, not drinking, down.
  "nu vrea sa manance de azi dimineata",
  "Nu vrea să mănânce de azi dimineață",
  "nu a mancat nimic aseara",
  "n-a mancat fanul",
  "nu are pofta de mancare",
  "refuza mancarea de doua zile",
  "nu mai bea apa de ieri",
  "Nu se mai ridică de jos",
  "nu poate sa se ridice",
  "sta culcat si nu se scoala",
  "a cazut in boxa si nu se poate ridica",
  // Pain.
  "Ce pot face pentru durerea de spate a calului?",
  "Calul are dureri",
  "o doare spatele",
  "Il doare spatele dupa antrenament",
  "Cred că îl doare spatele",
  "pare dureroasa la atingere pe spate",
  "il dor picioarele dupa concurs",
  // Colic signs riders describe without the word: looking at or kicking the belly, rolling non-stop.
  "calu meu sta mult culcat azi si se uita la burta, e normal?",
  "Se tavaleste in boxa si se uita la burta",
  "Se uită mereu la burtă și dă cu piciorul în burtă",
  "Pare ca se uita mereu spre flanc si nu mananca",
  "transpira si se tavaleste intruna in boxa",
  // Hoof and leg: not bearing weight, a nail, folk "înfundare" (laminitis), filled legs.
  "nu se sprijina deloc pe piciorul drept din spate",
  "a calcat intr-un cui in padoc, ce fac?",
  "potcovarul a batut un cui in copita prea adanc si acum schiopateaza",
  "veterinarul zice ca e infundare, ce fac acum?",
  "are apa in picioare dimineata",
  // Injuries written with "și-a", scrapes and sprains.
  "si-a julit genunchii cand a cazut pe asfalt",
  "și-a rupt piciorul în padoc",
  "Si-a lovit rau capul de bara boxei",
  "Cred că are o entorsă la fesă",
  "Iapa e rănită la picior",
  "Iapa e ranita la picior",
  // Painkillers asked about by name, with "pot să-i" or the phone "i".
  "Cat paracetamol ii pot da unui cal de 500 kg?",
  "Cât paracetamol pot să-i dau?",
  // Dark urine after work (tying up), nasal discharge, cough.
  "Calul meu are urina maro după antrenament",
  "A intepenit complet dupa antrenament si urina e inchisa la culoare",
  "are scurgeri galbene din nas de 3 zile",
  "ii curge nasul de ieri",
  "are muci galbeni si tuseste",
  "Calul meu tușește la galop",
  // More everyday phrasings, typed on the phone.
  "Iapa mea are ochiul stang umflat si lacrimeaza de aseara",
  "Am observat ca schiopateaza usor la trap pe cerc la dreapta",
  "nu mai mananca fan de 2 zile, doar bea apa",
  "Ce doza de bute pot sa-i dau dupa concurs?",
  "s-a taiat la fluier in remorca si sangereaza putin",
  "are o umflatura calda pe tendon, pot sa-l lucrez usor?",
  "calul tuseste cand incepem galopul, de vreo saptamana",
  "iapa e balonata si nu a facut balegar azi",
  "a facut febra dupa vaccin, are 39.2",
  "i s-a umflat burta dupa ce a mancat lucerna uda",
  "calu' nu vrea sa manance ovazul de azi dimineata, ce sa fac?",
  "dupa concurs a ramas cu tendonul cald si putin umflat",
  "pls ajutor, s-a lovit la ochi si nu-l deschide",
  "Calul are o rană deschisă pe crupă",
  "S-a umflat la gat dupa vaccin",
];
assert.ok(healthMessages.length >= 50);
for (const message of healthMessages) {
  assert.deepEqual(assessHealthConcern(message), { concern: true, language: "ro" }, message);
}

// "are" (has) also counts for English. A Romanian body or symptom word ties it, and the
// Romanian term alone then picks the Romanian reply; two of them make Romanian sure.
for (const message of [
  "are tuse si muci",
  "are conjunctivita",
  "are o plaga deschisa la crupa",
  "are rani pe gat de la muste si se scarpina mult",
  "are puroi la copita",
  "Are diaree de ieri",
  "are diaree de 2 zile si e abatut",
  "are laminita",
  "are abces la copita",
  "are edem la picioare",
  "are o umflatura la jaret",
]) {
  assert.deepEqual(assessHealthConcern(message), { concern: true, language: "ro" }, message);
}

// Ordinary riding, feeding, tack and weather questions get an answer.
const ordinaryQuestions = [
  // "Mi-e dor" is "I miss", not Portuguese "dor" (pain).
  "Mi-e dor de calul meu, nu l-am mai calarit de o luna. Cum reincep antrenamentul?",
  "Mi-e dor de calul meu, nu am mai călărit de o lună",
  "Mi-e dor să sar obstacole, de unde încep?",
  "Mi-e dor sa sar",
  "Îmi e dor de concursuri",
  "Mi-a fost dor de iapa mea",
  "Ne e dor de călărie",
  // Weather, not the horse's temperature.
  "La ce temperatura e prea cald sa calaresc vara?",
  "Temperatura afara e 35 de grade, sa lucrez calul azi?",
  "La ce temperatură îi pun pătura iarna?",
  "E prea frig pentru antrenament la minus 10 grade?",
  "Ploua de trei zile, lucrez in manej?",
  // A horse that blows out at the girth.
  "Iapa mea se umflă când îi strâng chinga, cum o dezvăț?",
  "Calul se umfla cand strang chingile, e normal?",
  "Vreau sa umflu mingea mare pentru lucru la pamant",
  // The rider's own soreness.
  "Am febră musculară după lecția de ieri, pot să călăresc azi?",
  "Febra musculara dupa lectie, pot calari?",
  "Mă doare spatele când fac trap ușor, ce greșesc?",
  "Mă dor picioarele după lecție, e normal?",
  "Cum scap de febra dinaintea concursului?",
  // Lifting the forehand, not getting up.
  "Calul nu se ridica in fata la galop, ce exercitii fac?",
  "Calul meu nu se ridică din spate la trap strâns",
  // A ration of feed, not a dose of medicine.
  "Care e doza corecta de ovaz pentru un cal de sport?",
  "Ce doza zilnica de electroliti ii dau vara?",
  "Ce sa ii dau de mancare inainte de concurs?",
  "Cat ovaz pe zi pentru un cal de 500 kg?",
  "Ce poate mânca un cal înainte de concurs? Vreau un plan de antrenament.",
  "Ce tratament împotriva muștelor folosiți vara?",
  // Rough terrain, no appetite for work, a turn at the show.
  "Cum lucrez calul pe teren accidentat?",
  "Terenul e accidentat, cum lucrez calul?",
  "Calul nu are poftă de lucru azi, cum îl motivez?",
  "Am rând la concurs la ora 10, cum mă încălzesc?",
  "Câte rânduri de bare pun la gimnastică?",
  // Blood lines and a warmed-up horse.
  "Am un cal pur-sânge, cum lucrez la galop?",
  "Cum lucrez pe doua piste cu un cal pur-sange?",
  "Am un cal de sange cald din Germania, cum il incalzesc?",
  "Calul e cald dupa incalzire, pot sa sar?",
  "Calul a lovit bara la oxer, cum il invat sa ridice picioarele?",
  "Iapa mea are temperament, cum o calmez?",
  // Everyday training.
  "Doar 20 de minute de trap sunt suficiente?",
  "Cum fac tranzitii mai bune la galop?",
  "Ce exercitii de dresaj pentru incovoiere?",
  "Cum invat calul sa faca schimbari de picior?",
  "Ce sa fac daca refuza obstacolul la oxer?",
  "Cum ajustez scaritele pentru jumping?",
  "Ce zabala e mai blanda pentru un cal tanar?",
  "Ce marime de sa pentru un cal lusitano?",
  "Martingala fixa sau alergatoare?",
  "Cum ma pregatesc pentru primul concurs de dresaj?",
  "Ce rasa e mai buna pentru obstacole, holsteiner sau KWPN?",
  "Cum fac cavaletti la trap?",
  "Iapa e in calduri si nu se concentreaza la antrenament",
  "Calul meu e tare la mana stanga, cum il inmoi?",
  "Calul e înțepenit pe mâna stângă, ce exerciții fac?",
  "Cum il fac sa nu mai traga de frau?",
  "Pot sa sar cu calul maine?",
  "Antrenorul zice ca are nevoie de mai multa impulsie",
  "Cum ii fac coama impletita pentru concurs?",
  "Ce cizme sunt mai bune pentru calarie?",
  "Fac pauza de doua saptamani, cum il readuc in forma?",
  "Ce program de antrenament pentru un cal de 4 ani?",
  "Pastele verzi sunt bune pentru antrenament?",
  "Cum lucrez la tranzitii cu iapa mea?",
  "Am un cal tanar, cat de des sa sar?",
  "Calul meu are 12 ani, pot sari de doua ori pe saptamana?",
  "Mi-e frică să sar oxerul",
  "Calul meu se sperie de bara albastră",
  "Câte ture de trap fac?",
  "Cum dozez efortul la antrenament?",
  "Ce supliment calmant recomandati?",
  "Nu se ridica bine la galop, ce exercitii?",
  "Cum ii fac tratament la copite cu ulei?",
  // A habit ("doesn't eat carrots from my hand") is not going off feed; "nu mai mănâncă" is.
  "Calul nu mananca morcovi din mana, cum il obisnuiesc?",
  "Nu mănâncă mere, doar morcovi, ce recompensă îi dau?",
  // The rider pumped up the tyres or a ball.
  "Am umflat rotile la remorca, ce presiune pun?",
  "Am umflat roțile la remorcă",
  "Ai umflat roțile la remorcă înainte de drum?",
  "Am umflat mingea pentru joacă în manej",
  // Leaning on the bit, and lifting the forehand, are riding.
  "Calul nu se sprijina pe frau deloc, cum il fac sa caute contactul?",
  "Calul nu se sprijină pe zăbală, e prea ușor în mână",
  "nu poate sa se ridice in fata la galop, ce exercitii ii dau?",
  "Nu poate să se ridice în galop strâns, ce fac?",
  // The water's temperature, not the horse's.
  "Ce temperatura are apa din adapatoare iarna, e prea rece?",
  "Ce temperatură are apa la duș pentru cal?",
  // "Mi-e dor" questions with a Romanian clue besides "mi": the Portuguese "dor" stays out.
  "Mi-e dor de competitii, cand incepe sezonul indoor?",
  "Mi-e dor de sarituri, cum ma apuc iar?",
  "Mi-a fost dor de ea, cum ma apuc iar?",
  "Mie dor de calarie, cand pot incepe iar?",
  "Mi-e dor de concursuri, ce sa fac iarna?",
  // Rolling after a bath, leaks, farrier nails, the rider's leg, calming herbs, broken tack.
  "Îi dau cu piciorul în burtă și tot nu pleacă la galop",
  "Se tăvălește după baie, e normal?",
  "Se tăvălește de câteva ori după lucru în padoc",
  "Am scurgeri la adăpătoare, cum le repar?",
  "Câte cuie pune potcovarul la o potcoavă?",
  "Ce supliment calmant natural pot să-i dau înainte de concurs?",
  "Pot să-i dau un calmant natural pe bază de plante înainte de transport?",
  "Am rupt frâul la antrenament, ce frâu nou să iau?",
  "S-a rupt chinga la concurs, ce marcă e mai rezistentă?",
  // More everyday training, tack and stable questions, typed on the phone.
  "Cum il fac sa ia galopul pe piciorul corect?",
  "Iapa mea nu vrea sa intre in remorca, ce fac?",
  "Cat de des sa fac lucru la pamant cu un manz de 2 ani?",
  "Cum il obisnuiesc cu prelata si cu umbrela?",
  "Am concurs de obstacole la 1m sambata, cum il pregatesc?",
  "Ce fan e mai bun, de lucerna sau de pajiste?",
  "Cum ii strang chinga fara sa se umfle?",
  "Calul se sperie de tractor, cum il desensibilizez?",
  "Cand e timpul sa schimb potcoavele de iarna?",
  "E ok sa-i dau mere si morcovi dupa antrenament?",
  "Pot sa-i fac baie cu apa rece vara dupa lucru?",
  "Vreau sa ii fac o doza de lucru mai usoara saptamana asta",
  "Ce fac cu un cal care mananca prea repede ovazul?",
  "Nu mai vrea sa sara oxerul, refuza de fiecare data",
  "Am o iapa de 3 ani, cand incep sa o calaresc?",
  "Cum ii curat copitele si cat de des?",
  "nush ce sa fac, nu vrea sa mearga inainte la pas",
  "Antrenorul mi-a zis sa lucrez mai mult fara scarite",
  "Calul e cald si transpirat dupa lucru, cand ii pun patura?",
  "Ce tratament fac pentru piele uscata la coama? sampon sau ulei?",
  "Cum ii tai copitele daca potcovarul nu vine?",
  "Ea e iapa mea nouă, cum o obișnuiesc cu grajdul?",
  "Noi lucrăm de trei ori pe săptămână, e suficient?",
  "Iar nu vrea să intre în apă la cross, cum o ajut?",
];
assert.ok(ordinaryQuestions.length >= 50);
for (const message of ordinaryQuestions) {
  assert.equal(mentionsHealthConcern(message), false, message);
}

// Romanian is told apart confidently, with or without diacritics, also in
// short messages and in ones that start with the Spanish-looking "Mi".
const romanianMessages = [
  "Calul meu șchiopătează pe piciorul stâng",
  "Calul meu schiopateaza",
  "Calul nu mananca",
  "Calul are febra",
  "Iapa are febra",
  "e schiop de ieri",
  "sangereaza din nas",
  "febra mare de ieri",
  "s-a ranit la cap",
  "i s-a umflat genunchiul",
  "Mi se pare ca are febra",
  "Mi se pare ca e umflat",
  "Mi-a zis antrenorul ca are colici",
  "Mi-e dor sa sar",
  "Mi-e dor de calul meu, nu am mai calarit de o luna",
  "Il doare spatele dupa antrenament",
  "Cred ca iapa face colica, ce fac?",
  "nu vrea sa manance de azi dimineata",
  "Pot sa sar cu calul maine?",
  "Cum fac tranzitii mai bune la galop?",
  "La ce temperatura e prea cald sa calaresc vara?",
  "Temperatura afara e 35 de grade, sa lucrez calul azi?",
  "Ploua de trei zile, lucrez in manej?",
  "Doar 20 de minute de trap sunt suficiente?",
  "Ce sa ii dau de mancare inainte de concurs?",
  "Cum il fac sa nu mai traga de frau?",
  "Antrenorul zice ca are nevoie de mai multa impulsie",
  "Calul meu are 12 ani, pot sari de doua ori pe saptamana?",
  "Câte ture de trap fac?",
  "are tuse si muci",
  "tuseste de o saptamana",
  "are puroi la copita",
  "Are diaree de ieri",
  "Mi-e dor de competitii, cand incepe sezonul indoor?",
  "Mi-a fost dor de ea, cum ma apuc iar?",
  "Mie dor de calarie, cand pot incepe iar?",
  "Pe rand, fiecare la obstacol",
];
assert.ok(romanianMessages.length >= 25);
for (const message of romanianMessages) {
  assert.deepEqual(guessCoachLanguage(message), { language: "ro", confident: true }, message);
}

// Romanian words and markers never claim another language's message.
for (const message of [
  "Mi caballo cojea del anterior izquierdo",
  "no se si cojea",
  "No quiere competir este fin de semana",
  "Meu cavalo tem doze anos, posso saltar 1 metro?",
  "Tenho doze provas este ano",
  "Ma este kólikás lett",
  "Am worried about colic",
  "Are swollen legs normal?",
]) {
  assert.notEqual(guessCoachLanguage(message).language, "ro", message);
}
for (const message of [
  "Meu cavalo tem doze anos, posso saltar 1 metro?",
  "Treinei doze minutos de trote hoje",
  "¿Cómo limpio bien la rana del casco?",
  // Spanish "la rana la limpio" (the frog of the hoof), the name "Ranita", and Latin
  // American "le tusé las crines" (I trimmed the mane).
  "La rana la limpio con el gancho todos los días, ¿está bien?",
  "¿La rana la tengo que recortar antes de herrar?",
  "Mi yegua se llama Ranita y es muy nerviosa en pista",
  "Ayer le tusé las crines para el concurso",
]) {
  assert.equal(mentionsHealthConcern(message), false, message);
}

// The always-on Romanian words never match ordinary sentences or names in the other
// languages, and the Romanian markers never claim them.
const romanianAlwaysOn = new RegExp(`\\b(?:${romanian.health.join("|")})\\b`);
const otherLanguages: Array<[string, "en" | "pt" | "es" | "hu"]> = [
  ["My coach Rani says I should sit deeper in the canter", "en"],
  ["Dolores and Seb are coming to the show with Laz and Coja", "en"],
  ["He likes to doze in the sun after work, is that fine?", "en"],
  ["Should I use a gag or a pelham for cross country?", "en"],
  ["What grade is the course at the regional show on Sunday?", "en"],
  ["The din in the indoor arena makes her spooky", "en"],
  ["Is it ok to ride in the rain if the arena is sandy?", "en"],
  ["Santa brought me new tendon boots, how tight should they be?", "en"],
  ["Meu cavalo tem doze anos, quantas vezes por semana devo saltar?", "pt"],
  ["Vem cá, como faço o cavalo ficar mais leve na mão?", "pt"],
  ["Ela cai muito para dentro na curva, o que faço?", "pt"],
  ["A Dores vai montar a égua comigo no sábado", "pt"],
  ["O tratamento do casco com óleo é bom no inverno?", "pt"],
  ["Ele respira fundo e relaxa depois do trote", "pt"],
  ["Qual a temperatura ideal da água para dar banho no cavalo?", "pt"],
  ["La rana la limpio con el gancho todos los días, ¿está bien?", "es"],
  ["¿La rana la tengo que recortar antes de herrar?", "es"],
  ["Mi yegua se llama Ranita y es muy nerviosa en pista", "es"],
  ["Ayer le tusé las crines para el concurso", "es"],
  ["Hoy tuve clase con Dolores, ¿qué trabajo mañana?", "es"],
  ["Si cojo las riendas más cortas se pone tenso", "es"],
  ["¿Cuántas veces a la semana salto con mi caballo de doce años?", "es"],
  ["El tendón está fuerte, ¿puedo saltar más alto?", "es"],
  ["A múlt héten nagyon jól ugrott a lovam", "hu"],
  ["Hogyan tusoljam le a lovat edzés után?", "hu"],
  ["Sebastian lovagol holnap a kancámmal", "hu"],
  ["Milyen fajta ló jó díjugratásra?", "hu"],
  ["Mennyi abrakot adjak neki edzésnapokon?", "hu"],
  ["A gát előtt mindig megáll a lovam", "hu"],
  ["Laza szárral lovagoljak bemelegítéskor?", "hu"],
];
assert.ok(otherLanguages.length >= 30);
for (const [message, language] of otherLanguages) {
  assert.equal(romanianAlwaysOn.test(foldForMatching(message)), false, `always-on ro term: ${message}`);
  // Which other language wins is that pack's business; a tie with Romanian would return "ro".
  assert.notEqual(guessCoachLanguage(message).language, "ro", `${language}: ${message}`);
}

// AI replies that diagnose, prescribe or clear the horse to work are replaced.
const riderMessage = "Pot să-l călăresc mâine?";
const unsafeReplies = [
  "Diagnosticul probabil este o tendinită.",
  "Aș diagnostica o entorsă la fesă.",
  "Pot pune un diagnostic: e o entorsă.",
  "Îți prescriu fenilbutazonă 2 g pe zi.",
  "Medicul ți-a prescris antiinflamatoare; continuă-le încă trei zile.",
  "Conform prescripției, dă-i 10 ml.",
  "Tratament garantat: comprese reci de trei ori pe zi.",
  "E sigur să-l călărești mâine, umflătura e minoră.",
  "Da, este sigur să călărești mâine.",
  "Este sigur sa o calaresti",
  "E în siguranță să-l lucrezi de mâine.",
  "Calul e apt pentru antrenament de mâine.",
  "Calul e apt de lucru.",
  "Iapa e aptă de concurs de sâmbătă.",
  "Diagnosticul meu: o contuzie la copită, nimic grav.",
  "Diagnostichez o tendinită ușoară la anteriorul stâng.",
  "Ți-aș prescrie fenilbutazonă trei zile, apoi reia lucrul.",
  "Prescripția obișnuită e 2 g de bute pe zi.",
  "Este în siguranță să-l călărești de mâine.",
  "Calul este apt pentru concurs duminică.",
  "E sigur să o lucrezi ușor de mâine, umflătura a scăzut.",
  "Tratamentul garantat e repausul în boxă și gheață.",
  "Fără un diagnostic de la veterinar, nu pot spune mai mult.",
  "Este sigur pentru ea să sară azi.",
  "Iapa e aptă de efort, poți relua săriturile.",
  "Medicamentul prescris de medic trebuie continuat încă o săptămână.",
];
for (const reply of unsafeReplies) {
  assert.equal(crossesSafetyLine(reply, riderMessage), true, reply);
}
// The Romanian forms need no help from the rider's message.
for (const reply of ["Diagnosticul probabil este o tendinită.", "Medicul a prescris antiinflamatoare.", "E sigur să-l călărești mâine."]) {
  assert.equal(crossesSafetyLine(reply), true, reply);
}

const trainingReplies = [
  "Pasul următor: fă trei tranziții trap-galop pe fiecare mână, cu pauze scurte de pas între ele.",
  "Semnal de urmărit: calul își lasă gâtul în jos și mestecă zăbala.",
  "Oprește-te dacă: calul devine tensionat sau grăbește tempoul.",
  "Pentru încălzire, lucrează 10 minute la pas pe frâu lung, apoi trap ușor pe cercuri mari.",
  "La obstacole, începe cu un cavaletti și o cruce mică înainte de oxer.",
  "Pentru concurs, plănuiește încălzirea cu 30 de minute înainte de start.",
  "Lucrează schimbările de picior pe diagonală, doar când galopul e echilibrat.",
  "Notează în jurnal cum a reacționat la fiecare exercițiu.",
  "Pasul următor: poți relua lucrul la trap după pauză.",
  "Sunt sigur că veți progresa.",
  "Sigur, să începem cu încălzirea.",
  "Ritmul e sigur să se îmbunătățească.",
  "Calul e apt să învețe rapid.",
  "Calul are aptitudini pentru concurs.",
  "Pune un bandaj de transport și verifică chinga înainte de urcare.",
  "Pasul următor: lucrează pe cerc de 20 m la trap, cu tranziții la pas la fiecare jumătate de cerc.",
  "Semnal de urmărit: dacă iapa se sprijină pe frâu, cedează mâna o secundă și cere din nou.",
  "Oprește-te dacă: iapa refuză de două ori la rând același obstacol.",
  "Pentru siguranța ta, poartă cască și vestă de protecție la cross.",
  "E sigur că va fi greu la început, dar cu răbdare iapa se va relaxa.",
  "Calul e apt să facă schimbări de picior după ce galopul e echilibrat.",
  "Lucrează în siguranță: încălzește-o bine înainte de sărituri.",
  "Pentru a sări în siguranță, începe cu bare la sol și o cruce mică.",
  "Verifică dacă șaua se potrivește; un specialist în harnașament te poate ajuta.",
  "Mâine poți face o sesiune scurtă de gimnastică, cu trei cavaletti la trap.",
  "Dacă vrei să sari, ține prima săritură mică și lasă-i frâul lung după.",
  "Ca să crești încrederea, sari aceeași cruce de câteva ori până e calmă.",
  "Programul de săptămâna asta: două zile de dresaj, o zi de sărituri, o zi de teren.",
  // The rider's own safety, not clearance of the horse.
  "Nu e sigur pentru tine să sari fără cască.",
];
for (const reply of trainingReplies) {
  assert.equal(crossesSafetyLine(reply, riderMessage), false, reply);
}

// The fixed replies: plain text, short, Romanian, and the safety line kept.
const healthReply = healthEscalationReply("ro");
assert.match(healthReply, /^Oprește antrenamentul și sună medicul veterinar/);
assert.match(healthReply, /Nu pot pune un diagnostic și nici nu pot spune dacă poți lucra din nou cu calul\.$/);
const reviewReply = providerReviewReply("ro");
assert.match(reviewReply, /^Nu pot pune diagnostice, nu pot recomanda medicamente și nu pot spune dacă un cal poate lucra din nou\./);
assert.match(reviewReply, /oprește antrenamentul și sună medicul veterinar/);
for (const reply of [healthReply, reviewReply]) {
  assert.ok(reply.length < 420, reply);
  assert.ok(!/[*#_`]/.test(reply), "plain text for the chat bubble");
  // "nu pot spune că …" reads as "I wouldn't say …"; "dacă" (whether) does not.
  assert.ok(!/spune că/.test(reply), reply);
  assert.deepEqual(guessCoachLanguage(reply), { language: "ro", confident: true });
  // Fixed replies are never re-checked; each trips the check on purpose.
  assert.equal(crossesSafetyLine(reply), true, reply);
}

console.log("Romanian coach safety passed.");
