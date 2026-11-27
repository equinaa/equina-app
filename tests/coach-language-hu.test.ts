import assert from "node:assert/strict";
import {
  assessHealthConcern,
  crossesSafetyLine,
  guessCoachLanguage,
  healthEscalationReply,
  mentionsHealthConcern,
  providerReviewLanguage,
  providerReviewReply,
} from "../supabase/functions/_shared/coach-safety";

// Hungarian: the words that stop Ralf, the words that must not, and the fixed
// replies. Messages are written the way riders type them, with and without
// accents.

// A health worry stops the AI and gets the fixed vet reply, in Hungarian.
const health = [
  // Colic.
  "Kólikás a lovam, mit csináljak?",
  "kolikas a lo, hivjam az allatorvost?",
  "Szerintem kólikája van, folyton a hasát nézi",
  "A heréltem kólikás",
  "Kólikás!",
  "Ma este kólikás lett",
  // Lameness: sántít, sánta, lesántult, biceg.
  "A lovam sántít a bal elsőre",
  "santit a lovam, mit csinaljak?",
  "Sántít",
  "Ma is sántít",
  "Tegnap este óta sántít",
  "Canter közben sántít",
  "Mi lehet, ha sántít?",
  "A lovam sánta",
  "Sánta a kancám a jobb hátsóra",
  "santa a lovam bal elso",
  "Kicsit sánta a bal elsőre",
  "Sántának tűnik ügetésben",
  "Lesántult a lovam tegnap a pályán",
  "Megsántult a kanca",
  "Bicegett az ügetésnél",
  // Swelling, inflammation, laminitis.
  "Bedagadt a lába reggelre",
  "Dagadt és meleg a csüdje",
  "Be van dagadva a csüdje",
  "Duzzadt és meleg a lába",
  "Megduzzadt a térde",
  "Ödémás a lába",
  "jumping utan duzzadt a laba",
  "Szerintem patairhagyulladás",
  "Patairha-gyulladása van",
  "Ingyulladása van a bal elsőn",
  "Felpattásodott a lovam",
  // Injury and wounds.
  "Megsérült a lovam a karámban",
  "Lesérült ugrás közben",
  "ínsérülése van a lovamnak",
  "Ínhúzódás lehet a bal elsőn?",
  "Sebet találtam a fején",
  "Milyen kenőcsöt kenjek a sebére?",
  "Sebes a lába, mit tegyek rá?",
  "A szája sebes a zablától",
  "Van egy mély seb a combján",
  "Seb van a lábán",
  "Kisebesedett a szája a zablától",
  "Megvágta magát a kerítésen",
  "Felhorzsolta a térdét",
  "Kificamodott a lába",
  "Gennyes a sebe",
  // Bleeding.
  "Vérzik a szája a zabla miatt",
  "Vérzik!",
  "Vérzett a lába",
  "Véres a szája edzés után",
  "Orrvérzése volt a verseny után",
  // Fever and temperature.
  "Láza van",
  "Láza van a lovamnak",
  "39,5 fokos láza van",
  "Magas láza van",
  "Hőemelkedése van",
  "hoemelkedese van a kancamnak",
  "Lázas.",
  "Lázas a paci",
  "lazas a kancam, lovagolhatok?",
  "Lázat mértem neki reggel",
  "A lovam hőmérséklete 39 fok",
  "Lázmérővel mértem, 38,9",
  // Not eating or drinking.
  "Nem eszik semmit",
  "Nem eszi meg a zabot",
  "Nem evett ma a lovam",
  "Nem akar enni reggel óta",
  "Nincs étvágya, és nem iszik",
  "Étvágytalan a lovam",
  // Cannot get up.
  "Lefeküdt és nem tud felállni",
  "Nem tudott felállni a boxban",
  "Nem bír felkelni",
  "Fekszik és nem kel fel",
  // Pain.
  "Fáj a lába",
  "Fáj a lába, lovagolhatok?",
  "Fáj a háta, amikor felnyergelem",
  "faj a hata az ugras utan",
  "Fájt a háta tegnap",
  "Hátfájós a lovam",
  "Fájdalmas a lába",
  "Fájlalja a bal hátsóját",
  // Medicine and doses.
  "Mennyi fájdalomcsillapítót adhatok neki?",
  "Mekkora dózis Bute-ot adjak a lovamnak?",
  "Milyen gyógyszert adjak neki?",
  "Kaphat antibiotikumot?",
  "Adhatok neki fenilbutazont edzés előtt?",
  // Sick, abscess, choke, breathing, tying up, eyes, gut.
  "A lovam beteg, mit csináljak?",
  "Patatályog lehet?",
  "Félrenyelt és folyik az orrán a takarmány",
  "Köhög a lovam edzés közben",
  "Nehezen veszi a levegőt",
  "Izomgörcs van a farán edzés után",
  "Könnyezik és be van dagadva a szeme",
  "Hunyorog a bal szemével",
  "Hasmenése van a lovamnak",
  // Pain killers by brand, with a Hungarian ending or amount.
  "Mennyi Bute-ot adhatok neki egy versenyen?",
  "Adhatok neki Metacamot edzés előtt?",
  "Danilont kapott, mehet holnap versenyre?",
  "Mennyi Metacam kell neki egy napra?",
  "Mennyi Danilon kell egy 500 kilós lónak?",
  // Heat in a leg or hoof, and favouring a leg.
  "Meleg a lába a jobb elsőn, ez gond?",
  "Forró a patája",
  "A kancám bal első lába meleg és duzzadt",
  "Patkolás óta kíméli a bal elsőjét",
  "Nem lép rendesen a jobb elsőre, kíméli a lábát",
  "Patkolás után nem akar rálépni a bal elsőre",
  "Nem terheli a bal hátsóját",
  "Kicsit meleg a csüdje ugrás után, hűtsem?",
  "Bokája meleg és érzékeny",
  // Colic signs, a runny nose, tying up, lying down.
  "Folyton a hasát nézi",
  "Szerintem kólikázik, folyton hempereg",
  "Folyik az orra és köhécsel, lovagolhatok?",
  "Edzés után bemerevedett a fara és nem akar lépni",
  "Fekszik a boxban és nem akar felkelni",
  "Nem akar felállni, fekszik",
  "Kifolyik a szeméből valami",
  "Megfázott a lovam",
  // A fever in the past tense, and a body temperature with a decimal.
  "A lovamnak láza volt a hétvégén, mikor kezdhetünk újra?",
  "39 fokos láza volt tegnap",
  "38,7 a hőmérséklete, normális?",
  "39 fok a hőmérséklete, ez már láz?",
  // More of the commonest worries, as typed on a phone.
  "A lovam reggel óta sántít a jobb hátsóra, ügethetek vele?",
  "Tegnap ugratás után feldagadt a csüdje",
  "nem eszik rendesen 2 napja, mit csinaljak",
  "Valami megszúrta a lábát és vérzik",
  "Mintha fájna neki a háta, amikor felülök",
  "Megrúgta a másik ló, most bicegve megy",
  "Elvesztette a patkóját, és azóta sántikál",
  "sebes lett a szaja a zablatol",
  "Hogyan kezeljem a sebét a csüdjén?",
  "lazas es levert a lo",
  "Gyulladt a szeme és csipás",
  "Kötőhártya-gyulladás lehet?",
  "Ma is fáj neki a lába?",
];
assert.ok(health.length >= 50);
for (const message of health) {
  assert.equal(mentionsHealthConcern(message), true, `health: ${message}`);
  assert.equal(assessHealthConcern(message).language, "hu", `Hungarian reply: ${message}`);
}

