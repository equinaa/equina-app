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
// People a rider writes about, so "az edzőm beteg lett" (my coach is ill) or
// "a lányom nem kel fel korán" is not read as the horse.
const PERSON =
  "(?:edzom|edzo|edzonk|edzonom|edzono|lovasedzom|oktatom|oktato|oktatonk|tanarom|tanar|tanarnom|anyam|anyukam|apam|apukam|" +
  "fiam|lanyom|ferjem|felesegem|parom|baratom|baratnom|testverem|gyerek|gyerekem|gyerekek|biro|lovas|lovasa|lovasom)";
// The rider's own body ("fáj a hátam", my back hurts): the horse's parts end in -a/-e, never in -m.
const OWN_PART =
  "(?:hatam|labam|labaim|terdem|derekam|fejem|vallam|kezem|combom|csipom|nyakam|fenekem|bokam|izmaim|mindenem|" +
  "karom|ujjam|hasam|torkom|csuklom|gerincem|vadlim|fogam|szivem|orrom|ajkam)";
// The same words as the accented terms see them: phones type some accents and skip others.
const ACCENTED_VOWEL: Record<string, string> = { a: "[aá]", e: "[eé]", i: "[ií]", o: "[oóöő]", u: "[uúüű]" };
const looseAccents = (folded: string) => folded.replace(/[aeiou]/g, (vowel) => ACCENTED_VOWEL[vowel] ?? vowel);
// Not the rider's own pain, nor a person's: "fáj a hátam", "a kezem fáj", "az edzőmnek fáj a háta".
const NOT_OWN_PART = `(?! (?:\\w+ )?(?:a |az )?${OWN_PART}\\b)`;
const NOT_PERSON_PAIN = `(?<!\\b(?:${PERSON}(?:nak|nek)|${OWN_PART}) )`;
const NOT_OWN_PART_ACCENTED = `(?! (?:\\p{L}+ )?(?:a |az )?${looseAccents(OWN_PART)}(?![\\p{L}\\p{M}]))`;
const NOT_PERSON_PAIN_ACCENTED =
  `(?<!(?<![\\p{L}\\p{M}])(?:${looseAccents(PERSON)}(?:n[aá]k|n[eé]k)|${looseAccents(OWN_PART)}) )`;
// Not "fáj, hogy kiestünk" (it pains me that we went out), which is about the result.
const NOT_IT_PAINS_ME = "(?!,? hogy\\b)";
const NOT_IT_PAINS_ME_ACCENTED = "(?!,? hogy(?![\\p{L}\\p{M}]))";
// Tack is damaged ("sérült a nyeregfa"), never injured; "a nyereg alatt" is where the horse is hurt.
const TACK_DAMAGED =
  "(?:nyereg|nyerge|nyerget|nyergem|nyergemet|nyergunk|nyeregfa\\w*|kantar|kantart|kantarja|kantarom|heveder|hevedert|hevedere|" +
  "hevederem|alatet|alatetet|alatete|alatetem|kengyel|kengyelt|kengyele|kengyelem|kengyelvas\\w*|kengyelszij\\w*)\\b(?! (?:alatt|alol|helyen|miatt)\\b)";
// A coach or rider called Seb comes, rides, teaches or says: "Seb holnap jön", "Kis Seb is jön lovagolni".
const NOT_SEB_THE_NAME =
  "(?! (?:(?:holnap|ma|most|is|majd|reggel|delutan|este|hetfon|kedden|szerdan|csutortokon|penteken|szombaton|vasarnap) )?" +
  "(?:az edzo\\w*|edzo\\w*|edz(?:i|ett|eni)?|tart|tanit\\w*|jon|jonnek|jott|lovagol\\w*|mondta|mondja|szerint)\\b)";
// The horse's legs and joints, for "dagadt a lába" and "megrándult a bokája".
const LIMB =
  "(?:laba\\w*|pataja\\w*|csudje\\w*|terde\\w*|bokaja\\w*|ina|inai|inat|izma\\w*|nyaka\\w*|hata\\w*|valla\\w*|csipoje\\w*|csanakja\\w*|csuklo\\w*)";
