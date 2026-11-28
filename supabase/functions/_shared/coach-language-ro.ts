import type { CoachLanguagePack } from "./coach-language-pack.ts";

/**
 * Romanian. Terms are folded: see coach-language-pack.ts.
 *
 * Romanian nouns usually carry their article ("durerea", "rănile") and verbs
 * conjugate, so words are written with their Romanian endings rather than as
 * open stems: an open stem would also catch the Portuguese and Spanish word
 * ("abcesso", "antiinflamatorio") and answer that rider in Romanian. Where a
 * Romanian word also has a riding sense, that sense is left out: "febră
 * musculară" is the rider's own soreness, a horse that "se umflă" at the girth
 * is blowing out, one that "nu se ridică în față" is not lifting its
 * forehand, and "dozez efortul" is pacing the work.
 */

// "Nu se ridică în față / la galop" is a horse not lifting its forehand, not one that is down; "nu se
// ridică în scărițe / din șa / în două puncte" is the rider, "nu se ridică la nivelul așteptărilor" an
// idiom, "nu se mai ridică în două picioare" a horse that stopped rearing. "În picioare" (stand up) counts.
const NOT_LIFTING =
  "(?! (?:bine |suficient |destul |deloc )?(?:in|din|pe|la|peste) (?:fata|spate|galop|trap|sarituri|salt|obstacol\\w*|oxer\\w*|bar[ae]|scarit\\w*|sa|sea|saua|seaua|doua puncte|trei puncte|pozitie\\w*|doua picioare|nivel\\w*|inaltime\\w*|asteptari\\w*)\\b)";
// Things a rider pumps up: "cât de umflate să fie roțile", "baloane umflate", "umflarea roților" with a
// pump. Not "umflat ca un balon", which is the leg. "Balonat" (bloated) is a colic sign, so it is not one.
const INFLATABLE =
  "(?<!\\b(?:ca|cat|precum|ca si) (?:un |o |niste )?)(?:roti|rotile|rotii|rotilor|roata|roatele|anvelop\\w*|cauciuc\\w*|pneu\\w*|balon(?:ul|ului|ase\\w*)?|baloan\\w*|ming(?:e|ea|i|ii|ile)|saltea\\w*|pomp(?:a|e|ei|ii|ele)|compresor\\w*|presiun\\w*)";
// Where the heat or the degrees are the weather, a place or a slope, not the horse: "remorca are 40 de
// grade", "panta are 40 de grade".
const NOT_HORSE =
  "(?:remorca|remorcii|duba|dubei|manejul|manej|padocul|padoc|grajdul|grajd|boxa|boxei|apa|aerul|terenul|nisipul|masina|camionul|afara|vremea|ziua|orasul|arena|pista|camera|panta|dealul|rampa|unghiul|inclinatia)";
// Another person (the coach, a child, the farrier) as the subject: "antrenorul s-a accidentat la schi",
// "pe antrenor îl doare spatele", "antrenoarea mea are dureri de spate". Not "calul de la antrenorul meu
// s-a lovit", nor "antrenorul zice că îl doare", where the horse is meant.
const PERSON =
  "(?:antrenor|antrenorul|antrenoare|antrenoarea|instructor|instructorul|instructoare|instructoarea|profesor|profesorul|profesoara|fiica|fiul|fiu|copilul|copila|baiatul|fetita|sotul|sotia|prietenul|prietena|colegul|colega|mama|tata|fratele|sora|bunicul|bunica|potcovarul|groomul|ingrijitorul|ingrijitoarea|jocheul|calaretul|calareata|arbitrul|judecatorul|judecatoarea)";
const PERSON_SUBJECT =
  `(?<!(?<!\\b(?:de la|lui|al|ai|ale|cu|pentru|despre) )\\b${PERSON}(?: (?:meu|mea|mei|mele|nostru|noastra|tau|ta|lui|ei))?(?: (?:e|este|era|a|a fost|au|pare|s-a|sa|si-a|si|tot|cam|foarte|putin|iar|mai|deja|inca|azi|ieri|aseara|are|avea|simte|il|o|ii|i|le|cazut|cazuta)){0,4} )`;