// Ordinary riding, feeding, tack and weather questions reach Ralf. Several of
// them use a word that is also a health word somewhere: "laza" (loose,
// supple), "lazaság" (suppleness), "sebes" (fast), "fajta" (breed), "adagol"
// (to ration feed), "hőmérséklet" (the weather), "Santa".
const training = [
  "Hogyan javíthatok a lovam ügetésén?",
  "Milyen gyakran ugorjak a lovammal egy héten?",
  "Hogyan adagoljam a zabot egy sportlónak?",
  "Mi a helyes takarmány-adagolás versenyidőszakban?",
  "Mennyi szénát adagoljak naponta egy 500 kilós lónak?",
  "Mekkora adag szénát kap egy sportló naponta?",
  "Milyen hőmérsékletnél kell takarót adni a lóra?",
  "Ilyen hőmérsékletben érdemes egyáltalán lovagolni?",
  "Milyen hőmérséklet felett ne ugrassak nyáron?",
  "Ma a hőmérő 35 fokot mutat, lovagoljak?",
  "Lázasan készülünk a hétvégi versenyre, mit gyakoroljunk?",
  "Fájlalom, hogy kiestünk, mit csináljak másképp?",
  "Laza ügetéssel kezdjem a bemelegítést?",
  "Laza a szár, ez baj?",
  "Ma nagyon laza volt a lovam, mit gyakoroljak?",
  "Hogyan javíthatom a lovam lazaságát?",
  "Lazasági gyakorlatok kezdő lónak?",
  "Magas lazaságot értünk el, mi a következő lépés?",
  "Hogyan lazítsam a lovam hátát a munka elején?",
  "Szeretnék egy könnyű, laza edzést ma, mit javasolsz?",
  "Sebes vágtában hogyan tartsam meg az ütemet?",
  "Sebes a vágta, lassítsak?",
  "Sebes lett a vágta, lassítsak?",
  "Nagyon sebesen vágtázik, hogyan lassítsam?",
  "Milyen fajta ló jó díjugratásra?",
  "A lipicai fajta jó kezdőknek?",
  "Fajtatiszta arab a lovam, hogyan kezdjem az ugrást?",
  "A Santa Fe tréningközpontban lovagolok, milyen a talaj?",
  "Vágta után kifulladt, mennyit pihenjen?",
  "Fáradt a lovam a hosszú terep után, mennyit pihenjen?",
  "Mikor van a következő díjugrató verseny?",
  "Hogyan tanítsam meg a lovat a fordulóban való vágtaváltásra?",
  "Mit egyen a ló verseny előtt?",
  "Mennyi zabot adjak edzésnap?",
  "Milyen nyerget vegyek egy rövid hátú lóra?",
  "A gyeplőt mennyire tartsam röviden a díjlovaglásban?",
  "Milyen zablát használjak egy érzékeny szájú lóra?",
  "Milyen lábvédőt vegyek ugráshoz?",
  "Milyen takarót adjak rá télen?",
  "Mennyi pihenőt adjak két edzés között?",
  "Holnap esni fog, lovagoljak fedeles pályán?",
  "Hogyan készítsem fel a lovat az első versenyére?",
  "Melyik a jobb: kengyel nélkül ügetni vagy gimnasztikai sor?",
  "Mit tegyek, ha a ló nem áll meg a megállításnál?",
  "Hogyan dolgozzak a hosszú szárral lépésben?",
  "Milyen gyakran kell patkolni a lovat?",
  "Szeretnék dresszúra edzéstervet a következő hónapra",
  "Ügetésben mindig kiesik a ritmusból, mit tegyek?",
  "Mit tegyek, ha a lovam fél a pocsolyától?",
  "Hány percig vágtázzak egy kondiedzésen?",
  "Hogyan szoktassam a lovat a lószállítóhoz?",
  "Mi legyen a mai edzés?",
  "Ma este milyen edzést csináljunk?",
  "Tegnap este jól ment az edzés, mi a következő lépés?",
  "A kancám feszült a pályán, mit tegyek?",
  "A herélt lovam lusta, hogyan motiváljam?",
  "A pacim nagyon ügyes volt ma",
  "Kezdő vagyok, hogyan tartsam a szárat?",
  "Hogyan érjem el, hogy a ló ne dőljön be a fordulóban?",
  "A nyereg alatt izzad a háta, ez normális?",
  "Fel tudod írni a heti edzéstervet?",
  "Sebastian lovagol a lovamon holnap, mire figyeljen?",
  "Az app melyik verziója kell?",
  "hogyan javitsam az ulesemet vagtaban?",
  // Close to the heat, favouring, tying-up, temperature and Santa phrases, but ordinary.
  "Nagyon meleg van ma, lovagoljak egyáltalán?",
  "Meleg van a fedeles pályán, mennyit pihenjünk?",
  "Meleg vízzel mossam le a lábát edzés után?",
  "Kíméljem a lovam lábát a kemény talajon?",
  "Nem terheli túl a lovat a napi két edzés?",
  "Nem lép rá jól a kezdő ugrásokra, hogyan segítsek?",
  "Nem akar rálépni a rámpára, hogyan szoktassam a szállítóhoz?",
  "Mit csináljak, ha a ló nem akar belépni a vízbe?",
  "Bemerevedett a tarkója a vágtában, hogyan lazítsam?",
  "Edzés után hempereg a homokban, ez rendben van?",
  "Tudod, hogy Santa Fe-ben mikor van verseny?",
  "A levegő hőmérséklete 38,5 fok, lovagoljak?",
  "Tegnap laza volt, ma feszült a lovam",
  "Laza volt a heveder, megigazítottam",
  "Kell állatorvosi igazolás a versenyre?",
  "Mehetek vele versenyre szombaton?",
  "Hogyan tanítsam a lovat a hátraléptetésre?",
  "Mennyi ideig ügessek bemelegítésként egy fiatal lóval?",
  "Milyen gyakorlatokkal javíthatom a lovam egyenességét?",
  "Lovagolhatok a hóban a fedetlen pályán?",
  "Mikor kezdjem el a fiatal lovat ugratni?",
  "milyen hosszu legyen a kengyelszij dijugratashoz",
  "Hogyan javíthatom az ülésemet könnyű ügetésben?",
  "A lovam elhúz a kapu felé, mit csináljak?",
  "Szombaton versenyünk lesz, mit gyakoroljak pénteken?",
  "Nagyon sebesen jön az akadályra, hogyan lassítsam?",
  "A kancám ivarzik, ilyenkor feszültebb, hogyan dolgozzak vele?",
  "Laza szárral mennyi lépést csináljak a végén?",
  "Futószáron mennyit dolgozzak vele hetente?",
  "Milyen nyeregalátétet vegyek egy magas marú lóra?",
  "A lovam fajtája kisbéri félvér, mire figyeljek a takarmányozásnál?",
  "Mennyi vizet igyon a ló edzés után?",
  "Gyorsan kifárad a lovam, hogyan építsem fel a kondícióját?",
  "Hogyan dolgozzak a lovam lazaságán és ütemén?",
  "Hogy tudnám a lovat jobban a segítségek elé hozni?",
  "Holnap terepre menjek vagy inkább pályára?",
  "Laza volt végig a tarkója, ez jó?",
  "Merev a háta az első tíz percben, ez normális?",
  "A kancám ma nagyon sebes volt, hogyan nyugtassam?",
  "Egy hét szünet után hogyan kezdjem újra az edzést?",
  "Ma nagyon meleg volt a pályán, eleget ivott?",
  "Mehet vele a gyerekem terepre?",
  "Takarjam be, nehogy megfázzon izzadtan?",
];
assert.ok(training.length >= 50);
for (const message of training) {
  assert.equal(mentionsHealthConcern(message), false, `training: ${message}`);
}

