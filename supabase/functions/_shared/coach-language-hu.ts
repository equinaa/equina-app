import type { CoachLanguagePack } from "./coach-language-pack.ts";

/**
 * Hungarian. Terms are folded: see coach-language-pack.ts.
 *
 * Hungarian glues prefixes and compounds onto its words (megsérült,
 * bedagadt, patairha-gyulladás, orrvérzés), so a stem that only occurs in
 * Hungarian takes \w* on both sides. Words that also have an everyday
 * training meaning are written as phrases instead: "sánta" folds to the
 * saint of Santa Cruz, "láza van" (has a fever) to "laza", which is loose
 * or supple (lazaság is a step of the training scale), and "sebes" is a
 * wound or a fast canter.
 */

// The horse as riders write it, for the phrases around "sánta", "beteg" and "hőmérséklete".
const HORSE = "(?:lovam|lovad|lova|kancam|kancad|kancaja|kanca|herelt|hereltem|hereltje|pacim|pacid|paci)";
// Pain killers riders call by their brand. Bare, they are the same word in
// every language (the Spanish pack already reads "bute"), so they count only
// with a Hungarian ending ("Bute-ot", "Danilont") or after a Hungarian amount
// ("mennyi Metacam").
const BRAND = "(?:bute|metacam|meloxicam|flunixin|finadyne|danilon|equipalazon)";
const BRAND_INFLECTED = `${BRAND}-?(?:ot|et|t|bol|tol|val|nal|nak|ban)`;
// Medicines, for the prescribing and dosing word orders.
const MEDICINE =
  `(?:gyogyszer\\w*|antibiotikum\\w*|(?:fajdalom|laz)csillapit\\w*|(?:gyulladas|laz|fajdalom)csokkento\\w*|fenilbutazon\\w*|kenocs\\w*|${BRAND}\\S*)`;
// Conditions an answer must not name as the horse's diagnosis, in any case
// ("patairha-gyulladásra gyanakszom")...
const CONDITION =
  "(?:\\w*talyog\\w*|patairha\\w*|\\w*gyulladas\\w*|(?:in|izom)?huzodas\\w*|kolika\\w*|izom(?:gorcs|laz)\\w*|\\w*ficam\\w*)";
// ...or as the subject of "ez" or "valószínűleg": "ez kólika", not "ez kólikát okozhat" of a feed change.
const CONDITION_NAMED =
  "(?:\\w*talyog|patairha-?gyulladas|\\w*gyulladas|(?:in|izom)?huzodas|kolika|izom(?:gorcs|laz)|\\w*ficam(?:odas)?)";
// Body parts that go warm or hot with inflammation.
const WARM_PART = "(?:laba|labai|pataja|patai|ina|inai|csudje|terde|bokaja|csanakja)";