// Treats and hand-feeding: "nu vrea să mănânce morcovi din mână" is a habit, not going off feed.
const TREATS = "(?:morcovi|mere|zahar|bomboane|recompense|delicatese|din mana|din palma)";
// What a rider portions out that is not medicine: feed, supplements, work, and "o doză de răbdare".
const NOT_MEDICINE =
  "(?:ovaz|fan|lucerna|concentrat\\w*|furaj\\w*|granule|peleti|tarate|morcov\\w*|sare|electrolit\\w*|vitamin\\w*|suplimen\\w*|ulei|magneziu|biotin\\w*|calciu|mineral\\w*|orz|porumb|seminte|melasa|sfecla|pulpa|mash|fibre|zinc|seleniu|protein\\w*|omega|drojdie|efort\\w*|antrenament\\w*|lucru\\w*|munc\\w*|intensitat\\w*|galop\\w*|trap\\w*|sarituri|exercit\\w*|rabdare|curaj|umor|noroc|adrenalina|motivatie|incredere|stres|risc|energie)";
// The day's heat right after the word: "a făcut o temperatură de 40 de grade afară".
const WEATHER_AFTER =
  "(?!(?: (?:mare|ridicata|crescuta|de \\d+(?:[.,]\\d+)?(?: de)? grade))? (?:afara|la umbra|la soare|in soare)\\b)";
// A calming supplement ("calmant natural", "pe bază de plante") is feeding, not medicine.
const HERBAL = "(?! (?:natural\\w*|pe baza de plante|din plante|vegetal\\w*|homeopat\\w*)\\b)";
const DRUGS =
  `(?:fenilbutazon\\w*|dexametazon\\w*|flunixin\\w*|bute|antiinflamat\\w*|calmant\\w*${HERBAL}|antibiotic\\w*|medicament\\w*|analgezic\\w*|sedativ\\w*|paracetamol|ibuprofen|aspirin\\w*|algocalmin\\w*|metamizol\\w*|cortizon\\w*)`;
const BODY =
  "(?:picior\\w*|genunch\\w*|capul|ochi\\w*|copit\\w*|jaret\\w*|fluier\\w*|spatele|gatul|tendon\\w*|ligament\\w*|buza|gura|coada|pielea|crupa|pieptul|umarul|soldul|glezn\\w*|chisit\\w*)";
// The body part after "o rană la ...", which Romanian writes without the article.
const BODY_AFTER_LA =
  "(?:cap|picior\\w*|genunch\\w*|ochi\\w*|copit\\w*|jaret\\w*|fluier\\w*|spate|gat|tendon\\w*|buza|gura|coada|crupa|piept|umar|sold|glezn\\w*|chisit\\w*|fesa|burta|greaban|nas|ureche|urechi|bot|coaps\\w*|cot|corp|flanc\\w*)";