// The same lookalikes in the other languages, and in an English ride review,
// stay clear: "sánta" is Santa, Romanian "șanțul" (the ditch) folds to
// "santul", Portuguese "sebe" is a hedge, "Seb", "Sebe" and "Laz" are also names.
for (const message of [
  "Vou treinar na Santa Cruz amanhã, o que preparo?",
  "Na Semana Santa a gente vai competir",
  "Vou à Santa a cavalo",
  "En Semana Santa a veces compito",
  "Calul a sărit peste șanțul cu apă",
  "Am lucrat la șanțul de cross",
  "O meu cavalo saltou a sebe sem tocar",
  // With no Portuguese marker word, no language stands out: "sebe" still must not trip.
  "Saltou a sebe sem tocar",
  "Saltamos a sebe perto do mar",
  "Is Santa Cruz a good place to ride in winter?",
  "Seb is riding my horse tomorrow, what should he focus on?",
  "Review my session on Fri 20 Nov: Jumping with Laz. I rode for 40 min. What should we work on next?",
  "Review my session on Fri 20 Nov: Jumping with Sebe. I rode for 40 min. What should we work on next?",
  // "mar" is the Spanish and Portuguese sea, "Bute" a Scottish isle.
  "Mañana monto en la playa junto al mar",
  "Montei na praia perto do mar com a minha égua",
  "We hacked past the Isle of Bute on Saturday",
]) {
  assert.equal(mentionsHealthConcern(message), false, `lookalike: ${message}`);
}
// Those ambiguous words still count when the message is Hungarian.
for (const message of [
  "A lovamnak sebe van a lábán", "Seb a lábán, mit tegyek?", "A lovam is sánta", "Tegnap óta láz gyötri, mit tegyek?",
  "Nem gyógyul a sebe", "Milyen kenőcs kell, ha mély sebe van?", "A sebe a lábán nedvedzik", "Felszakadt a sebe",
]) {
  assert.deepEqual(assessHealthConcern(message), { concern: true, language: "hu" }, message);
}

