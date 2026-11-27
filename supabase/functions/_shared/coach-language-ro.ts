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

// "Nu se ridică în față / la galop" is a horse not lifting its forehand, not one that is down.
const NOT_LIFTING =
  "(?! (?:bine |suficient |destul )?(?:in|din|pe|la|peste) (?:fata|spate|galop|trap|sarituri|salt|obstacol\\w*|oxer\\w*|bar[ae])\\b)";
// A calming supplement ("calmant natural") is feeding, not medicine.
const DRUGS =
  "(?:fenilbutazon\\w*|dexametazon\\w*|flunixin\\w*|bute|antiinflamat\\w*|calmant\\w*(?! natural)|antibiotic\\w*|medicament\\w*|analgezic\\w*|sedativ\\w*|paracetamol|ibuprofen|aspirin\\w*|algocalmin\\w*|metamizol\\w*|cortizon\\w*)";
const BODY =
  "(?:picior\\w*|genunch\\w*|capul|ochi\\w*|copit\\w*|jaret\\w*|fluier\\w*|spatele|gatul|tendon\\w*|ligament\\w*|buza|gura|coada|pielea|crupa|pieptul|umarul|soldul|glezn\\w*|chisit\\w*)";

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
    "nu (?:mai )?pune (?:deloc )?piciorul (?:jos|in pamant|pe pamant)",
    "nu se (?:mai )?sprijina (?:deloc |bine |cum trebuie |normal )?pe(?! (?:frau\\w*|zabal\\w*|mana|mainile|contact\\w*|ham\\w*|pinten\\w*)\\b)",
    "calcat (?:intr-un|intr-o|intrun|pe un|pe o|in) (?:cui|piron|surub|sarma|ciob|sticla|bucata de (?:sticla|fier|metal))",
    "cui (?:in|la|infipt in) (?:copit\\w*|talpa|picior\\w*)", "infundar(?:e|ea|ii)",
    // Swelling, heat, inflammation, hoof and eye. Not "am umflat roțile" (I pumped up the tyres).
    "(?<!\\b(?:am|ai|ati) )umflat\\w*", "umflar(?:e|ea|i|ii)", "umfla(?![^.?!]{0,40}\\b(?:ching|saua|seaua))",
    "are apa (?:in|la) picio\\w*",
    "inflamat(?:a|e|i|ie|ia|ii|iei|iile|iilor)?", "antiinflamato(?:r|rul|rului|are|arele|rii|rilor)",
    "edem(?:ul|e|ele)?", "tendinit(?:a|ei)", "abces(?:ul|ului|e|ele|elor)?", "puroi\\w*", "laminit(?:a|ei)",
    "conjunctivit(?:a|ei)", "lacrimeaz\\w*", "ochiul (?:rosu|tulbure|inchis)",
    "(?:tendon|tendonul|copita|copitele|piciorul|picioarele|genunchiul|jaretul) (?:e |este |sunt )?(?:cald|calda|calde|fierbinte|fierbinti)",
    "(?:cald|calda|calde|fierbinte) la atingere",
    // Wounds and injuries. Bare "rana" is Spanish too, and a name: see healthWhenDetected. Not
    // Spanish "la rana la limpio" (the frog of the hoof) or the name "Ranita".
    "ranit(?:i|e|ul)?", "ran(?:ii|ile|ilor)", "plag(?:ii|ile|ilor)", "(?:are o|cu o|cu) (?:ran[ai]|plag[ai]|ruptur\\w*)",
    "(?<!\\bla )(?:ran[ai]|plaga) (?:la|pe|deschis\\w*|adanc\\w*)", "ruptur(?:i|ii|ile|ilor)",
    "(?:s|si)-?a rupt (?:\\w+ )?(?:tendon\\w*|ligament\\w*|piciorul|un picior|osul|un os|glezna|fluierul)", "leziun\\w*",
    "s-?a (?:accidentat|lovit|taiat|inecat|julit|zgariat)", "accidentar(?:e|ea|ii)",
    `si-?a (?:julit|zgariat|taiat|lovit|ranit|sucit|luxat|scrantit|fracturat) (?:\\w+ )?${BODY}`,
    "lovit\\w* la (?:ochi|picior\\w*|cap|genunchi\\w*|spate|copit\\w*)", "vanata(?:i|ie|ia)",
    "taietur\\w*", "zgarietur\\w*", "julit\\w*", "entors(?:a|ei)", "scrantit\\w*",
    "infect(?:at|ata|ate|ati|ie|ia|ii|iei)",
    // Medication and dosing.
    "medicament(?:e|ul|ului|ele|elor)", "antibiotic(?:ul|ului|e|ele|elor)", "calmant(?:ul|ului|ele|elor)",
    "injecti(?:e|a|i|ii|ile|ilor)",
    // Drug names are spelled the same in Portuguese and Spanish, so only the Romanian giving counts.
    `(?:sa-?i|ii|i-?am|i-?a|i-?ai) (?:mai )?(?:dau|dai|da|dat|fac|faci|facut|administrez|administrat) (?:o |un |niste |doza de |o doza de )?${DRUGS}`,
    `(?:${DRUGS}|tratament\\w*) (?:(?:pot|poti|pot sa|trebuie sa|as putea sa|e bine sa|e ok sa) )?(?:sa-?i|ii|i) (?:pot |mai |trebuie |as putea )?(?:da|dau|fac|administrez)`,
    // A ration of feed, or pacing the work ("dozez efortul"), is not a dose of medicine.
    "doz(?:a|ez|ezi|eaza|ele|ei|elor|aj\\w*|are|area)(?! (?:corecta |zilnica |recomandata |potrivita )?(?:de |a |al |la )?(?:ovaz|fan|lucerna|concentrat\\w*|furaj\\w*|granule|peleti|tarate|morcov\\w*|sare|electrolit\\w*|vitamin\\w*|suplimen\\w*|ulei|efort\\w*|antrenament\\w*|lucru\\w*|munc\\w*|intensitat\\w*)\\b)",
    // Fever.
    "febra(?! musculara| dinaintea| concursului| competitiei)", "febril(?:a|i)",
    "are (?:3[89]|4[012])(?:[.,]\\d+)?(?: de)? grade",
    // Bleeding. Not bare "sânge": "pur-sânge", "sânge cald".
    "sanger(?:a|e)\\w*", "curge (?:sange|din nas)", "sange (?:din|pe) (?:nas|gura|picior\\w*|copit\\w*)",
    "sange in (?:urina|balega|scaun|nas|gura)",
    // Dark urine after work (tying up).
    "urina (?:lui |ei )?(?:e |este |e foarte |foarte |a devenit |era )?(?:inchisa|maro|rosie|rosiatica|neagra|ca (?:cafeaua|ceaiul|coca-cola))",
    // Breathing, discharge, choke, gut. Not Latin American Spanish "le tusé las crines" (trimmed the mane).
    "(?<!\\b(?:le|lo|la|les|los|me|te|se|yo|ya) )tuse", "tus(?:ea|este|esc|ind|it)", "respira (?:greu|cu greutate)",
    "scurger\\w* (?:\\w+ )?(?:din|la|pe) (?:nas|nari|ochi\\w*|ureche|urechi|vulva)", "scurger\\w* (?:nazal\\w*|ocular\\w*|purulent\\w*)",
    "(?:are|cu|curg|curge|face) muci\\w*", "muci (?:galbeni|verzi|grosi|cu sange)", "curge nasul", "secreti\\w* nazal\\w*",
    "(?:mancare|hrana|apa) pe nas", "diaree\\w*", "rabdomioliz\\w*",
    // Down, not eating, not drinking. Not "nu se ridică în față / la obstacol", which is riding,
    // nor a horse that "nu mănâncă morcovi din mână" (a habit); "nu mai mănâncă" always counts.
    `nu se (?:mai )?(?:poate )?ridica${NOT_LIFTING}`,
    `nu (?:mai )?(?:poate|reuseste) sa se (?:mai )?ridice${NOT_LIFTING}`, "nu se (?:mai )?scoala",
    "nu mai mananca", "nu mananca(?! (?:morcovi|mere|zahar|bomboane|recompense|delicatese|din mana|din palma)\\b)",
    "nu (?:mai )?vrea sa (?:mai )?manance", "n(?:u |-)a (?:mai )?mancat",
    "(?:nu are|fara|lipsa de) pofta de mancare", "refuza (?:mancarea|hrana|fanul|ovazul|sa manance)", "nu mai bea",
    // Pain. "Mă doare spatele" is the rider's own back, as English "my back hurts" is not caught.
    "durer\\w*", "(?<!\\bma )doare",
  ],
  healthWhenDetected: [
    // Spanish "rana" (frog, also of the hoof: "la rana del casco") and the names Rana and Rani.
    "(?<!\\bla )rana(?! del\\b)", "rani",
    // "Rănită" (wounded, of a mare) is also the Spanish "ranita" (little frog), a name too.
    "ranita",
    // English words too; a calming supplement is feeding.
    "medicament", "(?<!suplimen\\w* )calmant(?! natural)",
    // "dor" is also the Romanian "longing" ("mi-e dor"); only "his legs hurt" counts.
    "(?:il|o|ii|le) dor",
    // Portuguese and Spanish also write "temperatura", for the weather too. The water's
    // temperature ("ce temperatură are apa") is not the horse's.
    "are temperatura",
    "temperatura are(?! (?:apa|afara|aerul|grajdul|manejul|boxa|remorca|padocul|terenul|vremea|camera)\\b)",
    "temperatura (?:lui|ei|calului|iepei|mare|ridicata|crescuta)",
    "temperatur\\w* (?:corporala|rectala)",
  ],
  unsafeOutput: [
    "prescri(?:u|e|em|eti|ere|erea|erii|ii|s|sa|se|si)", "prescripti(?:e|a|i|ii|ei|ile|ilor)", "tratament(?:ul)? garantat",
    "diagnostic(?:ul|ului|e|ele|elor|at|ata|ati|heaza|hez|hezi|are|area)",
    // "Safe to ride", "safe for her to jump", "cleared to work".
    "sigur (?:pentru (?:el|ea|cal|calul|iapa) )?sa(?:-?[lo]| il| o)? (?:calar|lucr|antren|sar|monta)\\w*",
    "in siguranta sa(?:-?[lo]| il| o)? (?:calar|lucr|antren|sar|monta)\\w*",
    "apt[aie]? (?:de|pentru) (?:lucru|antrenament|efort|calarie|concurs|competitie|sarituri)",
  ],
  unsafeOutputWhenDetected: [
    // Bare "diagnostic" is also English.
    "diagnostic\\w*",
  ],
  // Not "si" (Spanish "if"), "este" (Spanish and Portuguese "this"), "o", "are", "mare", "de", "la", "pe",
  // "mai" or "e": each is a frequent word of another language.
  markers: [
    "nu", "calul", "cal", "calului", "iapa", "iepei", "meu", "mea", "mele", "cum", "ce", "pentru", "cu", "sa",
    "am", "un", "pot", "poate", "trebuie", "vreau", "vrea", "fac", "sunt", "fost", "dat", "zis", "zice", "cred",
    "din", "ii", "lui", "imi", "iti", "isi", "s", "ca", "daca", "cand", "unde", "dupa", "sau", "nici", "doar",
    "prea", "foarte", "bine", "asta", "acum", "azi", "astazi", "ieri", "aseara", "maine", "dimineata", "zi",
    "zile", "antrenament", "antrenamentul", "antrenorul", "concurs", "lucrez", "sar", "deasupra",
    "stiu", "nush", "deci", "chiar", "inca", "putin", "inainte", "atunci", "aici", "mereu", "ceva", "nimic",
    "vreo", "cate", "lucru", "lucrul", "calu", "calu'", "mie", "iar", "ea", "lor", "noi", "avem", "au",
    // Riding words only Romanian spells this way: "Mi-e dor de competitii" has no other clue,
    // and a tie with the Spanish "mi" would let the Portuguese "dor" (pain) answer it.
    "galopul", "trapul", "pasul", "obstacol", "obstacole", "obstacolul", "sarituri", "concursuri", "concursul",
    "competitii", "competitie", "calarie", "calaresc", "manej", "manejul", "incepe", "sezonul", "lectie", "lectia",
    "lectii", "dresaj", "grajd", "padoc",
    // Body and worry words only Romanian writes this way, so a short message typed without
    // diacritics ("are puroi la copita", "are tuse si muci") is still read as Romanian
    // although "are" counts for English.
    "picior", "piciorul", "picioare", "picioarele", "genunchi", "genunchiul", "spate", "spatele", "copita",
    "copitei", "burta", "ochiul", "sange", "febra", "umflat", "umflata", "umflatura", "doare", "durere", "dureri",
    "schiop", "schioapa", "schiopateaza", "schioapata", "colici",
    "tuse", "tuseste", "muci", "diaree", "abatut", "abatuta", "conjunctivita", "laminita", "tendinita", "abces",
    "puroi", "edem", "crupa", "jaret", "jaretul", "gatul", "ochii", "ranile", "taietura", "sangereaza",
    "lacrimeaza", "muste",
  ],
  phraseMarkers: [
    // Hyphenated clitics and set phrases no other language writes: "mi-e dor",
    // "s-a umflat", "mi se pare", "nu mai mănâncă".
    "(?:mi|ti|i|s|l|n)-(?:a|am|ai|au|e|o|l|i|ar)", "mi se", "se pare", "nu mai",
  ],
  letters: /[ăîșşțţ]/,
  healthReply:
    "Oprește antrenamentul și sună medicul veterinar, mai ales dacă schimbarea e bruscă, puternică sau se agravează. Notează când a început, apetitul, comportamentul, temperatura doar dacă o măsori de obicei în siguranță, și orice umflătură vizibilă. Nu pot pune un diagnostic și nici nu pot spune dacă poți lucra din nou cu calul.",
  providerReviewReply:
    "Nu pot pune diagnostice, nu pot recomanda medicamente și nu pot spune dacă un cal poate lucra din nou. Pentru o problemă de sănătate sau de șchiopătură, oprește antrenamentul și sună medicul veterinar. Pentru antrenament, te pot ajuta să pregătești observații obiective și întrebări pentru antrenorul tău.",
};