// Standing in the stirrups, rising trot, two-point: the rider, not a horse that cannot get up.
const NOT_RIDER_RISING = "(?!(?: \\w+){0,3} (?:kengyel\\w*|nyereg\\w*|nyergeben|konnyuget\\w*|ket ules\\w*)\\b)";
// Treats a horse may refuse without being off its feed.
const TREAT = "(?:repat|almat|jutalomfalat\\w*|cukrot|kekszet|jutalm\\w*|nasit|csemeget)";
// Feed and supplements, whose dose is a feeding question.
const FEED = "(?:elektrolit\\w*|sot|so|magnezium\\w*|vitamin\\w*|takarmany\\w*|zab\\w*|szena\\w*|abrak\\w*|kiegeszito\\w*|taplalekkiegeszito\\w*|olaj\\w*|muzli\\w*|pellet\\w*|mesz\\w*)";
// Pain killers riders call by their brand. Bare, they are the same word in
// every language (the Spanish pack already reads "bute"), so they count only
// with a Hungarian ending ("Bute-ot", "Danilont") or after a Hungarian amount
// ("mennyi Metacam"). Not "Butet", the saddle maker: unhyphenated "bute"+"t"
// is its name, so the accusative counts typed "Bute-t", "butét", or before a
// Hungarian dosing verb ("butet adtam neki").
const BRAND = "(?:bute|metacam|meloxicam|flunixin|finadyne|danilon|equipalazon)";
const BRAND_INFLECTED = `${BRAND}-?(?:ot|et|t|bol|tol|val|nal|nak|ban)(?<!\\bbutet)`;
const TACK = "(?:nyereg\\w*|nyerge\\w*|kantar\\w*|heveder\\w*|alatet\\w*|elite)";
const NOT_TACK = `(?!(?: \\w+){0,2} ${TACK}\\b)`;
// Medicines, for the prescribing and dosing word orders.
const MEDICINE =
  `(?:gyogyszer\\w*|antibiotikum\\w*|(?:fajdalom|laz)csillapit\\w*|(?:gyulladas|laz|fajdalom)csokkento\\w*|fenilbutazon\\w*|kenocs\\w*|${BRAND}\\S*)`;
// Conditions an answer must not name as the horse's diagnosis, in any case
// ("patairha-gyulladásra gyanakszom")...
const CONDITION =
  "(?:\\w*talyog\\w*|patairha\\w*|\\w*gyulladas\\w*|(?:in|izom)?huzodas\\w*|kolika\\w*|izom(?:gorcs|laz)\\w*|\\w*ficam\\w*|megrandul\\w*)";
// ...or as the subject of "ez", "valószínűleg" or "szerintem": "ez kólika", "valószínűleg megrándult",
// not "ez kólikát okozhat" of a feed change.
const CONDITION_NAMED =
  "(?:\\w*talyog|patairha-?gyulladas|\\w*gyulladas|(?:in|izom)?huzodas|kolika|izom(?:gorcs|laz)|\\w*ficam(?:odas)?|\\w*ficamod\\w*|megrandul\\w*)";
// Body parts that go warm or hot with inflammation.
const WARM_PART = "(?:laba|labai|pataja|patai|ina|inai|csudje|terde|bokaja|csanakja)";