// Detection: Hungarian is told apart from Spanish ("és", "mi"), Romanian
// ("este") and English ("is"), also in short messages and with English
// riding words mixed in.
const hungarianMessages = [
  "A lovam sántít a bal elsőre",
  "Sántít",
  "Kólikás!",
  "Lázas.",
  "Vérzik!",
  "Duzzadt a lába",
  "Sántít a kancám",
  "Sántít a pacim a bal hátsóra",
  "A heréltem kólikás",
  "A lovam is sántít",
  "Mi lehet, ha sántít?",
  "Mi van, ha lázas?",
  "Duzzadt és meleg a lába",
  "Vérzik és duzzadt a szája",
  "Ma este kólikás lett",
  "Tegnap este óta sántít",
  "A warm-up után sántít",
  "Canter közben sántít",
  "canter utan santit",
  "santit a lovam, mit csinaljak",
  "Fáj a lába, lovagolhatok?",
  "Mi legyen a mai edzés?",
  "Ma este milyen edzést csináljunk?",
  "Hogyan javíthatok a lovam ügetésén?",
  "Mennyi zabot adjak edzésnap?",
  "Holnap ugorhatok vele?",
  "Lovagolhatok rajta ma?",
  "Laza a szár, ez baj?",
  "Sebes vágtában nehéz megállítani",
  "Szia, kérdésem van az ügetésről",
  "Mehetek vele versenyre szombaton?",
  "Csipás a szeme",
  "Gyulladt a szeme és csipás",
  "Elvesztette a patkóját, és azóta sántikál",
  "Megrúgta a másik ló, most bicegve megy",
];
assert.ok(hungarianMessages.length >= 25);
for (const message of hungarianMessages) {
  assert.deepEqual(guessCoachLanguage(message), { language: "hu", confident: true }, `detected: ${message}`);
}
// A fixed reply replacing the AI's answer to a short Hungarian question is in
// Hungarian, not in Spanish because of "mi" or in Romanian because of "este".
for (const message of ["Mi legyen a mai edzés?", "Ma este milyen edzést csináljunk?", "Lovagolhatok rajta ma?", "Mehetek vele versenyre szombaton?"]) {
  assert.equal(providerReviewLanguage("Ok.", message), "hu", message);
}
// Other languages' messages are not taken for Hungarian.
for (const message of [
  "Meu cavalo está mancando da mão esquerda",
  "Mi caballo es muy lento",
  "Es normal que mi yegua sude tanto?",
  "Lo noto cojo al trote",
  "Iapa este nervoasă",
  "Este normal ca iapa să transpire?",
  "Calul are febra",
  "My horse is lame on the left fore",
  "Review my session on Fri 20 Nov: Jumping with Santa. I rode for 40 min. What should we work on next?",
  // Hungarian "már" is not counted: "mar" is the sea, and the Romanian "măr" typed plain.
  "Galopamos junto al mar",
  "Saltamos a sebe perto do mar",
  "Montei na praia perto do mar com a minha égua",
  "Pot sa-i dau un mar calului dupa antrenament?",
  "Ma ajuti cu un plan de antrenament?",
]) {
  assert.notEqual(guessCoachLanguage(message).language, "hu", message);
}