export const romanian: CoachLanguagePack = {
  health: [
    // Colic, and the signs riders describe: looking at or kicking the belly, rolling non-stop.
    "colic(?:i|ii|ile|ilor)", "(?:face|facut|are|avut|avea|cu|o|ca e|ca este) colica",
    "crampe (?:la|de) (?:burta|stomac)", "crampe abdominale", "nu (?:a |mai |a mai )?(?:facut|face) balegar",
    "se (?:tot )?uita (?:mereu |des |intruna |tot timpul )?(?:la|spre) (?:burta|flanc\\w*|abdomen)(?![^.?!]{0,40}\\bching)",
    "isi (?:priveste|musca|loveste) (?:burta|flanc\\w*)",
    "(?:da|loveste|bate) cu (?:piciorul|picioarele|copita) (?:din spate )?(?:in|spre|la) burta",
    // Not "se tăvălește după baie", which every horse does.
    "se tavaleste (?:intruna|intr-una|incontinuu|non-?stop|tot timpul)", "(?:transpira|asuda)(?: \\w+){0,2} si se tavaleste",
    "se tavaleste si (?:transpira|asuda|se uita)",
    // Lameness. Not "nu se sprijină pe frâu", which is the contact.
    "schiop\\w*", "schioap\\w*", "sontac\\w*",
    "nu (?:mai )?calca (?:bine |deloc )?pe (?:picior\\w*|stangul|dreptul)",
    "calca (?:greu|ciudat|nesigur|strain|cu grija) pe (?:picior\\w*|stangul|dreptul|un picior)",
    "nu (?:mai )?pune (?:deloc )?piciorul (?:jos|in pamant|pe pamant)",
    "nu se (?:mai )?sprijina (?:deloc |bine |cum trebuie |normal )?pe(?! (?:frau\\w*|zabal\\w*|mana|mainile|contact\\w*|ham\\w*|pinten\\w*)\\b)",
    "calcat (?:intr-un|intr-o|intrun|pe un|pe o|in) (?:cui|piron|surub|sarma|ciob|sticla|bucata de (?:sticla|fier|metal))",
    "cui (?:in|la|infipt in) (?:copit\\w*|talpa|picior\\w*)", "infundar(?:e|ea|ii)",
    // Swelling, heat, inflammation, hoof and eye. Not "am umflat roțile" (I pumped up the tyres), nor
    // tyres, balloons, a ball or a pump nearby. "S-a umflat" (also typed "sa umflat", "sau umflat") and a
    // leg next to the word count whatever is nearby ("s-a speriat de un balon, acum are piciorul umflat");
    // "să umflați" (you pump up) and "moi sau umflate" (or inflated) do not.
    `(?<!\\b(?:am|ai|ati) )(?<!\\b${INFLATABLE}\\b[^.?!,;]{0,30})umflat\\w*(?![^.?!,;]{0,30}\\b${INFLATABLE}\\b)`,
    "s-?au? umflat", `${BODY} (?:\\w+ ){0,2}umflat\\w*`, `umflat\\w* (?:la |pe )?${BODY}`,
    `(?<!\\b${INFLATABLE}\\b[^.?!,;]{0,30})umflar(?:e|ea|i|ii)(?![^.?!,;]{0,30}\\b${INFLATABLE}\\b)`,
    // "Se umflă" at the girth (chingă, burtieră, șa) is blowing out; "mingea nu se mai umflă" is the ball.
    `(?<!\\b${INFLATABLE}\\b[^.?!,;]{0,30})umfla(?![^.?!]{0,40}\\b(?:ching|burtier|saua|seaua)|[^.?!,;]{0,40}\\b${INFLATABLE}\\b)`,
    "are apa (?:in|la) picio\\w*",
    "inflamat(?:a|e|i|ie|ia|ii|iei|iile|iilor)?", "antiinflamato(?:r|rul|rului|are|arele|rii|rilor)",
    "edem(?:ul|e|ele)?", "tendinit(?:a|ei)", "abces(?:ul|ului|e|ele|elor)?", "puroi\\w*", "laminit(?:a|ei)",
    "conjunctivit(?:a|ei)", "lacrimeaz\\w*", "ochiul (?:rosu|tulbure|inchis)",
    "(?:tendon|tendonul|copita|copitele|piciorul|picioarele|genunchiul|jaretul) (?:e |este |sunt )?(?:cald|calda|calde|fierbinte|fierbinti)",
    "(?:cald|calda|calde|fierbinte) la atingere",
    // Wounds and injuries. Bare "rana" is Spanish too, and a name: see healthWhenDetected. Not
    // Spanish "la rana la limpio" (the frog of the hoof), "monté a Rana la semana pasada", "mi yegua
    // Rana la monto", "una plaga la verdad", "esta plaga la tenemos" (a pest) or the name "Ranita":
    // after "la" only a body part counts here, the rest waits for Romanian.
    "ranit(?:i|e|ul)?", "ran(?:ii|ile|ilor)", "plag(?:ii|ile|ilor)", "(?:are o|cu o|cu) (?:ran[ai]|plag[ai]|ruptur\\w*)",
    `(?<!\\b(?:la|una|a|es|son|que) )(?:ran[ai]|plaga) (?:pe|deschis\\w*|adanc\\w*|la ${BODY_AFTER_LA})`,
    "ruptur(?:i|ii|ile|ilor)",
    `${PERSON_SUBJECT}(?:s|si)-?a rupt (?:\\w+ )?(?:tendon\\w*|ligament\\w*|piciorul|un picior|osul|un os|glezna|fluierul)`, "leziun\\w*",
    // Not the coach or a child ("instructoarea s-a lovit la mână"), nor "s-a tăiat curentul".
    `${PERSON_SUBJECT}s-?a (?:accidentat|lovit|taiat|inecat|julit|zgariat)(?! (?:curentul|curent|apa|lumina|gazul|internetul|semnalul|lectia|antrenamentul|proba|concursul)\\b)`,
    "accidentar(?:e|ea|ii)",
    `${PERSON_SUBJECT}si-?a (?:julit|zgariat|taiat|lovit|ranit|sucit|luxat|scrantit|fracturat) (?:\\w+ )?${BODY}`,
    // Not the rider kicked by the horse: "m-a lovit la picior", "am fost lovită la genunchi".
    `${PERSON_SUBJECT}(?<!\\b(?:am fost|m-a|m-au|ma) )lovit\\w* la (?:ochi|picior\\w*|cap|genunchi\\w*|spate|copit\\w*)`, "vanata(?:i|ie|ia)",
    // Sick. Not the rider ("sunt bolnavă", "am fost bolnavă o săptămână") nor the coach.
    `${PERSON_SUBJECT}(?<!\\b(?:sunt|eram|am fost|ma simt|ma fac|fiind|esti|sunteti|suntem|eu)(?: (?:cam|tot|foarte|putin|un pic|iar|si|inca|deja|mai))* )bolnav(?:a|i|e|ul|ii)?`,
    `${PERSON_SUBJECT}(?<!\\b(?:m|te|ne|v)-?(?:am|ai|ati)? (?:\\w+ )?)imbolnav\\w*`,
    // Not the names Julita and Julito: bare "julita" waits for Romanian (healthWhenDetected).
    "taietur\\w*", "zgarietur\\w*", "julit(?:e|i|ul)?", "julitur\\w*", "entors(?:a|ei)", "scrantit\\w*",
    "infect(?:at|ata|ate|ati|ie|ia|ii|iei)",
    // Medication and dosing.
    // "Calmantul natural / pe bază de plante" is a calming supplement.
    "medicament(?:e|ul|ului|ele|elor)", "antibiotic(?:ul|ului|e|ele|elor)",
    `(?<!suplimen\\w* )calmant(?:ul|ului|ele|elor)${HERBAL}`,
    "injecti(?:e|a|i|ii|ile|ilor)",
    // Drug names are spelled the same in Portuguese and Spanish, so only the Romanian giving counts.
    `(?:sa-?i|ii|i-?am|i-?a|i-?ai) (?:mai )?(?:dau|dai|da|dat|fac|faci|facut|administrez|administrat) (?:o |un |niste |doza de |o doza de )?${DRUGS}`,
    `(?:${DRUGS}|tratament\\w*) (?:(?:pot|poti|pot sa|trebuie sa|as putea sa|e bine sa|e ok sa) )?(?:sa-?i|ii|i) (?:pot |mai |trebuie |as putea )?(?:da|dau|fac|administrez)`,
    // A ration of feed or a supplement, also "o doză mai mare de ovăz" or "doza de 30 g de electroliți",
    // pacing the work ("dozez efortul") and "o doză de răbdare" are not a dose of medicine.
    `doz(?:a|ez|ezi|eaza|ele|ei|elor|aj\\w*|are|area)(?! (?:(?:corecta|zilnica|recomandata|potrivita|mai mare|mai mica|dubla|buna|exacta|optima|maxima|minima|normala|necesara|mica|mare|zdravana|serioasa) )?(?:de |a |al |la |cu )?(?:\\d+(?:[.,]\\d+)? ?(?:g|gr|grame|kg|ml|l|litri|linguri\\w*|lingurit\\w*|masur\\w*|can\\w*|pumn\\w*)? (?:de )?)?${NOT_MEDICINE}\\b)`,
    // Fever. Not the rider's "febră musculară", nor the rush or nerves before a show ("în febra
    // pregătirilor", "febra concursurilor", "febra dinainte de concurs", "febra startului"), nor a trailer
    // or an arena that "are 40 de grade".
    "febra(?! (?:a |de )?(?:muscular\\w*|dinainte\\w*|concurs\\w*|competiti\\w*|pregatiri\\w*|sezon\\w*|campionat\\w*|start\\w*|examen\\w*|cumparaturi\\w*|sarbatori\\w*))",
    // "Are febră (de) dinainte de concurs" is a fever that started before the show.
    "(?:are|avea|a avut|face|facea|a facut) febra (?:de )?dinainte", "febril(?:a|i)",
    `(?<!\\b${NOT_HORSE} )are (?:3[89]|4[012])(?:[.,]\\d+)?(?: de)? grade(?! (?:afara|vara|la umbra|in soare|la soare))`,
    // Bleeding. Not bare "sânge": "pur-sânge", "sânge cald".
    "sanger(?:a|e)\\w*", "curge (?:sange|din nas)", "sange (?:din|pe) (?:nas|gura|picior\\w*|copit\\w*)",
    "sange in (?:urina|balega|scaun|nas|gura)",
    // Dark urine after work (tying up).
    "urina (?:lui |ei )?(?:e |este |e foarte |foarte |a devenit |era )?(?:inchisa|maro|rosie|rosiatica|neagra|ca (?:cafeaua|ceaiul|coca-cola))",
    // Breathing, discharge, choke, gut. Not Latin American Spanish "le tusé las crines", "hoy tusé la
    // cola" (trimmed the mane, the tail).
    "(?<!\\b(?:le|lo|la|les|los|me|te|se|yo|ya|hoy|ayer|y) )tuse(?! (?:las|la|el|los) (?:crines|crin|cola|copete|tusa)\\b| a la (?:yegua|potra)\\b| al (?:caballo|potro)\\b)",
    "tus(?:ea|este|esc|ind|it)", "respira (?:foarte )?(?:greu|cu greutate|repede|zgomotos|sacadat)",
    "scurger\\w* (?:\\w+ )?(?:din|la|pe) (?:nas|nari|ochi\\w*|ureche|urechi|vulva)", "scurger\\w* (?:nazal\\w*|ocular\\w*|purulent\\w*)",
    "(?:are|cu|curg|curge|face) muci\\w*", "muci (?:galbeni|verzi|grosi|cu sange)", "curge nasul", "secreti\\w* nazal\\w*",
    "(?:mancare|hrana|apa) pe nas", "diaree\\w*", "rabdomioliz\\w*",
    // Down, not eating, not drinking. Not "nu se ridică în față / la obstacol", which is riding, nor
    // a child who "nu se scoală dimineața", nor a horse that "nu mănâncă / nu vrea să mănânce morcovi
    // din mână" (a habit) or "nu mai mănâncă așa repede" (a hay net); "nu mai mănâncă" otherwise counts.
    `nu se (?:mai )?(?:poate )?ridica${NOT_LIFTING}`,
    `nu (?:mai )?(?:poate|reuseste|vrea) sa se (?:mai )?ridice${NOT_LIFTING}`,
    "nu se (?:mai )?scoala(?! (?:de )?(?:dimineata|devreme|la timp|din pat|la ora)\\b)",
    "nu mai mananca(?! (?:asa |atat de |asa de |la fel de )?(?:repede|lacom)\\b| din mana\\b| din palma\\b)",
    `nu mananca(?! ${TREATS}\\b)`,
    `nu vrea sa manance(?! ${TREATS}\\b)`, "nu (?:mai vrea sa (?:mai )?|vrea sa mai )manance", "n(?:u |-)a (?:mai )?mancat",
    "(?:nu are|fara|lipsa de) pofta de mancare", "refuza (?:mancarea|hrana|fanul|ovazul|sa manance)", "nu (?:mai )?bea",
    // Pain. "Mă doare spatele" and "am dureri de spate" are the rider's own back, as English "my back
    // hurts" is not caught, also with "mai", "tot" or "cam" ("mă tot doare"); "te doare?" asks another
    // rider; "pe antrenor îl doare" is the coach. "Îl doare în cot" is "he couldn't care less".
    `${PERSON_SUBJECT}(?<!\\b(?:am|aveam|am avut|simt|simteam)(?: (?:niste|mari|mici|cam|tot|si|inca|iar|ceva|o|putin|des|uneori|mereu))* )durer\\w*`,
    `${PERSON_SUBJECT}(?<!\\b(?:ma|te|ne|va)(?: (?:mai|tot|inca|cam|si|foarte|tare|iar|deja))* )doare(?!-?n cot\\b| in cot\\b)`,
  ],
  healthWhenDetected: [
    // Spanish "rana" (frog, also of the hoof: "la rana del casco", "monté a Rana") and the names Rana and Rani.
    "(?<!\\b(?:la|a) )rana(?! del\\b)", "rani",
    // Spanish "plaga" (pest): "esta plaga la tenemos todos los veranos".
    "(?<!\\b(?:la|una|a|es|son|que) )plaga (?:la|pe)(?! (?:verdad|semana|cantidad|vez|final|clase|pista)\\b)",
    // "Rănită" (wounded, of a mare) is also the Spanish "ranita" (little frog), a name too;
    // "julită" (scraped) is the name Julita, also in Romanian: "iapa se numește Julita",
    // "Julita e antrenoarea mea".
    "ranita",
    "(?<!\\b(?:numeste|cheama|numele|pe|cu|si|lui|ei|la|pentru|despre) )julita(?! (?:e|este|a|are|mi|ne|imi|zice|spune|vine)\\b)",
    // English words too; a calming supplement is feeding.
    "medicament", `(?<!suplimen\\w* )calmant${HERBAL}`,
    // "dor" is also the Romanian "longing" ("mi-e dor"); only "his legs (still) hurt" counts, not the coach's.
    `${PERSON_SUBJECT}(?:il|o|ii|le)(?: (?:mai|tot|inca|cam|iar|deja))* dor`,
    // Portuguese and Spanish also write "temperatura", for the weather too. The water's, the
    // trailer's or the day's temperature ("ce temperatură are apa", "ce temperatură are iarna în
    // grajd", "cu temperatura ridicată de azi") is not the horse's, and "a făcut temperatură" (ran a
    // fever) is not "am făcut o temperatură bună în grajd" nor "ieri a făcut o temperatură de 38 de
    // grade" (the weather) unless the horse is named.
    `(?<!\\b${NOT_HORSE} )are temperatura`,
    // A place or the weather within three words, with no horse before it: "ce temperatură are noaptea
    // în boxă", not "ce temperatură are calul în boxă".
    "temperatura are(?! (?:apa|aerul|grajdul|manejul|boxa|remorca|padocul|terenul|vremea|camera|dusul|furtunul)\\b| (?:(?!(?:calul|iapa|manzul|poneiul|armasarul|el|ea)\\b)\\w+ ){0,3}(?:afara|vara|iarna|la umbra|la soare|in (?:grajd|manej|boxa|boxe|remorca|duba|padoc|camera|casa))\\b)",
    "temperatura (?:lui|ei|calului|iepei)",
    `a facut (?:o temperatura(?! de \\d)|temperatura)(?! (?:apei|aerului|buna|potrivita|placuta|in|din)\\b)${WEATHER_AFTER}`,
    "(?:calul|iapa|manzul|armasarul|poneiul|el|ea)(?: \\w+){0,2} a facut o temperatura",
    "(?:calul|iapa|manzul|armasarul|poneiul|el|ea)(?: \\w+){0,2} (?:o )?temperatura (?:mare|ridicata|crescuta)(?! (?:de )?(?:afara|la umbra|la soare|in soare)\\b)",
    "temperatura (?:mare|ridicata|crescuta) (?:la|a|al) (?:cal|calul|calului|cai|caii|cailor|iap\\w*|iep\\w*|manz\\w*|armasar\\w*|ponei\\w*)",
    "temperatur\\w* (?:corporala|rectala)",
  ],
  unsafeOutput: [
    "prescri(?:u|e|em|eti|ere|erea|erii|ii|s|sa|se|si)", "prescripti(?:e|a|i|ii|ei|ile|ilor)", "tratament(?:ul)? garantat",
    "diagnostic(?:ul|ului|e|ele|elor|at|ata|ati|heaza|hez|hezi|are|area)",
    // "Safe to ride", "safe for her to jump", "cleared to work". Not "fii sigur să lucrezi pe ambele
    // mâini", the English "be sure to".
    "(?<!\\b(?:fii|fiti|esti|sunteti) )sigur (?:pentru (?:el|ea|cal|calul|iapa) )?sa(?:-?[lo]| il| o)? (?:calar|lucr|antren|sar|monta)\\w*",
    "in siguranta sa(?:-?[lo]| il| o)? (?:calar|lucr|antren|sar|monta)\\w*",
    "apt[aie]? (?:de|pentru) (?:lucru|antrenament|efort|calarie|concurs|competitie|sarituri)",
  ],
  unsafeOutputWhenDetected: [
    // Bare "diagnostic" is also English.
    "diagnostic\\w*",
  ],
  // Not "si" (Spanish "if"), "este" (Spanish and Portuguese "this"), "o", "are", "mare", "de", "la", "pe",
  // "mai" or "e": each is a frequent word of another language. Nor "s" (Hungarian "and"; "s-a" counts as
  // a phrase) or "sar" (Hungarian "sár", mud).
  markers: [
    "nu", "calul", "cal", "calului", "iapa", "iepei", "meu", "mea", "mele", "cum", "ce", "pentru", "cu", "sa",
    "am", "un", "pot", "poate", "trebuie", "vreau", "vrea", "fac", "sunt", "fost", "dat", "zis", "zice", "cred",
    "din", "ii", "lui", "imi", "iti", "isi", "ca", "daca", "cand", "unde", "dupa", "sau", "nici", "doar",
    "prea", "foarte", "bine", "asta", "acum", "azi", "astazi", "ieri", "aseara", "maine", "dimineata", "zi",
    "zile", "antrenament", "antrenamentul", "antrenorul", "concurs", "lucrez", "deasupra",
    "stiu", "nush", "deci", "chiar", "inca", "putin", "inainte", "atunci", "aici", "mereu", "ceva", "nimic",
    "vreo", "cate", "lucru", "lucrul", "calu", "calu'", "mie", "iar", "ea", "lor", "noi", "avem", "au",
    // Riding words only Romanian spells this way: "Mi-e dor de competitii" has no other clue,
    // and a tie with the Spanish "mi" would let the Portuguese "dor" (pain) answer it.
    "galopul", "trapul", "pasul", "obstacol", "obstacole", "obstacolul", "sarituri", "concursuri", "concursul",
    "competitii", "competitie", "calarie", "calaresc", "manej", "manejul", "incepe", "sezonul", "lectie", "lectia",
    "lectii", "dresaj", "grajd", "padoc", "campionat", "campionatul",
    // "Lame de tuns" (clipper blades) is not English "lame"; "am măsurat / i-am luat temperatura"
    // is a Romanian rider, whatever language the reading's term belongs to.
    "tuns", "masurat", "luat",
    // Body and worry words only Romanian writes this way, so a short message typed without
    // diacritics ("are puroi la copita", "are tuse si muci") is still read as Romanian
    // although "are" counts for English.
    "picior", "piciorul", "picioare", "picioarele", "genunchi", "genunchiul", "spate", "spatele", "copita",
    "copitei", "copite", "copitele", "burta", "ochiul", "sange", "febra", "umflat", "umflata", "umflatura", "doare", "durere", "dureri",
    "schiop", "schioapa", "schiopateaza", "schioapata", "colici",
    "tuse", "tuseste", "muci", "diaree", "abatut", "abatuta", "conjunctivita", "laminita", "tendinita", "abces",
    "puroi", "edem", "crupa", "jaret", "jaretul", "gatul", "ochii", "ranile", "taietura", "sangereaza",
    "lacrimeaza", "muste",
  ],
  phraseMarkers: [
    // Hyphenated clitics and set phrases no other language writes: "mi-e dor",
    // "s-a umflat", "mi se pare", "nu mai mănâncă". "Se pare că" (it seems), not the Spanish
    // "que no se pare antes del oxer" (that he does not stop).
    "(?:mi|ti|i|s|l|n)-(?:a|am|ai|au|e|o|l|i|ar)", "mi se", "se pare ca", "nu mai",
  ],
  letters: /[ăîșşțţ]/,
  healthReply:
    "Oprește antrenamentul și sună medicul veterinar, mai ales dacă schimbarea e bruscă, puternică sau se agravează. Notează când a început, apetitul, comportamentul, temperatura doar dacă o măsori de obicei în siguranță, și orice umflătură vizibilă. Nu pot pune un diagnostic și nici nu pot spune dacă poți lucra din nou cu calul.",
  providerReviewReply:
    "Nu pot pune diagnostice, nu pot recomanda medicamente și nu pot spune dacă un cal poate lucra din nou. Pentru o problemă de sănătate sau de șchiopătură, oprește antrenamentul și sună medicul veterinar. Pentru antrenament, te pot ajuta să pregătești observații obiective și întrebări pentru antrenorul tău.",
};