export const hungarian: CoachLanguagePack = {
  health: [
    // colic, and its signs: "folyton a hasát nézi", "rugdossa a hasát"
    "kolika\\w*", "(?:nezi|rugja|rugdossa|harapja|harapdalja|kapalja) a hasat", "hasat (?:nezi|rugja|rugdossa|harapja|harapdalja)",
    // lameness: sántít, sántikál, sántaság, bicegett, lesántult, "a lovam sánta"; not the
    // Spanish "santito" (a little saint: "hoy fue un santito"), which "sántító" folds to
    "santit(?!(?:o|a|os|as)\\b)\\w*", "santikal\\w*", "santasag\\w*", "biceg\\w*", "(?:le|meg)santul\\w*", "santult\\w*",
    "santa(?:nak|n|va|-e)", `santa (?:lett|volt|lehet|lesz|maradt|a ${HORSE}|a (?:bal|jobb))`,
    // not "hogy Santa Fe-ben", "lovam Santa Cruz-ban"
    `(?:${HORSE}|kicsit|picit|enyhen|kisse|nagyon|eleg|mindig|hogy|szerintem|mert|mintha|talan) santa(?! (?:fe|cruz|claus|maria|barbara|anita|monica|rosa|lucia|clara)\\b)`,
    // favours a leg: "kíméli a bal elsőjét", "nem lép rá a lábára"
    // "nem terheli rendesen a jobb elsőt"; not "nem terheli túl / meg a lábát a sok ugrás?" (overloads)
    "(?:kimel(?:i|te)|nem terheli) (?:(?!tul|meg\\b|nagyon\\b)\\w+ )?(?:a )?(?:bal |jobb )?(?:labat|labait|elsot|elsojet|hatsot|hatsojat|patajat|(?:elso|hatso) labat)",
    "nem (?:all ra|lep ra|(?:akar|mer|tud|bir) ra(?:lepni|allni)) (?:a )?(?:bal |jobb )?(?:labara|elsore|elsojere|hatsora|hatsojara|(?:elso|hatso) labara)",
    // swelling, inflammation, laminitis; heat in a leg or hoof: "meleg a lába", "forró a patája"
    "\\w*duzzad\\w*", "\\w*duzzanat\\w*", "\\w*puffad\\w*", "odema\\w*", "\\w*gyullad\\w*", "felpattas\\w*",
    // "bedagadt", "dagadt a lába", "a csüdje dagadt"; not "a lovam kicsit dagadt" or "dagadtabb lett", which are fat
    "\\w+dagad\\w*", "dagad(?!t\\b|tabb)\\w*",
    `(?<!\\b(?:${HORSE}|lo|tul|kicsit|picit|nagyon|eleg|kisse|egy|kover) )dagadt(?! (?:a |az )?(?:${HORSE}|lo|lovat|kanca\\w*|poni\\w*)\\b)`,
    `dagadt (?:a |az )?(?:(?:${HORSE}|lo) )?(?:bal |jobb )?(?:(?:elso|hatso) )?(?:${LIMB}|szeme\\w*|szaja\\w*|hasa|feje|marja|fara|combja)`,
    `(?:${LIMB}|szeme|szaja|hasa|feje|marja|fara|combja) (?:\\w+ )?dagadt`,
    `(?:meleg|forro) (?:a |az )?(?:(?:${HORSE}|lo) )?${WARM_PART}`, `${WARM_PART} (?:\\w+ )?(?:meleg|forro)`,
    // injury and wounds; not "sebes" alone, which is also fast
    // "sérült", "megsérült", "ínsérülés"; not "megsérültem" or "sérült a kezem" (the rider), "sérült
    // nyeregfa" (tack), nor the Romanian "serul" (the serum) and "Sebeșul" (the town), which have no ending
    `(?<!\\b${TACK_DAMAGED} (?:is )?)\\w*serul(?!tem\\b|tunk\\b|tel\\b|ok\\b)(?=[tehnvoj])\\w*${NOT_OWN_PART}(?! (?:az? )?${TACK_DAMAGED})`,
    `(?:meg|le|ki|be)serul${NOT_OWN_PART}`,
    "\\w*sebesul(?=[tehnvoj])\\w*", "megsebesul", "\\w*sebesed\\w*", "\\w*sebzes\\w*", "megsebez\\w*", "\\w*horzsol\\w*", "\\w*zuzod\\w*",
    "(?:in|izom)huzod\\w*", `huzodas(?!om\\b|aim\\b)\\w*${NOT_OWN_PART}`, "(?:meg|el)vagta magat", "genny(?:es|ed|ez)\\w*",
    "(?:meg|fel|le)sertette (?:a |az )?(?:bal |jobb )?(?:(?:elso|hatso) )?(?:labat|patajat|szajat|szemet|boret|terdet|csudjet|fejet|hatat|nyakat|farat|marjat|bokajat|inat|magat)",
    // a sprain or twist: "megrándult a bokája", "a lába megrándult"; not "megrándult a ló a zajra" (flinched)
    `megrand(?:ult|ulhatott|ulhat|itotta|itott) (?:a |az )?(?:(?:${HORSE}|lo) )?(?:bal |jobb )?(?:(?:elso|hatso) )?${LIMB}`,
    `${LIMB} (?:\\w+ )?megrand(?:ult|ulhatott|ulhat)`, "megrandulas\\w*",
    // sprains: "kificamodott", "bokaficam", "ficamot kapott"; not a bare open
    // stem, which is the Portuguese "ficam" (they stay) and every -ficamos verb
    "(?:ki|meg|el)ficam\\w*", "(?:boka|csud|terd|vall|csipo|ujj|kez|lab|nyak)ficam\\w*",
    "ficam(?:ot|a|at|ja|jat|ra|ba|bol|tol|mal|nal|nak|ok|ai|od\\w*|it\\w*|ul\\w*)",
    "(?:egy|kis|enyhe|nagy|csunya|boka|csud|terd|vall|csipo|hogy|talan|szerintem|biztos|lehet) ficam",
    "ficam(?:-e| (?:van|volt|lett|lehet|lesz|gyanu\\w*))",
    // "ficam a bokáján"; not the European Portuguese "ficam a ver" (they keep watching)
    "ficam (?:van )?(?:a |az )?(?:bal |jobb )?(?:(?:elso|hatso) )?(?:bokajan|bokajaban|laban|lababan|labain|csudjen|csudjeben|terden|terdeben|vallan|vallaban|csipojen|nyakan|hatan|elson|hatson)",
    // bare "sebek" waits for a Hungarian message: Sebek is also a name
    "seb(?:et|ek\\w+|ei\\w*|ere|en|eben)", `(?:egy|mely|nyilt|verzo|friss|kis|nagy|csunya) seb${NOT_SEB_THE_NAME}`,
    // not "Seb van Dijk", nor "Seb lett az edzőm"
    `seb (?:lett|keletkezett)(?! (?:az? )?${PERSON}\\b)`, "seb van(?=(?:-e)?(?: (?:a|az|rajta|neki)\\b|\\s*(?:[.,;!?]|$)))",
    `sebes (?:lett )?a (?:(?:${HORSE}|lo) )?(?:laba|labat|szaja|hata|bore|feje|marja|pataja|nyaka|fara)`, "(?:laba|szaja|hata|bore|pataja|marja) sebes",
    // "sebe" (his wound) only next to Hungarian words: alone it is the Portuguese hedge
    // ("Saltou a sebe sem tocar"), which a message with no marker words would read as Hungarian.
    `(?:(?:lo|${HORSE})(?:nak|nek)|nagy|kis|kisebb|mely|friss|nyilt|csunya|verzo|gennyes|regi|uj) sebe`,
    "sebe (?:van|volt|lett|nincs|keletkezett|verzik|gennyes\\w*|duzzadt|meleg|nedvedzik|(?:nem )?(?:be)?gyogyul\\w*|felszakadt|elfertozod\\w*)",
    "sebe a (?:laban|labat|labara|fejen|hatan|szajan|combjan|nyakan|marjan|patajan|faran|hasan|csudjen|terden)",
    "(?:(?:nem )?(?:be)?gyogyul\\w*|felszakadt|elfertozod\\w*|milyen|mekkora|hogy nez ki|hol van) a sebe",
    // bleeding; not "vérzik az ujjam a szártól" (the rider), nor the Romanian "înverzește" (greens)
    `(?<!\\b${OWN_PART} )(?:verzik|verzett\\w*|verzo)${NOT_OWN_PART}`, "\\w*verzes(?!(?:c|ti|te)\\b)\\w*",
    "verez(?:ik|ni|het\\w*|ett\\w*|nek|ne)",
    "veres (?:lett|volt|a (?:szaja|laba|orra|nyala|vizelete))",
    // medicine and doses; not "adagol", which is also how feed is rationed
    // and not "mekkora dózis elektrolitot" or "a zabból mekkora dózist", which are feed
    "gyogyszer\\w*", `(?<!\\b${FEED} (?:\\w+ )?)dozis\\w*(?! (?:\\w+ )?${FEED}\\b)`, "antibiotikum\\w*",
    "fenilbutazon(?:t|ra|nal|bol)?", BRAND_INFLECTED,
    `(?:mennyi|mekkora adag|hany (?:ml|tasak|tabletta|gramm|g)) (?:\\w+ )?${BRAND}`,
    `(?:mennyi|mekkora adag|hany (?:ml|tasak|tabletta|gramm|g)) (?:(?!egy )\\w+ )?butet${NOT_TACK}`,
    // not the horse Butet getting its feed or tack: "Butet kapott ma zabot", "Butet kapott egy új nyerget"
    `butet${NOT_TACK} (?:\\w+ ){0,2}(?:ad(?:tam|tunk|tal|ott|jak|junk|hatok|hatunk|hatsz|hat|jon|ni|j)|kap(?:ott|ta|hat\\w*|jon|ja))(?!(?: \\w+){0,2} (?:${FEED}|${TREAT}|${TACK})\\b)`,
    `(?:ad(?:tam|tunk|tal|ott|jak|junk|hatok|hatunk|hatsz|hat|jon|j)|kap(?:ott|ta|hat\\w*|jon|ja)) (?:\\w+ ){0,2}butet${NOT_TACK}`,
    // fever and body temperature; not "laza volt" (was supple) or "lázasan" (feverishly, of preparing)
    "laza van", "lazzal", "hoemelked\\w*", "magas laz(?:a|at|zal)?", "lazmer\\w*", "lazcsillapit\\w*", "fokos laz\\w*",
    // not "a lovamnak laza volt a háta", the supple back the training scale asks for
    `(?:lo|${HORSE})(?:nak|nek) laza (?:volt|lett)(?! a (?:hata|nyaka|tarkoja|jarasa|hatizma|izma|izmai|ugetese|vagtaja|lepese|kontaktja|allkapcsa)\\b)`,
    `(?:lo|${HORSE}) homerseklet\\w*`, "homersekletet mer\\w*", "(?:megmert\\w*|mertem) (?:a |neki )?homerseklet\\w*",
    // a body temperature, given with a decimal: "38,7 a hőmérséklete"; not "a levegő (mai) hőmérséklete 38,5"
    "(?<!\\b(?:levego|viz|ido|kinti|kulso|palya|talaj|homok|istallo|lovarda|terem|szallito|utanfuto|auto)\\w* (?:\\w+ )?)homerseklete (?:3[7-9]|4[01])[.,]\\d",
    "(?:3[7-9]|4[01])[.,]\\d (?:fok )?(?:a |volt a |lett a )?homerseklete",
    // not eating or drinking; not "nem eszi meg a répát a kezemből" or "nem eszik almát", a treat refused
    `(?<!\\b${TREAT} )nem (?:eszik|evett)(?! (?:\\w+ )?${TREAT}\\b)`, `(?<!\\b${TREAT} )nem eszi(?! (?:meg )?(?:a |az )?${TREAT}\\b|(?: meg)? a kezembol)`,
    "nem (?:akar|hajland\\w*) (?:enni|inni)", "nem (?:iszik|ivott)",
    "(?:nincs|rossz|gyenge) (?:az )?etvagya", "etvagytalan\\w*",
    // cannot get up: the horse, never "nem tudok felállni a kengyelben" (I, in the stirrups)
    `(?<!\\b${PERSON} )nem (?:tud|tudott|tudna|tudnak|tudtak|tudja|tudta|bir|birt|birna|birnak|birja) (?:fel(?:all\\w*|kel\\w*)|labra all\\w*)${NOT_RIDER_RISING}`,
    `(?<!\\b${PERSON} )(?:nem akar fel(?:allni|kelni)|nem all fel|nem kel fel)${NOT_RIDER_RISING}`,
    // pain: fáj, fájt, hátfájós, fájdalom, fájlalja; not "fájlalom" (I regret),
    // nor the rider's own pain ("fájt a hátam", "hátfájós vagyok", "fájdalmaim")
    `${NOT_PERSON_PAIN}(?:fajt|fajnak|fajna|fajhat\\w*)${NOT_OWN_PART}${NOT_IT_PAINS_ME}`,
    // "hátfájós", "fájós a lába"; not the Spanish "fajos" (bundles: "dos fajos de heno")
    "(?:hat|lab|fej|has|terd|izom|izulet|derek|nyak|pata|marj|kereszt|csud|fog|torok)fajos\\w*(?! vagyok\\b)",
    "fajos(?:ak|abb\\w*|sag\\w*|an)?(?= (?:lett|volt|lehet|lesz|maradt)\\b| (?:a |az )?(?:bal |jobb )?(?:(?:elso|hatso) )?(?:laba\\w*|hata|pataja|nyaka|marja|fara|terde|csudje|bokaja|izma\\w*|ina|szaja|feje|hasa)\\b)",
    `${NOT_PERSON_PAIN}(?:fajdalom\\w*|fajdalm(?!aim\\b)\\w*)${NOT_OWN_PART}`, "fajlal(?!om\\b)\\w*",
    // sick, abscess, choke, breathing, tying up, eyes, gut; not "az edzőm beteg lett" or "megfázott az edzőm"
    `${HORSE} beteg\\w*`, `beteg a ${HORSE}`, `(?<!\\b${PERSON} )beteg (?:lett|lehet|volt|lesz)(?! (?:az? )?${PERSON}\\b)`,
    "\\w*talyog\\w*", "felrenyel\\w*", "fulladoz\\w*", "kohog(?!ok\\b|tem\\b)\\w*", "kohecsel\\w*", "nehezen (?:veszi a levegot|lelegzik)",
    "(?:ki)?folyik (?:az orra\\w*|a szeme\\w*)", "\\w*orrfolyas\\w*",
    `(?<!\\b${PERSON} )(?:megfazott|meg van fazva)(?! (?:az? )?${PERSON}\\b)`,
    // tying up; not "bemerevedett a tarkója", which is a horse bracing against the hand
    "bemerevedett (?:a )?(?:fara|combja|izma|izmai)", "(?:fara|combja|izmai?) bemerevedett",
    "izomgorcs\\w*", "konnyezik", "hunyorog\\w*", "csipas\\w*", "hasmenes\\w*",
  ],
  healthAccented: [
    // With their accents these are Hungarian only: "sánta" (lame) is not the
    // name Santa, "láza volt" (had a fever) is not "laza volt" (was supple),
    // "fáj" (hurts) is not "faj" (breed). "lázasan" (eagerly) is an idiom, not a fever.
    // Not the rider's own: "lázas vagyok", "fáj a hátam", "az edzőmnek fáj a háta".
    "sánta(?:ság\\p{L}*|nak|ként|v[áa]\\p{L}*)?", "lesántul\\p{L}*", "megsántul\\p{L}*", "sántít\\p{L}*",
    "láza (?:van|volt|lett|lesz|lehet|ment fel)", "lázas(?!an)\\p{L}*(?! vagyok(?![\\p{L}\\p{M}]))", "lázat", "lázmér\\p{L}*",
    `${NOT_PERSON_PAIN_ACCENTED}fáj(?:t|nak|hat\\p{L}*|na|ni|ós(?:ak)?(?! vagyok(?![\\p{L}\\p{M}])))?${NOT_OWN_PART_ACCENTED}${NOT_IT_PAINS_ME_ACCENTED}`,
    // "Butét" (bute, accusative) with its accent; typed plain it is the saddle maker Butet.
    "butét",
  ],
  healthWhenDetected: [
    // "Seb", "Laz" and "Genny" are names, "lo" and "is" are Spanish and English.
    // Not "Seb az edzőm", "Seb tart edzést", "Seb van Dijk".
    // Not "Seb holnap jön", "Kis Seb is jön lovagolni" either.
    `seb(?! van(?!(?:-e)?(?: (?:a|az|rajta|neki)\\b|\\s*(?:[.,;!?]|$))))${NOT_SEB_THE_NAME}`,
    "laz", "(?:lo|is) santa", "genny\\w*", "sebek",
    // Also ordinary words: "faj" (species: "milyen faj"), "lazát" (loose), Spanish "lazas" (you
    // lasso), Spanish "santito" / "santitas" (little saint), which "sántító" and "sántítás" fold to.
    `(?<!\\b(?:milyen|melyik|mint|egy) )${NOT_PERSON_PAIN}faj${NOT_OWN_PART}${NOT_IT_PAINS_ME}`, "lazat", "lazas(?:ak|nak)?(?! vagyok\\b)",
    "santit(?:o|as)",
  ],
  unsafeOutput: [
    "diagnozis\\w*", "diagnoszt\\w*",
    // naming the condition: "valószínűleg patatályog", "ínhúzódásra gyanakszom", "ez csak egy kis húzódás";
    // not "gyulladásra utaló jel", which tells the rider what to look for
    `(?:nagy )?valoszinu(?:leg|seggel) (?:\\w+ ){0,3}${CONDITION_NAMED}`, `${CONDITION} (?:\\w+ )?(?:gyanakszom|utal|utalnak|utalhat\\w*)`,
    `(?:ez|szerintem|szerintem ez) (?:csak )?(?:egy )?(?:kis |enyhe |kezdodo )?${CONDITION_NAMED}`,
    // ruling one out is naming it too: "ez nem kólika, nyugodtan lovagolhatsz"
    `ez (?:(?:valoszinuleg|biztosan|biztos|szerintem) )?nem (?:csak )?(?:egy )?${CONDITION_NAMED}`,
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