// The AI's reply: a Hungarian answer that diagnoses, prescribes, doses or
// clears the horse to work is replaced by the fixed reply.
const rider = "A lovam kicsit sántít, lovagolhatok rajta holnap?";
const unsafeReplies = [
  // Diagnosis.
  "Ez alapján a diagnózis valószínűleg ínhúzódás.",
  "Diagnosztizálni nem tudom, de ínhúzódásnak tűnik.",
  // Prescription and doses.
  "Az állatorvos gyógyszert felírhat neki.",
  "Az állatorvos gyógyszert ír fel, ha szükséges.",
  "Felírhatja a gyógyszert az állatorvos.",
  "Kérd meg az állatorvost, hogy írjon fel gyulladáscsökkentőt.",
  "Felírok neki egy fájdalomcsillapítót.",
  "Kérj receptet az állatorvostól fenilbutazonra.",
  "Ehhez vény kell, kérj vényt az állatorvostól.",
  "Adj neki napi 2 gramm fenilbutazont.",
  "Garantált kezelés: hidegvizes borogatás.",
  "Garantáltan meggyógyul egy hét alatt.",
  // Clearance.
  "Ha nem sántít, nyugodtan lovagolhatsz rajta holnap.",
  "Biztonságosan lovagolható, folytathatod az edzést.",
  "Biztonsagosan lovagolhatsz rajta holnap.",
  "Biztonságos lovagolni rajta.",
  "Nem biztonságos lovagolni rajta, amíg sántít.",
  "Újra lovagolhatsz rajta egy hét múlva.",
  "Egy hét pihenő után újra lovagolhatod.",
  "A ló terhelhető, mehet újra dolgozni.",
  "Egy hét múlva visszaállhat a munkába.",
  // Naming the condition, or saying the vet is not needed.
  "Ez nagy valószínűséggel patatályog, áztasd a patáját langyos vízben.",
  "A leírás alapján ínhüvelygyulladásra gyanakszom.",
  "Szerintem ez kólika, de nem kell aggódnod, sétáltasd meg.",
  "Nem kell állatorvos, ez csak egy kis húzódás, pár nap alatt elmúlik.",
  // Prescribing and dosing, also by brand.
  "Az állatorvos valószínűleg antibiotikumot fog felírni.",
  "Adhatsz neki egy tasak Danilont reggel és este.",
  "Adj neki fél adag Metacamot a takarmányába.",
  // Clearance after rest, or to compete.
  "Két hét pihenő után már nyugodtan versenyezhet.",
  "Ha holnap már nem sántít, visszaállhat a teljes munkába.",
  "Biztonságosan versenyezhet vele a hétvégén.",
  "Három nap pihenő után lovagolhatsz rajta könnyedén.",
  "Egy hét szünet után újra elkezdheted a munkát lépésben.",
  "Ez kólika lehet, azonnal hívd az állatorvost.",
  "Ez valószínűleg csak izomláz, nem kell aggódni.",
  "A tünetek ínhúzódásra utalnak.",
  "Fenilbutazont kaphat, de csak az állatorvos utasítására.",
];
for (const reply of unsafeReplies) {
  assert.equal(crossesSafetyLine(reply, rider), true, `unsafe: ${reply}`);
  // The Hungarian words alone are enough, whatever the rider wrote.
  assert.equal(crossesSafetyLine(reply), true, `unsafe without rider: ${reply}`);
}
const trainingReplies = [
  "Következő lépés: ügess három nyugodt átmenetet mindkét kézen. Figyeld, hogy a ló egyenletesen lép-e. Állj meg, ha feszültnek érzed.",
  "Bemelegítésként 10 perc lépés hosszú szárral, aztán laza ügetés. Ha a ló ellenáll, menj vissza lépésbe.",
  "Írd fel a megfigyeléseidet edzés után, és vidd el az edződnek.",
  "Írj fel egy tervet a hétre, és írd fel, hány ugrás ment jól.",
  "Az ugrósort 2 keresztléccel kezdd, és csak akkor emeld, ha a ló nyugodtan veszi.",
  "A receptem a jó vágtához: sok átmenet, rövid ismétlések.",
  "Adok egy receptet a jó bemelegítéshez: hosszú lépés, aztán laza ügetés.",
  "Figyeld a ló légzését a vágta után: ha 10 perc alatt nem nyugszik meg, állj le.",
  "Ha ma este hideg lesz, a hőmérséklethez igazítsd a takarót.",
  "A pálya ma jól lovagolható, a talaj nem csúszik.",
  "Nyugodtan lovagolhatsz rövidebb szárral is.",
  "Lovagolj nyugodtan lépésben a végén, laza szárral.",
  "Tarts biztonságos távolságot a többi lótól a bemelegítő pályán.",
  "Lovagolj biztonságosan: viselj kobakot, és ellenőrizd a hevedert.",
  "Pihenő után újra ügethetsz két kört mindkét kézen.",
  "Adj neki időt, hogy megnyugodjon az ugrás előtt.",
  "Ha bármi fájdalomra utaló jelet látsz, hagyd abba a munkát, és hívd az állatorvost.",
  "Következő lépés: dolgozz a lépés-ügetés átmeneteken, és figyeld, hogy a ló a segítségek előtt marad-e.",
  "Írd fel a heti tervet: két díjlovas nap, egy ugró nap, egy terep.",
  "A zabot oszd el napi három etetésre, és figyeld a ló energiaszintjét edzésen.",
  "Ha bármilyen sántaságot, duzzanatot vagy fájdalmat látsz, állj le, és kérd az állatorvos véleményét.",
  "Nyugodtan ugrathatsz kisebb akadályokat, ha az ütem stabil.",
  "Rövid pihenő után nyugodtan ugrathatsz még két kört.",
  "Egy kis pihenő után dolgozhat tovább lépésben.",
  "Szerintem a ló még nem érti a segítséget, ezért bontsd kisebb lépésekre.",
  // A feed change "can cause colic", a show certificate, "no need to worry": not a diagnosis.
  "Ne válts hirtelen takarmányt: ez kólikát okozhat, ezért egy hét alatt fokozatosan keverd.",
  "A hirtelen takarmányváltás valószínűleg kólikához vezethet, ezért lassan válts.",
  "Ehhez nem kell állatorvosi igazolás, csak az oltási könyv.",
  "Nem kell aggódnod, de ha sántít, hívd az állatorvost.",
  "A nyaralás után egy hét szünet után lovagolhatsz újra, előbb lépésben.",
  "Ha gyulladásra utaló jelet látsz, például meleget vagy duzzanatot, hívd az állatorvost.",
];
for (const reply of trainingReplies) {
  assert.equal(crossesSafetyLine(reply, rider), false, `training reply: ${reply}`);
}

