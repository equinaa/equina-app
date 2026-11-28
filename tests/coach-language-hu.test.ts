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
  // Sprains, without the open stem that also read the Portuguese "ficam".
  "Megficamodott a bokája",
  "Elficamodott a lába",
  "Bokaficam lehet?",
  "Csüdficama van",
  "Vállficamot kapott",
  "Ficamot kapott a lovam",
  "A lovamnak ficama van",
  "Kificamította a lábát",
  "Ficamodás után mikor lovagolhatok?",
  "Enyhe ficam a bal elsőn",
  "Szerintem ficam",
  "Talán ficam?",
  "Lehet, hogy ficam?",
  "Ficam-e ez?",
  "Ficam van a hátsó lábán",
  "A lovam ficama nem javul",
  "Ficam a bokáján",
  // Bute in Hungarian, hyphenated, accented, or next to a dosing verb; not the saddle maker Butet.
  "Bute-t adtam neki",
  "Butét adtam neki",
  "Mennyi Butét adhatok neki?",
  "Butet adtam neki tegnap",
  "Mennyi butet adhatok neki?",
  "Kapott butet tegnap, mehet versenyre?",
  // A sick horse, also when a person is in the sentence.
  "A lovam beteg lett",
  "Beteg lett a lovam",
  "Az edzőm lova beteg lett",
  "Az edzőm szerint beteg lehet",
  "Beteg a lovam",
  "Megfázott a lovam",
  "A kancám meg van fázva",
  // A horse that cannot get up, in the third person.
  "Nem tud felállni a lovam",
  "Nem tudott felkelni reggel a lovam",
  "Nem bír lábra állni",
  "A lovam nem kel fel",
  // A fever, a wound and a refused feed next to the new exclusions.
  "A lovamnak laza volt tegnap este",
  "Nem eszi a szénát",
  "Nem eszi meg a zabot",
  "Seb van a lábán",
  "A lovam lábán seb van.",
  "Seb van, mit tegyek?",
  "Seb van rajta, lovagolhatok?",
  "Seb van-e a lábán?",
  "Fáj a háta a lovamnak",
  "Fáj a háta és nekem is fáj a hátam",
  "Mekkora dózist adjak neki?",
  "Mennyi fájdalomcsillapító kell neki?",
  // The review's other sprain, sick-horse, get-up, fever, feed and wound cases.
  "Kificamította a bokáját",
  "Ficamot szenvedett a lovam",
  "A ficamra mit tegyek?",
  "Biztos ficam",
  "Bokaficam",
  "Csüdficam",
  "ficamot kapott a lába",
  "A kancám beteg",
  "A lovam nem tud felkelni",
  "Nem tudja felállni",
  "A lovamnak láza volt tegnap",
  "Nem eszi meg a takarmányt",
  "Egy seb a lábán",
  "Sebe van a lábán",
  "Mennyi Bute-ot adhatok?",
  // A rider's everyday worries, as typed with and without accents.
  "A lovam reggel óta nem eszik, csak áll a box sarkában",
  "tegnap ota biceg a bal hatsora, mit csinaljak?",
  "Terepen köves úton kicsit sántikált",
  "Patkolás óta nem terheli rendesen a jobb elsőt",
  "Felpuffadt a hasa és izzad, hívjam az orvost?",
  "Hempereg a boxban, kólikára gyanakszom",
  "Megrándult a bokája ugrásnál",
  "megrandult a laba a terepen",
  "Megrándult a lovam bokája",
  "Megrándította a lábát",
  "Megdagadt a csüdje a terep után",
  "Elvágta a lábát a drótkerítésen, vérzik",
  "Megrúgta a szomszéd ló a karámban, azóta sántít",
  "a csiko hasmeneses, mit adjak neki",
  "Folyik az orra és lázas, lovagolhatok rajta?",
  "Nem akar ráállni a jobb hátsójára",
  "nem tud raallni a jobb hatsora",
  "Megsértette a lábát a pótkocsiban",
  "Felsértette a bőrét",
  "Megmértem a lázát, 39,2 fok volt",
  "Gennyes a patája, lehet tályog?",
  "Köhög és nehezen lélegzik vágta után",
  "Duzzadt az ina a bal elsőn, hűtsem?",
  "Belelépett egy szögbe és azóta kíméli a lábát",
  "Nagyon levert, nem iszik, mit csináljak?",
  "Bevérzés van a talpán a patkoló szerint",
  "Mennyi Equipalazont adhatok neki?",
  "Húzódása van a combjában",
  "Beteg volt a lovam, mikor kezdhetünk?",
  "Sérült a háta a nyereg alatt",
  "Megsérült a nyereg alatt a háta",
  "Vérzik a lába",
  "Nem eszik, a répát sem kéri",
  "Egy kis seb is van rajta",
  // A swollen leg, also with the horse named first; not a fat horse (in the training list).
  "dagadt a laba reggelre",
  "Kicsit dagadt a lába reggelre",
  "Dagadt a lovam lába",
  "Meleg a lovam lába",
  "Sebes a lovam szája",
  // Sore, with Hungarian words around it: the Spanish "fajos" (bundles) is not.
  "fajos a hata nyergeleskor",
  "Fájós a lába",
  "Fájósak a lábai",
  "Fáj neki, hogy hozzáérek?",
  // "sántító" (limping) with its accents; typed plain it is the Spanish "santito".
  "A sántító lovamat mikor vigyem orvoshoz?",
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
  // The saddle maker Butet is not bute.
  "Butet nyereg jó lesz a lovamnak?",
  "A lovam Butet nyerget kapott",
  "Mennyi egy Butet nyereg?",
  // Someone else is ill: the coach, a child, the judge.
  "Az edzőm beteg lett, ma nincs edzés, mit csináljak egyedül?",
  "Beteg lett az oktatóm",
  "Megfázott az edzőm",
  "A lányom beteg lett",
  // The rider standing in the stirrups or getting up early, not a horse that cannot get up.
  "Nem tudok felállni a kengyelben ugrásnál",
  "Nem tudok felállni a nyeregben könnyügetésben",
  "Nem bírok felállni ugrásnál két ülésben",
  "Nem tudok felkelni reggel az edzésre",
  "A lányom nem kel fel korán az edzésre",
  "A lányom nem tud felállni a kengyelben",
  // A supple back, a coach called Seb, a refused treat.
  "A lovamnak laza volt a háta ma, végre!",
  "Lovamnak laza volt a járása",
  "A kancámnak laza volt a tarkója",
  "Seb az edzőm",
  "Seb edző holnap jön",
  "Holnap Seb tart edzést",
  "Nem eszi meg a répát a kezemből",
  "Nem eszi meg a jutalomfalatot",
  "Eszik rendesen, csak a répát nem eszi meg",
  // The rider's own soreness or cold, and someone else's pain.
  "Fáj a hátam lovaglás után, mit nyújtsak?",
  "Fájt a térdem az edzés után",
  "faj a hatam a lovaglastol",
  "A kezem fáj a száron",
  "Fájnak a lábaim könnyügetésben",
  "Hátfájós vagyok, milyen nyereg jó?",
  "Fájdalmaim vannak könnyűügetésben",
  "Fájdalmas a térdem ugrásnál",
  "Az edzőmnek fáj a háta, ma nincs óra",
  "Lázas vagyok, lovagolhatok ma?",
  "Köhögök, lovagoljak ma?",
  // Feed and supplement doses, and the weather or the arena given with a decimal.
  "Mekkora dózis elektrolitot adjak nyáron?",
  "A zabból mekkora dózist adjak?",
  "Mekkora dózis vitamint adhatok?",
  "A levegő mai hőmérséklete 38,5 fok, lovagoljak?",
  "A lovarda hőmérséklete 38,2 fok volt",
  "A pálya hőmérséklete 39,5 fok délben",
  // Everyday questions from a rider, with and without accents.
  "Hogyan tanuljam meg a könnyügetést?",
  "A lovam nem áll meg a sarokban, mit tegyek?",
  "Ma a kancám nagyon laza és nyugodt volt, jó jel?",
  "A fedeles lovardában 12 fok van, kell takaró?",
  "Mikor oltassam a lovat influenza ellen?",
  "Milyen gyakran kell féregteleníteni?",
  "Nem tudott felállni a kengyelben a lányom ugrásnál",
  "Butet nyerget próbáltunk, jól fekszik a hátán",
  // A horse called Butet getting its oats or a saddle, not bute.
  "Butet kapott ma zabot",
  "Butet kapott egy új nyerget",
  "Szombaton a Kincsem Parkban versenyzünk, mire figyeljek?",
  "A kancám ivarzik, ilyenkor rugdos, mit tegyek?",
  "Mekkora adag szénát adjak éjszakára?",
  "Laza volt a patkó, a patkoló holnap jön",
  "Az oktatóm beteg, ki tartja a holnapi órát?",
  "Sebi holnap lovagol a lovamon, mire figyeljen?",
  "Kifulladt a vágta után, ez normális?",
  "Holnap a lányom lovagol Csillagon, mire figyeljen?",
  "laza volt a lovam ma",
  "milyen fajta lo jo kezdonek",
  "fajlalom hogy kiestunk",
  "Kirándultunk a lovakkal a Bükkben",
  // The rider hurt, not the horse: "megsérültem", "vérzik az ujjam", "megrándult a bokám".
  "Leestem a lóról és megsérültem, mikor lovagolhatok újra?",
  "Megsérült a kezem a száron",
  "Vérzik az ujjam a szártól, milyen kesztyűt vegyek?",
  "Vérzik az orrom",
  "Megrándult a bokám, mikor ülhetek újra lóra?",
  "Húzódásom van a combomban",
  "Fáj a fejem, lovagoljak ma?",
  // Damaged tack, a fat horse, a flinch, a lost class, a species, a refused apple.
  "Megsérült a nyeregfa, meg lehet javítani?",
  "Sérült nyeregfájú nyerget ne vegyek, ugye?",
  "Sérült kantárt vettem, meg lehet varrni?",
  "A nyeregfa is sérült",
  "A lovam kicsit dagadt, mennyit fogyjon?",
  "Túl dagadt a kancám, kevesebb zabot adjak?",
  "Dagadtabb lett a pónim",
  "Megrándult a ló a zajra, hogyan nyugtassam?",
  "Fáj, hogy nem nyertünk, mit csináljak jobban?",
  "faj hogy kiestunk",
  "Milyen faj a lovad?",
  "A lovam nem eszik almát, csak répát",
  // Training load, not a horse that will not bear weight; scales, not a leg.
  "Nem terheli túl a lábát a sok ugrás?",
  "Nem terheli meg a lábát a sok ugrás?",
  "Nem akar ráállni a mérlegre",
  "Megsértette az edzőt",
  // A coach called Seb, and someone else who was ill.
  "Seb holnap jön edzeni, mit gyakoroljunk?",
  "Kis Seb is jön lovagolni",
  "Seb szerint túl hosszú a szár",
  "Az edzőm beteg volt",
  "A gyerek beteg volt, ezért kimaradt az óra",
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
  // Hungarian "ficam" (sprain) is the Portuguese "ficam" (they stay) and the
  // end of every -ficamos / -ficăm verb in Portuguese, Spanish and Romanian.
  "Os cavalos ficam no piquete à noite?",
  "Eles ficam nervosos na pista",
  "Os estribos ficam curtos demais?",
  "Os cavalos ficam a comer feno toda a noite",
  "Por que os cavalos ficam mais agitados no inverno?",
  "Ficamos uma hora no picadeiro, foi demais",
  "Ficamos em segundo lugar na prova de ontem!",
  "Treinamos e ficamos exaustas",
  "Ficamos!",
  "O que significam as notas do juiz?",
  "Os juízes classificam pela nota técnica ou artística?",
  "Quantos conjuntos se qualificam para a final do brasileiro?",
  "¡Clasificamos para el Campeonato de España!",
  "clasificamos para la final!!",
  "Rectificamos la línea al oxer",
  "Planificamos el entrenamiento de la semana",
  "¿Cómo dosificamos el trabajo de galope?",
  "Ne calificam la campionatul national?",
  "Verificam potcoavele inainte de concurs",
  "Planificăm antrenamentele pentru concurs",
  // "Butet" is a saddle maker in the app's own brand list, and a horse name.
  "Screen the fit and buying risk for Butet saddle",
  "New Butet saddle arrived!",
  "I bought a Butet bridle",
  "Review my session on Fri 20 Nov: Jumping with Butet. I rode for 40 min. What should we work on next?",
  // "Seb van ..." is a Dutch name, not "seb van" (there is a wound).
  "Seb van Dijk said shorten reins",
  "Seb van de Velde coaches me on Fridays",
  // More -ficam verbs from the review.
  "vcs ficam até que horas no clube sábado?",
  "Clasificamos!",
  "Os cavalos ficam nervosos com vento, o que faço?",
  "Nos clasificamos para la final del domingo, ¿cómo preparo el recorrido?",
  "Verificăm chinga înainte de concurs?",
  "Verificamos a cilha antes de montar?",
  "Ficamos com medo",
  "Quantos pontos qualificam para o campeonato?",
  "O que significam as letras do picadeiro?",
  "Review my session on Fri 20 Nov: Jumping with Estrela. I rode for 40 min.\nMy note: Os cavalos ficam agitados com vento, ele também ficou.",
  // The app's own prompts and short English chat with a horse or coach called Seb, Laz, Genny, Faj or Butet.
  ...["Seb", "Laz", "Genny", "Faj", "Butet"].map((name) => `Help me write down a health observation about ${name}`),
  "Seb coming Friday, plan?",
  "Genny coming tomorrow, any warm-up ideas?",
  "Seb says more leg, thoughts?",
  "Laz good at shows lately, next goal?",
  "Genny jumped great yesterday, next height?",
  "Quick question about Seb's lunging",
  ...["bridle", "girth", "pad", "Elite saddle"].map((item) => `Screen the fit and buying risk for Butet ${item}`),
  // Spanish "santito" (a little saint) and "fajos" (bundles), Romanian "înverzește" (greens),
  // "serul" (the serum) and "Sebeșul" (the town), and the name Sebek.
  "Mi yegua hoy fue un santito en la pista",
  "El caballo estuvo hecho un santito todo el entrenamiento",
  "Mi caballo Santito es muy noble",
  "Review my session on Fri 20 Nov: Flatwork with Santito. I rode for 40 min. What should we work on next?",
  "Compré dos fajos de heno para el fin de semana",
  "¿Cuántos fajos de alfalfa le doy por semana?",
  "Când înverzește pășunea, pot să-l scot la iarbă?",
  "Pășunile înverzesc în aprilie, când încep tura?",
  "Am cumpărat serul fiziologic pentru trusa de grajd",
  "Sebeșul e aproape de Alba Iulia",
  "Lesson with Sebek at Hickstead tomorrow, any tips on the water tray?",
  // Horses, coaches and places in the other languages.
  "Am fost la concurs la Sebeș cu iapa mea Laz",
  "Antrenorul meu Seb zice să scurtez frâiele",
  "Iapa Genny a sărit perfect azi",
  "Calul meu Verde a fost cuminte la Sibiu",
  "Montei a Faísca no Haras Santa Rita hoje",
  "Minha égua Paci saltou muito bem na Hípica Paulista",
  "O treinador Seb disse para encurtar as rédeas",
  "Fomos ao forró depois da prova em Sorocaba",
  "Treino com o Lázaro às terças em Campinas",
  "Mañana monto a Bella en el Club Hípico Santa María",
  "Mi entrenador Laz dice que alargue las riendas",
  "Laza es un pueblo de Ourense donde monté el verano pasado",
  "Mi yegua se llama Sebe y es muy noble",
  "Le puse la faja al caballo para el desfile",
  "Mi caballo Butet ganó la prueba de 1,20",
  "Rode Santana in the indoor, she was great",
  "Seb van Dijk is coaching at the clinic this weekend",
  "Genny and Laz both jumped clean at Aachen",
  "Review my session on Fri 20 Nov: Dressage with Faja. I rode for 40 min. What should we work on next?",
]) {
  assert.equal(mentionsHealthConcern(message), false, `lookalike: ${message}`);
}
// A Hungarian note in the app's English ride review is read as Hungarian,
// whatever the horse is called.
for (const horse of ["Butet", "Estrela"]) {
  assert.deepEqual(
    assessHealthConcern(`Review my session on Fri 20 Nov: Jumping with ${horse}. I rode for 40 min.\nMy note: Faj a laba neki.`),
    { concern: true, language: "hu" },
    horse,
  );
}
// Those ambiguous words still count when the message is Hungarian.
for (const message of [
  "A lovamnak sebe van a lábán", "Seb a lábán, mit tegyek?", "A lovam is sánta", "Tegnap óta láz gyötri, mit tegyek?",
  "Nem gyógyul a sebe", "Milyen kenőcs kell, ha mély sebe van?", "A sebe a lábán nedvedzik", "Felszakadt a sebe",
  "Sebek vannak a lábán", "a santito lovam mit csinaljon", "Sántítás után mikor kezdhetünk?",
]) {
  assert.deepEqual(assessHealthConcern(message), { concern: true, language: "hu" }, message);
}
// English health words next to a Hungarian word are still caught. Which language the
// fixed reply is in comes from coach-safety.ts (the English "is" ties with Hungarian).
for (const message of ["A lovam is lame", "Lovam is injured", "A lovam lame"]) {
  assert.equal(mentionsHealthConcern(message), true, message);
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
  // Naming the condition with "szerintem", a longer "valószínűleg", or by ruling it out.
  "Ez valószínűleg csak egy enyhe ínhúzódás, pihentesd két napig.",
  "Szerintem patatályog, áztasd a patáját langyos vízben.",
  "Valószínűleg megrándult a bokája, borogasd hideg vízzel.",
  "Szerintem kificamodott a lába.",
  "Ez nem kólika, nyugodtan lovagolhatsz.",
  "Adj neki egy tasak Danilont, és holnap már lovagolhatod.",
  "Két nap pihenő után nyugodtan ugrathatsz vele.",
  "Nem kell állatorvost hívni, ez csak izomláz.",
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
  "Bemelegítésként lovagolj 10 percet lépésben laza szárral, aztán ügess.",
  "A sántaságot csak az állatorvos tudja megítélni; addig ne dolgoztasd.",
  "Írd fel, mikor kezdődött, és mutasd meg az állatorvosnak.",
  "Ha a ló kólika jeleit mutatja, azonnal hívd az állatorvost.",
  "Ha kólikának tűnik, azonnal hívd az állatorvost.",
  "A hirtelen takarmányváltás gyulladást okozhat a patában, ezért lassan válts.",
  "Valószínűleg fáradt, adj neki egy pihenőnapot.",
  "Valószínűleg nem kell aggódni, de ha gyulladás jeleit látod, hívd az állatorvost.",
];
for (const reply of trainingReplies) {
  assert.equal(crossesSafetyLine(reply, rider), false, `training reply: ${reply}`);
}
// The sprain and bute words in the reply check do not read other languages' answers either.
const lookalikeReplies: [reply: string, riderMessage: string][] = [
  ["Os cavalos ficam mais calmos se o aquecimento for longo.", "Os cavalos ficam nervosos na pista"],
  ["Clasificamos el trabajo en tres bloques: paso, trote y galope.", "¡Clasificamos para el Campeonato de España!"],
  ["A Butet saddle can suit a short-backed horse; check the gullet width with your saddle fitter.", "Screen the fit and buying risk for Butet saddle"],
  ["Write what you see: the leg, the gait, the time. Leave diagnostic words to your vet.", "Seb lame RF"],
  ["Ask your vet whether a diagnostic ultrasound is planned; keep work light until then.", "Seb lame RF"],
  ["Mi yegua fue un santito: repite el mismo calentamiento la próxima vez.", "Mi yegua hoy fue un santito en la pista"],
];
for (const [reply, riderMessage] of lookalikeReplies) {
  assert.equal(crossesSafetyLine(reply, riderMessage), false, `lookalike reply: ${reply}`);
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