export const hungarian: CoachLanguagePack = {
  health: [
    // colic, and its signs: "folyton a hasát nézi", "rugdossa a hasát"
    "kolika\\w*", "(?:nezi|rugja|rugdossa|harapja|harapdalja|kapalja) a hasat", "hasat (?:nezi|rugja|rugdossa|harapja|harapdalja)",
    // lameness: sántít, sántikál, sántaság, bicegett, lesántult, "a lovam sánta"
    "santit\\w*", "santikal\\w*", "santasag\\w*", "biceg\\w*", "(?:le|meg)santul\\w*", "santult\\w*",
    "santa(?:nak|n|va|-e)", `santa (?:lett|volt|lehet|lesz|maradt|a ${HORSE}|a (?:bal|jobb))`,
    // not "hogy Santa Fe-ben", "lovam Santa Cruz-ban"
    `(?:${HORSE}|kicsit|picit|enyhen|kisse|nagyon|eleg|mindig|hogy|szerintem|mert|mintha|talan) santa(?! (?:fe|cruz|claus|maria|barbara|anita|monica|rosa|lucia|clara)\\b)`,
    // favours a leg: "kíméli a bal elsőjét", "nem lép rá a lábára"
    "(?:kimel(?:i|te)|nem terheli) (?:a )?(?:bal |jobb )?(?:labat|labait|elsot|elsojet|hatsot|hatsojat|patajat|(?:elso|hatso) labat)",
    "nem (?:all ra|lep ra|akar ralepni|mer ralepni) (?:a )?(?:bal |jobb )?(?:labara|elsore|elsojere|hatsora|hatsojara|(?:elso|hatso) labara)",
    // swelling, inflammation, laminitis; heat in a leg or hoof: "meleg a lába", "forró a patája"
    "\\w*duzzad\\w*", "\\w*duzzanat\\w*", "\\w*dagad\\w*", "puffad\\w*", "odema\\w*", "\\w*gyullad\\w*", "felpattas\\w*",
    `(?:meleg|forro) (?:a |az )?${WARM_PART}`, `${WARM_PART} (?:\\w+ )?(?:meleg|forro)`,
    // injury and wounds; not "sebes" alone, which is also fast
    "\\w*serul\\w*", "\\w*sebesul\\w*", "\\w*sebesed\\w*", "\\w*sebzes\\w*", "megsebez\\w*", "\\w*horzsol\\w*", "\\w*zuzod\\w*",
    "(?:in|izom)huzod\\w*", "\\w*ficam\\w*", "(?:meg|el)vagta magat", "genny(?:es|ed|ez)\\w*",
    "seb(?:et|ek\\w*|ei\\w*|ere|en|eben)", "(?:egy|mely|nyilt|verzo|friss|kis|nagy|csunya) seb", "seb (?:van|lett|keletkezett)",
    "sebes (?:lett )?a (?:laba|labat|szaja|hata|bore|feje|marja|pataja|nyaka|fara)", "(?:laba|szaja|hata|bore|pataja|marja) sebes",
    // "sebe" (his wound) only next to Hungarian words: alone it is the Portuguese hedge
    // ("Saltou a sebe sem tocar"), which a message with no marker words would read as Hungarian.
    `(?:(?:lo|${HORSE})(?:nak|nek)|nagy|kis|kisebb|mely|friss|nyilt|csunya|verzo|gennyes|regi|uj) sebe`,
    "sebe (?:van|volt|lett|nincs|keletkezett|verzik|gennyes\\w*|duzzadt|meleg|nedvedzik|(?:nem )?(?:be)?gyogyul\\w*|felszakadt|elfertozod\\w*)",
    "sebe a (?:laban|labat|labara|fejen|hatan|szajan|combjan|nyakan|marjan|patajan|faran|hasan|csudjen|terden)",
    "(?:(?:nem )?(?:be)?gyogyul\\w*|felszakadt|elfertozod\\w*|milyen|mekkora|hogy nez ki|hol van) a sebe",
    // bleeding
    "verzik", "verzett\\w*", "verzo", "\\w*verzes\\w*", "verez\\w*",
    "veres (?:lett|volt|a (?:szaja|laba|orra|nyala|vizelete))",
    // medicine and doses; not "adagol", which is also how feed is rationed
    "gyogyszer\\w*", "dozis\\w*", "antibiotikum\\w*", "fenilbutazon(?:t|ra|nal|bol)?", BRAND_INFLECTED,
    `(?:mennyi|mekkora adag|hany (?:ml|tasak|tabletta|gramm|g)) (?:\\w+ )?${BRAND}`,
    // fever and body temperature; not "laza volt" (was supple) or "lázasan" (feverishly, of preparing)
    "laza van", "lazzal", "hoemelked\\w*", "magas laz(?:a|at|zal)?", "lazmer\\w*", "lazcsillapit\\w*", "fokos laz\\w*",
    `(?:lo|${HORSE})(?:nak|nek) laza (?:volt|lett)`,
    `(?:lo|${HORSE}) homerseklet\\w*`, "homersekletet mer\\w*", "(?:megmert\\w*|mertem) (?:a |neki )?homerseklet\\w*",
    // a body temperature, given with a decimal: "38,7 a hőmérséklete"; not "a levegő hőmérséklete 35 fok"
    "(?<!(?:levego|viz|ido|kinti) )homerseklete (?:3[7-9]|4[01])[.,]\\d",
    "(?:3[7-9]|4[01])[.,]\\d (?:fok )?(?:a |volt a |lett a )?homerseklete",
    // not eating or drinking
    "nem eszik", "nem eszi", "nem evett", "nem (?:akar|hajland\\w*) (?:enni|inni)", "nem (?:iszik|ivott)",
    "(?:nincs|rossz|gyenge) (?:az )?etvagya", "etvagytalan\\w*",
    // cannot get up
    "nem (?:tud\\w*|bir\\w*) (?:fel(?:all\\w*|kel\\w*)|labra all\\w*)", "nem akar fel(?:allni|kelni)", "nem all fel", "nem kel fel",
    // pain: fáj, fájt, hátfájós, fájdalom, fájlalja; not "fájlalom" (I regret)
    "fajt", "fajnak", "fajna", "fajhat\\w*", "\\w*fajos\\w*", "fajdalom\\w*", "fajdalm\\w*", "fajlal(?!om\\b)\\w*",
    // sick, abscess, choke, breathing, tying up, eyes, gut
    `${HORSE} beteg\\w*`, `beteg (?:lett|lehet|a ${HORSE})`,
    "\\w*talyog\\w*", "felrenyel\\w*", "fulladoz\\w*", "kohog\\w*", "kohecsel\\w*", "nehezen (?:veszi a levegot|lelegzik)",
    "(?:ki)?folyik (?:az orra\\w*|a szeme\\w*)", "\\w*orrfolyas\\w*", "megfazott", "meg van fazva",
    // tying up; not "bemerevedett a tarkója", which is a horse bracing against the hand
    "bemerevedett (?:a )?(?:fara|combja|izma|izmai)", "(?:fara|combja|izmai?) bemerevedett",
    "izomgorcs\\w*", "konnyezik", "hunyorog\\w*", "csipas\\w*", "hasmenes\\w*",
  ],
  healthAccented: [
    // With their accents these are Hungarian only: "sánta" (lame) is not the
    // name Santa, "láza volt" (had a fever) is not "laza volt" (was supple),
    // "fáj" (hurts) is not "faj" (breed). "lázasan" (eagerly) is an idiom, not a fever.
    "sánta(?:ság\\p{L}*|nak|ként|v[áa]\\p{L}*)?", "lesántul\\p{L}*", "megsántul\\p{L}*",
    "láza (?:van|volt|lett|lesz|lehet|ment fel)", "lázas(?!an)\\p{L}*", "lázat", "lázmér\\p{L}*",
    "fáj(?:t|nak|hat\\p{L}*|na|ni|ós)?",
  ],
  healthWhenDetected: [
    // "Seb", "Laz" and "Genny" are names, "lo" and "is" are Spanish and English.
    "seb", "laz", "(?:lo|is) santa", "genny\\w*",
    // Also ordinary words: "faj" (species), "lazát" (loose), Spanish "lazas" (you lasso).
    "faj", "lazat", "lazas(?:ak|nak)?",
  ],
  unsafeOutput: [
    "diagnozis\\w*", "diagnoszt\\w*",
    // naming the condition: "valószínűleg patatályog", "ínhúzódásra gyanakszom", "ez csak egy kis húzódás";
    // not "gyulladásra utaló jel", which tells the rider what to look for
    `(?:nagy )?valoszinu(?:leg|seggel) (?:\\w+ ){0,2}${CONDITION_NAMED}`, `${CONDITION} (?:\\w+ )?(?:gyanakszom|utal|utalnak|utalhat\\w*)`,
    `ez (?:csak )?(?:egy )?(?:kis |enyhe |kezdodo )?${CONDITION_NAMED}`,
    // telling the rider the vet is not needed; not "nem kell állatorvosi igazolás" for a show
    "nem kell (?:\\w+ )?allatorvos(?:t|hoz|ra)?", "(?:felesleges|folosleges|szuksegtelen) (?:\\w+ )?allatorvos(?:t|hoz|ra)?",
    // prescribing: felír, "írjon fel", vény, recept for a medicine
    `${MEDICINE} (?:\\w+ ){0,2}felir\\w*`, `felir\\w* (?:\\w+ ){0,2}${MEDICINE}`,
    `${MEDICINE} (?:\\w+ ){0,2}(?:ir|irjon|irja|irhat\\w*|irna\\w*) fel`,
    `(?:ir|irjon|irja|irhat\\w*|irna\\w*) fel (?:\\w+ ){0,2}${MEDICINE}`,
    `receptet (?:\\w+ ){0,3}(?:allatorvos\\w*|${MEDICINE})`, "venyt", "venyre", "venykoteles",
    // dosing: "adj neki fenilbutazont", "fenilbutazont kaphat"
    `(?:adj|adjal|adhatsz|adhatod|adagolj|adagold) (?:\\w+ ){0,4}${MEDICINE}`,
    `${MEDICINE} (?:\\w+ )?kaphat\\w*`, `kaphat\\w* (?:\\w+ ){0,2}${MEDICINE}`,
    // clearance: safe to ride, cleared to work; not "nyugodtan lovagolj" or "lovagolható" (of an arena)
    "biztonsagosan (?:lovagolhat|dolgozhat|terhelhet|edzhet|versenyezhet|ugorhat|ugrathat|folytathat)\\w*",
    "biztonsagos (?:lovagolni|lovagolnod|lovagolnia|terhelni|dolgozni|versenyezni|ugratni|ugrani|edzeni)",
    "nyugodtan lovagolhat\\w* (?:rajta|vele)", "(?:ujra|megint) lovagolhat\\w* (?:rajta|vele)", "(?:ujra|megint) lovagolhatod",
    "terhelheto", "munkara alkalmas", "munkaba allhat\\w*", "visszaallhat\\w* (?:az? )?(?:\\w+ )?(?:munkaba|edzesbe|terhelesbe)",
    "(?:ujra|ismet|megint) elkezdheted (?:a |az )?(?:munkat|edzest|lovaglast|terhelest)",
    // days or weeks of rest, then work: "két hét pihenő után már nyugodtan versenyezhet"; not "rövid
    // pihenő után" within a ride, or "egy hét szünet után" of a holiday
    "(?:nap|het|honap)(?:nyi)? (?:piheno|pihenes|kihagyas) utan (?:\\w+ ){0,2}(?:lovagolhat|dolgozhat|versenyezhet|terhelhet|edzhet|ugorhat|ugrathat|mehet)\\w*",
    "garantaltan (?:meg)?gyogyul\\w*", "garantalt kezeles",
  ],
  unsafeOutputWhenDetected: [],
  /**
   * Frequent Hungarian words the other languages seldom write, plus "és",
   * which the Spanish pack counts as "es": counted here too, a Hungarian "és"
   * blurs the count instead of reading as Spanish. Not "a", "is", "mi",
   * "este", "el", "le", "be", "ha", "de", "ma", "már" or "ló", which are
   * everyday English, Spanish, Portuguese or Romanian words ("lo" is the
   * Spanish pronoun, "ma" the Romanian "mă", "mar" the Spanish and
   * Portuguese sea: "Galopamos junto al mar"). The commonest health words
   * count too, so a one- or two-word worry ("Sántít", "Lázas.") is still read
   * as Hungarian.
   */
  markers: [
    "az", "azt", "ez", "ezt", "es", "nem", "hogy", "van", "volt", "lett", "lehet", "legyen", "kell", "mit", "egy",
    "meg", "ki", "csak", "vagy", "mert", "akkor", "aztan", "olyan", "ilyen", "nagyon", "kicsit", "jo", "jol",
    "jobban", "rossz", "baj", "mindig", "minden", "semmit", "vissza", "mikor", "miert", "milyen", "hogyan", "mennyi",
    "mennyit", "hany", "melyik", "amikor", "tegnap", "holnap", "reggel", "ota", "utan", "elott", "kozben", "alatt",
    "neki", "nekem", "vele", "rajta", "masik", "megy", "mehet", "mehetek", "akar", "azota", "szerintem", "tudok",
    "tudom", "szeretnek", "csinaljak", "tegyek", "szia", "koszi", "koszonom",
    "lovam", "lovamnak", "lovamat", "lovammal", "lovat", "lovad", "lova", "lovak", "lonak", "lovon", "lovas",
    "kanca", "kancam", "kancat", "herelt", "hereltem", "paci", "pacim", "laba", "labat", "laban", "labara", "szaja",
    "hata", "szeme", "bal", "jobb", "edzes", "edzest", "edzesen", "ugetes", "ugetesben", "vagta", "vagtaban", "lepes",
    "lepesben", "ugras", "verseny", "versenyen", "versenyre", "palya", "palyan", "lovagolni", "lovagoljak", "lovagolhatok",
    "santit", "santitott", "kolikas", "lazas", "duzzadt", "dagadt", "verzik", "serult", "megserult", "faj",
    "fajdalmas",
  ],
  letters: /[őű]/,
  healthReply:
    "Szüneteltesd az edzést, és fordulj az állatorvoshoz, főleg ha a változás hirtelen, súlyos vagy romlik. Jegyezd fel, mikor kezdődött, milyen az étvágya és a viselkedése, a hőmérsékletét csak akkor, ha biztonságosan szoktad mérni, és minden látható duzzanatot. Nem tudok diagnózist felállítani, és nem dönthetem el, hogy a lovad dolgozhat-e újra.",
  providerReviewReply:
    "Nem tudok diagnózist felállítani, gyógyszert felírni, és nem dönthetem el, hogy egy ló dolgozhat-e. Egészségi probléma vagy sántaság esetén szüneteltesd az edzést, és fordulj az állatorvoshoz. Az edzéshez segíthetek tárgyilagos megfigyeléseket és kérdéseket összeállítani az edződnek.",
};