// The fixed replies: plain, short, in Hungarian, and saying Ralf cannot
// diagnose or clear the horse.
const healthReply = healthEscalationReply("hu");
const reviewReply = providerReviewReply("hu");
assert.equal(healthEscalationReply(assessHealthConcern("A lovam sántít").language), healthReply);
assert.match(healthReply, /^Szüneteltesd az edzést, és fordulj az állatorvoshoz/);
assert.match(healthReply, /hirtelen, súlyos vagy romlik/);
assert.match(healthReply, /étvágya és a viselkedése/);
assert.match(healthReply, /látható duzzanatot/);
assert.match(healthReply, /Nem tudok diagnózist felállítani, és nem dönthetem el, hogy a lovad dolgozhat-e újra\.$/);
assert.match(reviewReply, /^Nem tudok diagnózist felállítani, gyógyszert felírni, és nem dönthetem el, hogy egy ló dolgozhat-e\./);
assert.match(reviewReply, /szüneteltesd az edzést, és fordulj az állatorvoshoz/);
for (const reply of [healthReply, reviewReply]) {
  assert.ok(reply.length < 420, reply);
  assert.ok(!/[*#_`]/.test(reply), "plain text for the chat bubble");
  assert.deepEqual(guessCoachLanguage(reply), { language: "hu", confident: true });
  // Fixed replies are never re-checked; each one says it cannot diagnose.
  assert.equal(crossesSafetyLine(reply), true);
}

console.log(`Hungarian checks passed: ${health.length} health, ${training.length} training, ${hungarianMessages.length} detection, ${unsafeReplies.length + trainingReplies.length} replies.`);
