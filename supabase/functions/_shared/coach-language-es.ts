import type { CoachLanguagePack } from "./coach-language-pack.ts";

/**
 * Spanish (Spain and Latin America). Terms are folded: see coach-language-pack.ts.
 *
 * Bare "coja"/"cojo" are never terms: they are also coger ("que coja el
 * galope", "cojo las riendas"), so lameness needs the word before it
 * ("está cojo", "lo noto coja"). "sangre" alone is never a term either:
 * "pura sangre" and "sangre caliente" are breed talk.
 */

// People a rider writes about, so "mi entrenador está enfermo" or "a mi hija
// le duele la rodilla" is not read as the horse.
//
// These pieces sit inside lookbehinds that many terms share. V8 compiles a
// pattern on first use, and that time grows steeply with its length (a 57,000
// character list took over five seconds), so terms that share a lookbehind are
// written as one group behind it.
const PERSON =
  "(?:entrenador(?:a|es|as)?|profes?|profesor(?:a|es|as)?|instructor(?:a|es|as)?|monitor(?:a|es|as)?|coach|jue(?:z|za|ces)|" +
  "jinetes?|amazonas?|hij[oa]s?|nen[ea]s?|nin[oa]s?|madre|padre|mama|papa|marido|espos[oa]|mujer|novi[oa]|pareja|amig[oa]s?|" +
  "companer[oa]s?|herrador|veterinari[oa]|vete|herman[oa]s?|mozo|groom|alumn[oa]s?|jef[ea]|abuel[oa]|ti[oa]|prim[oa]|suegr[oa]|" +
  "cuidadora?)";
const POSS = "(?:mi |mis |tu |tus |su |sus |nuestro |nuestra |nuestros |nuestras |el |la |los |las )";
const ADV = "(?:tambien|todavia|aun|ya|siempre|ahora|hoy|otra vez)";
// A person as the subject. Not one after "de": "el caballo de mi entrenador
// está enfermo" is still the horse. Nor the broodmare or the sire: "la yegua
// madre tiene fiebre".
const PERSON_SUBJECT = `(?<!\\b(?:de|del) ${POSS}?)(?<!\\b(?:yegua|yeguas|caballo|caballos) )\\b${PERSON}`;
// A person named right after the verb: "se enfermó mi hija".
const NOT_PERSON_AFTER = `(?! ${POSS}?${PERSON}\\b)`;
// A person as the one it hurts: "a mi hija le duele", "al profe le dolía".
const PERSON_HURTS = `\\b(?:a|al) ${POSS}?${PERSON}(?: ${ADV})? les?`;
// A person who fell or got hurt, and then it hurts: "mi hija se cayó y le duele el brazo".
const PERSON_FELL =
  `${PERSON_SUBJECT}(?: ${ADV})? se (?:cayo|ha caido|golpeo|ha golpeado|dio un golpe|lastimo|ha lastimado|lesiono|` +
  "ha lesionado|torcio|ha torcido|doblo|hizo dano|ha hecho dano)(?: \\w+){0,6} (?:y|pero)(?: (?:ahora|todavia|aun|ya|tambien))? les?";
// The horse, named: "tengo la yegua enferma", "mi caballo está malo".
const HORSE =
  "(?:caballo|caballos|yegua|yeguas|potro|potros|potra|potras|potrillo|potrillos|potrilla|potranca|potrancas|poni|ponis|" +
  "pony|petiso|petisa|padrillo|semental|castrado|animal|animales)";
// The rider ("estoy", Portuguese "estou", "fiquei") or another person, then
// an intensifier ("muy", "toda", "meio") or a second word ("cansada y").
// Not "está": a dropped subject is the horse ("está toda dolorida").
const SELF =
  "\\b(?:estoy|ando|sigo|quede|me quede|termine|acabe|me siento|me encuentro|me levante|amaneci|me desperte|estuve|he estado|" +
  "me puse|me he puesto|estou|to|tou|fiquei|estive|acordei|me sinto|sinto-me)";
const OTHER =
  `${PERSON_SUBJECT}(?: (?:${ADV}|esta|estaba|anda|andaba|sigue|seguia|se puso|se ha puesto|ha estado|estuvo|parece|quedo|` +
  "se quedo|termino|acabo|amanecio|lleva)){0,3}";
const INTENSIFIER =
  "(?:muy|toda|todo|todas|todos|un poco|un poquito|bastante|algo|tan|super|re|medio|media|demasiado|muito|meio|meia|bem|tao|" +
  "um pouco|um pouquinho)";
const NOT_SOMEONE_ELSE = `(?<!(?:${SELF}|${OTHER})(?: ${INTENSIFIER})?(?: \\w+ (?:y|e)(?: ${INTENSIFIER})?)? )`;
// Pain, fever or a cough the rider or another person has: "tengo dolor de
// espalda", "mi entrenador tiene fiebre", "tengo mucha tos".
const NOT_SOMEONE_ELSES_PAIN =
  `(?<!(?:\\b(?:tengo|tuve|siento|senti|me da|me dio|me ha dado|me entra|me entro|estoy con|ando con|sigo con|me quede con|` +
  `me queda)|${PERSON_SUBJECT}(?: ${ADV})? (?:tiene|tenia|tuvo|siente|sentia|con|esta con|estaba con|anda con|sigue con|` +
  `se queja de|se quejaba de)|${PERSON_HURTS} (?:da|dio|ha dado|entra|entro))(?: (?:un|una|mucho|mucha|muchos|algo de|` +
  "un poco de|un poquito de|bastante|tanto|tantos|un ligero|un pequeno|unos|esos|estos))? )";
// "me duele", "me dolió", "me sigue doliendo" and "a mi hija le duele" are not the horse.
const NOT_OWN_HURT = `(?<!(?:\\bme|\\bnos|${PERSON_HURTS}|${PERSON_FELL}) )`;
// An injury the rider or another person has: "tengo un esguince", "mi hijo
// tiene una fractura", "estoy con una lesión". Not "tengo un caballo con una lesión".
const NOT_SOMEONE_ELSES_INJURY =
  "(?<!(?:\\b(?:tengo|tuve|tenia|me hice|me he hecho|me hizo|me dio|me di|me dieron|me pusieron|estoy con|ando con|sigo con|" +
  `vengo con|me quede con)|${PERSON_SUBJECT}(?: ${ADV})? (?:tiene|tenia|tuvo|se hizo|se ha hecho|esta con|estaba con|anda con|` +
  "sigue con|volvio con))(?: (?:un|una|unos|unas|el|la|los|las|mi|mis|otro|otra|algun|alguna))?" +
  "(?: (?:pequeno|pequena|leve|fuerte|tremendo|tremenda|feo|fea|buen|mal))? )";
const INJURY = "(?:lesiones|esguinces?|fracturas?|(?:una|la|tiene|tenia|con|esa|alguna) lesion)";
// The horse named after it: "tengo una herida ... en la pata de mi yegua".
const HORSE_AFTER = `(?=(?: \\w+){0,6} (?:de|del|a|al|en) ${POSS}?${HORSE}\\b)`;
// The rider's own sore body: "tengo el hombro dolorido". Not "tiene el lomo dolorido".
const NOT_RIDERS_BODY =
  "(?<!\\b(?:tengo|tenia|me queda|me quedo|me quedaron|me dejo|me dejaron)(?: (?:el|la|los|las|todo el|toda la|todos los|todas las|mi|mis))? " +
  "(?:cuerpo|espalda|hombro|hombros|rodilla|rodillas|pierna|piernas|brazo|brazos|cuello|culo|trasero|cadera|caderas|muslo|muslos|" +
  `gemelo|gemelos|tobillo|tobillos|muneca|munecas|pie|pies|abdominales|lumbares|cintura|gluteos|aductores|costillas)(?: ${INTENSIFIER})? )`;
// "se lastimó", "se hirió", "se enfermó": not when a person is the one who did.
const NOT_PERSON_DID = `(?<!${PERSON_SUBJECT}(?: ${ADV})? (?:se (?:ha |habia )?)?)`;
// Feed and supplements, whose dose is a feeding question, and "una buena dosis de paciencia".
const NOT_FEED_DOSE =
  "(?! (?:diaria |diarias |recomendada |correcta |adecuada |justa |exacta |normal |maxima |minima |buena )?(?:de |del )?" +
  "(?:sal|sales|minerales|electrolit\\w*|magnesio|vitamin\\w*|suplement\\w*|complement\\w*|pienso|avena|aceite|heno|" +
  "alfalfa|cebada|maiz|biotina|calcio|linaza|levadura|omega\\w*|zanahorias?|paciencia|trabajo|ejercicios?|" +
  "entrenamiento|confianza|calma|carino|realidad|humor|motivacion)\\b)";
// Jumping technique ("no se levanta delante", "en los saltos"), rising trot,
// standing in the stirrups and getting up early are not a horse that is down.
// Not "en el box" or "del suelo": those are.
const NOT_RISING =
  "(?! (?:de manos|de delante|de adelante|delante|adelante|bien|nada|mucho|lo suficiente|lo bastante|lo necesario|" +
  "suficiente|en (?:el|la|los|las) (?:salto|saltos|valla|vallas|oxer|oxers|vertical|verticales|obstaculo|obstaculos|fondo|" +
  "fondos|cruzada|cruzadas|estribo|estribos|silla|montura)|de la (?:silla|montura)|del (?:estribo|asiento)|" +
  "al (?:saltar|trote|galope|salto)|a tiempo|temprano|pronto|antes|para (?:ir|montar|entrenar|la clase))\\b)";
// "mi hija no se levanta", "mi entrenador tiene tos".
const NOT_PERSON = `(?<!${PERSON_SUBJECT}(?: ${ADV})? )`;
// Medicines an answer must not dose.
const MEDICINE =
  "(?:fenilbutazona|bute|flunixin\\w*|banamine|finadyne|meloxicam|metacam|dexametasona|penicilina|antibiotico\\w*|" +
  "antiinflamatorio\\w*|analgesico\\w*|corticoide\\w*|cortisona|omeprazol|dipirona|metamizol|ketoprofeno|trimetoprim\\w*|" +
  "acepromacina|sedante\\w*|xilacina|detomidina|gentamicina|oxitetraciclina|ivermectina|buscapina)\\b";
// What else has a temperature: "la pista tiene 40 grados de temperatura".
// Not "en la cuadra tiene 39": there the horse has it.
const PLACE =
  "(?<!\\ben )(?:el|la|los|las|este|esta|ese|esa) (?:pista|agua|arena|box|cuadra|establo|remolque|camion|picadero|ciudad|" +
  "calle|zona|ambiente|clima|sol)";

export const spanish: CoachLanguagePack = {
  health: [
    // Colic. The plural sits with the fever words below: in Mexico "tengo
    // cólicos" is the rider's period cramps.
    "colico", "torzon", "(?:esta|estaba|anda|parece|se) empach(?:ad[oa]s?|o)", "se mira (?:la barriga|la panza|la tripa|el vientre|el flanco|los flancos)",
    // Lameness. "rengo"/"renguea" is the River Plate word, "renquea" Spain's.
    "cojera", "cojea\\w*", "cojee\\w*", "cojeo", "cojit[oa]s?",
    // Not "en el medio coja el galope": coger again.
    "(?:esta|estaba|estuvo|anda|andaba|va|iba|sale|salio|queda|quedo|quedado|puso|parece|noto|veo|siento|siente|sigue|un poco|(?<!\\b(?:el|al|del|en|por) )medio|algo|bastante|muy|ligeramente|levemente) coj[oa]s?",
    // Bare "rengo"/"renga" is also a name and the English renga, so here it
    // needs the word before it; the bare word waits for a Spanish message.
    // Not bare "renque": a row of trees in Portuguese.
    "renque(?:a|an|ar|o|e|en|ado|ando|aba|aban|ra)", "rengu\\w*",
    "(?:esta|estaba|estuvo|anda|andaba|va|iba|sale|salio|queda|quedo|quedado|puso|sigue|parece|noto|veo|siento|siente|un poco|medio|algo|bastante|muy|re|ligeramente|levemente) reng[oa]s?",
    // Not "no voy a claudicar", "não vou desistir nem claudicar" or "no claudica
    // nunca": giving up, in Spanish and Portuguese.
    "(?<!\\b(?:nunca|jamas|jamais) )claudica(?:ndo|ba|cion|ciones)?(?! (?:nunca|jamas|jamais|ante|frente)\\b)",
    "(?<!\\b(?:voy a|vamos a|van a|vas a|vou|vamos|pienso|penso|quiero|quero|queremos|debo|devo|puedo|posso|podemos|" +
      "hay que|sin|sem|nunca|jamas|jamais|no|nao|ni|nem) )claudicar",
    "no apoya (?:la|el) (?:mano|pata|pie|casco)", "infosura",
    // Swelling and heat. Not "se hincha" or "se le hincha la barriga al cinchar":
    // a horse blowing out against the girth. Not "la hinchada": River Plate fans.
    "hinchad(?!a\\b)\\w*", "(?<!\\b(?:la|una|su|nuestra|toda la|esa) )hinchada", "hinchazon(?:es)?",
    "se le hinch\\w*(?! (?:la |el )?(?:barriga|panza|tripa|vientre|pecho)(?: \\w+){0,3} (?:al|cuando|mientras|si) (?:le |lo |la )?(?:cinch|ensill|apriet|apret|ajust)\\w*)",
    "inflamad\\w*", "inflamacion(?:es)?", "inflamo",
    "se le inflam\\w*", "calient\\w* al tacto", "patas llenas",
    "(?:casco|cascos|tendon|tendones|menudillo|menudillos|corvejon|corvejones|cuartilla|cuartillas|cana|canas|pata|patas) (?:muy |un poco |algo |bastante |re )?calientes?",
    // Not "la montura tiene un bulto": a lump on the horse, not on the saddle panel.
    "(?:le salio|le ha salido|le salieron|le han salido) (?:un|unos) bultos?",
    "tiene (?:un|unos|varios) bultos? en (?:el|la|los|las) (?:patas?|manos?|cuello|lomo|cruz|costado|cara|cabeza|pecho|vientre|barriga|panza|tendon|rodillas?|corvejon|menudillo|cana|anca|grupa|piel|ojo|boca)",
    "calor en (?:el|la|los|las) (?:tendon\\w*|cascos?|menudillos?|canas?|corvejon\\w*|rodillas?|patas?|manos?)",
    // Wounds and injuries. Not "lastim\\w*": "es una lástima" is a pity, and
    // "sin lastimarlo" / "para que no se lastime" are about preventing it.
    // Not a bare "lastimo" either: "¿lo lastimo si...?" asks before, and
    // Portuguese "lastimo" is "I regret".
    // The rider's or another person's injury is not the horse's: "tengo un
    // esguince", "estoy lesionada", "mi entrenadora se lesionó", "me siento herida".
    // Not "¿le hace daño la espuela?": a question about tack, not an injury.
    // "tengo una lesión en el tendón de mi yegua" is the horse's again.
    `(?:${NOT_SOMEONE_ELSES_INJURY}${INJURY}|${INJURY}${HORSE_AFTER})`,
    `${NOT_PERSON_DID}(?:(?<!\\bme )hirio|lesiono|se lastim(?:o|aron)|(?:se hizo|se ha hecho|le hizo|le ha hecho) dano|` +
      `se (?:dio|pego|ha dado|ha pegado) un golpe|se golpe(?:o|aron)|fracturo)${NOT_PERSON_AFTER}`,
    "(?<!\\b(?:no|sin|evitar|evita|prevenir|de) )lesionarse", "(?:lo|la|le) lastim(?:o|aron) (?:el|la|los|las|un|una|otro|otra)",
    "abscesos?", "flemon", "mataduras?",
    "(?:le|lo|la) (?:pico|mordio) una (?:vibora|serpiente|culebra|yarara)",
    "se corto con (?:el|un|la|una) (?:alambre|hierro|chapa|cristal|vidrio|clavo)", "le (?:dieron|han dado|pegaron) una (?:patada|coz)",
    // Medicine and dosing.
    "medicamentos?", "medicacion", "antibiotico\\w*", "antiinflamatorio\\w*", "fenilbutazona", "inyecc\\w*",
    `(?:que|cuanta) dosis${NOT_FEED_DOSE}`, "remedio le (?:doy|di|pongo|puedo dar|damos)",
    "(?:darle|le doy|le di|le damos|le puedo dar) (?:un |algun |el |este |ese )?remedio",
    // Fever. Not the weather, the water or a person: "la pista tiene 40 grados
    // de temperatura", "¿tiene temperatura el agua?", "mi hija tiene temperatura".
    `${NOT_SOMEONE_ELSES_PAIN}(?:fiebre|calentura|colicos|dolorcito)`,
    `(?<!(?:\\b${PLACE}|${PERSON_SUBJECT})(?: ${ADV})? )` +
      "tiene (?:\\d+(?:[.,]\\d+)? (?:grados )?de )?temperatura" +
      "(?! (?:ambiente|(?:el|la|del|de la) (?:agua|pista|arena|box|cuadra|establo|remolque|camion|ambiente|ciudad|calle))\\b)",
    "(?:le|la|lo) (?:tome|medi) la temperatura",
    // Bleeding.
    "sangra(?:r|do|da|dos|das|ndo|ba|ban|n)?", "sangro", "(?:sale|salia|salio|echa|echando|echo|saliendo) sangre",
    "sangre (?:por|de|en) (?:la |el |las |los )?(?:nariz|boca|ollares?|orina|heces|herida|pata|mano|casco|ojo)",
    "orina (?:esta |muy )?(?:oscura|roja|con sangre)",
    // Not eating, cannot get up. Rearing ("levantarse de manos") is not a horse that is down.
    "no (?:quiere|puede) comer", "no ha comido", "sin apetito", "inapetente", "dej(?:o|ado) de comer",
    "no (?:esta )?comiendo",
    `${NOT_PERSON}(?:no (?:(?:puede|quiere|logra|consigue) levantarse|se (?:puede |quiere )?levantar?)${NOT_RISING}|tiene (?:tos|mocos|moquitos?))`,
    // "pararse" is to stand up in Latin America, and to stop everywhere.
    "(?:echad|tirad|acostad|caid)[oa]s? y no se (?:puede |quiere )?parar?",
    // Pain. "dolor" alone is English (sorrow) and "Dolores" a name, so they need a word before them.
    // The rider's own pain and stiffness ("me duele", "estoy muy dolorida") and
    // another person's ("a mi hija le duele") are not the horse.
    `${NOT_OWN_HURT}(?:duelen?|dol(?:io|ian))`,
    `(?<!(?:\\bme|\\bnos|${PERSON_HURTS}|${PERSON_FELL}) (?:(?:esta|estan|estaba|estaban|sigue|siguen|seguia|seguian|va|van|anda|andan|estuvo|estuvieron) )?)doliendo`,
    // Not "con Dolores": a lesson with her.
    `(?:tiene|tenia|tuvo|siente|sentia|con|mucho|algo de|un|los|sus|muchos|unos|esos|estos) ${NOT_SOMEONE_ELSES_PAIN}` +
      "(?:dolor|(?<!\\b(?:siente|sentia|con|mucho|algo de|un) )dolores)",
    // Breathing, choke, eyes, illness. Not "me cuesta respirar al galope": the rider's nerves.
    "atragant\\w*", "esofago", "respira con dificultad", `(?<!(?:\\bme|\\bnos|\\bte|${PERSON_HURTS}) )cuesta respirar`,
    "(?:sale|salen|echa) (?:comida|pienso|agua|mocos?) por (?:la nariz|los ollares)",
    "conjuntivitis", "ulceras?", "le lloran? (?:el|un|los|ambos) ojos?",
    // Not "tengo los ojos llorosos por el heno": the rider's allergy.
    `(?<!(?:\\b(?:tengo|tenia|me quedan|me quedaron)|${PERSON_SUBJECT}(?: ${ADV})? (?:tiene|tenia))(?: (?:el|los))? )ojos? lloros[oa]s?`, "rabdomiolisis", "mal del lunes",
    "diarrea",
    // The rider or another person, not the horse: "estoy muy dolorida", "tengo el
    // hombro dolorido", "me siento herida", "estoy lesionada", "estoy tosiendo",
    // "estoy decaída", "mi entrenador está enfermo", "se enfermó mi hija". Not a pony
    // called Malita, nor "el orgullo herido". Not bare "tose": also Portuguese,
    // "que ele tose a crina" (clip).
    `${NOT_SOMEONE_ELSE}(?:${NOT_RIDERS_BODY}a?dolorid[oa]s?|(?<!\\borgullo )(?:${NOT_SOMEONE_ELSES_INJURY}herid\\w*|herid\\w*${HORSE_AFTER})|` +
      "lesionad[oa]s?|lastimad\\w*|fracturad[oa]s?|tos(?:en|er|ido|iendo|io)|moque(?:a|an|ando|aba|aban)|decaid[oa]s?|" +
      "pachuch[oa]s?|(?:esta|estaba|anda|sigue|se puso|parece|noto|veo|muy|un poco|medio|re) malit[oa]s?|" +
      `(?:esta|estaba|anda|parece|se puso|noto|veo|sigue|muy|un poco|re) enferm[oa]s?|enfermit[oa]s?${NOT_PERSON_AFTER}|` +
      `${NOT_PERSON_DID}(?:se|se ha|se habia|ha|habia|cayo|cayeron) enferm(?:o|ad[oa]s?|aron)${NOT_PERSON_AFTER})`,
    // The horse named: "tengo la yegua enferma".
    `\\b${HORSE}(?: \\w+)? enferm(?:[oa]s?|it[oa]s?)`,
    // Spain's "está malo" is "is ill": "mi yegua está mala desde ayer". Not "la pista está mala".
    `\\b${HORSE}(?: \\w+){0,2} (?:esta|estaba|anda|andaba|sigue|seguia|se puso|se ha puesto|ha estado|lleva) ` +
      "(?:muy |un poco |bastante |algo |medio )?mal[oa]s?(?! de (?:genio|caracter|cabeza|(?:la )?boca)\\b)",
  ],
  healthWhenDetected: [
    // "no come back" in English; carrots from the hand are a treat question.
    "no come(?! (?:zanahorias?|manzanas?|golosinas?|premios?|de (?:la|mi) mano))",
    // English words (dosis, dolor, lesion, laminitis, bute, banamine, flunixin,
    // azoturia, dolia, tos, tendinitis, hematoma), Portuguese "medicina", the
    // field of study, "tose" and "tosia" (Portuguese tosar, to clip), and
    // "Renga", a name and the English renga.
    `dosis${NOT_FEED_DOSE}`, `${NOT_SOMEONE_ELSES_PAIN}(?:dolor|tos)`, `(?:${NOT_SOMEONE_ELSES_INJURY}lesion|lesion${HORSE_AFTER})`,
    "(?<!\\b(?:estudio|estudia|estudias|estudiamos|estudian|estudiar|estudiando|estudiante de|estudiantes de|estudo|estuda|estudamos|estudar|estudante de|curso|cursa|cursando|faco|faz|carrera de|facultad de|faculdade de|escuela de|clase de|clases de|aula de|aulas de|examen de|prova de|doctor en|doctora en|licenciado en|licenciada en|graduado en|graduada en|formado em|formada em) )medicina(?! (?:veterinaria|deportiva|general|humana|interna|familiar|legal)\\b)",
    "laminitis", "bute", "banamine", "flunixin\\w*", "azoturia",
    `${NOT_SOMEONE_ELSE}tos(?:e|ia|ian)`, `${NOT_OWN_HURT}dolia`, "tendinitis", "hematomas?", "(?<!\\b(?:en|de|a|at|in|to) )reng[oa]s?",
    // A fever reading with a Spanish verb ("la temperatura es 39,5"), so the
    // reply is Spanish. Bare "temperatura: 39,5" is also Portuguese and
    // Romanian, and the Portuguese list already reads it.
    "temperatura (?:es|es de|esta en|dio|le dio|marco) (?:3[89]|4[0-2])[.,]\\d{1,2}(?! ?(?:grados|[°º]|c\\b))",
  ],
  unsafeOutput: [
    // Not "receta(s)" (a recipe) or "recetario".
    "recetar(?!io)\\w*", "receto", "recetad[oa]s?", "recet(?:e|en|es|amos)",
    // Spanish endings only, so English "prescribed" and "diagnostic" keep their old result.
    "prescrib(?:ir\\w*|o|imos|en|io|ia\\w*|iendo|ieron)", "prescripcion(?:es)?", "prescrit[oa]s?",
    "diagnostic(?:[oa]s?|ar\\w*|ad[oa]s?|amos|an|ando)", "diagnostique\\w*",
    "tratamiento garantizado", "cura garantizada",
    // Clearance. Not "es seguro que" (it is certain) or "montar con seguridad" (riding safely).
    "(?:es|sera|esta) seguro (?:para )?(?:montar|trabajar|saltar|entrenar|galopar|competir)\\w*",
    "montarl[oa] con (?:seguridad|normalidad)", "trabajarl[oa] con normalidad",
    "volver a (?:montar|trabajar|competir|entrenar|saltar)(?:l[oa])? con normalidad",
    "puedes? (?:volver a )?montarl[oa] sin (?:problemas?|riesgos?)",
    "(?:esta|estara|queda|veo) apt[oa]s? para (?:volver (?:a|al) )?(?:montar|trabajar|competir|entrenar|saltar|trabajo|el trabajo)",
    "list[oa]s? para volver a (?:montar|trabajar|competir|entrenar|saltar)",
    "en condiciones de volver a (?:montar|trabajar|competir|entrenar|saltar)",
    "volver a trabajar sin (?:problemas?|riesgos?)", "dad[oa] de alta para",
    // Back to work: "puede volver al trabajo sin problemas", "ya puedes retomar el
    // trabajo normal". Not "después del concurso vuelve al entrenamiento normal".
    "(?:puede|puedes|podra|podras|podes|pueden) (?:ya )?(?:volver al|volver a la|retomar el|retomar la|retomar su) " +
      "(?:trabajo|entrenamiento|entreno|actividad|competicion) (?:con normalidad|sin (?:problemas?|riesgos?|restricciones?|limitaciones?))",
    "\\bya (?:puede|puedes|podra|podras|podes) (?:volver al|retomar el|retomar su) (?:trabajo|entrenamiento|entreno) normal",
    "(?:esta|estara|queda|quedo) (?:ya )?(?:san[oa]|recuperad[oa]|curad[oa]) (?:del todo )?para (?:volver a )?(?:montar|trabajar|competir|entrenar|saltar|galopar)\\w*",
    // Not "la pista ya está bien para montar": the footing.
    "(?<!\\b(?:pista|arena|suelo|terreno|tiempo|clima|silla|montura|picadero|campo)(?: \\w+){0,2} )" +
      "\\bya (?:esta|estara) bien para (?:volver a )?(?:montar|trabajar|competir|entrenar|saltar|galopar)\\w*",
    // A dose: "dale 2 gramos de fenilbutazona", "ponle 10 ml de Banamine".
    `(?:\\d+(?:[.,]\\d+)?|medio|media|un|una|dos|tres|cuatro|cinco) ?(?:g|gr|grs|gramos?|mg|miligramos?|ml|mililitros?|cc|` +
      `comprimidos?|pastillas?|sobres?|jeringas?|jeringuillas?|ampollas?|dosis|tubos?) (?:de |del )${MEDICINE}`,
    `(?:dale|darle|ponle|ponerle|inyectale|inyectarle|administrale|administrarle|le das|le pones|le inyectas|le administras) ` +
      `(?:un |una |el |la |algo de |un poco de )?${MEDICINE}`,
  ],
  unsafeOutputWhenDetected: [],
  // Not "la", "de", "que", "se", "lo", "le", "al", "en" or "hay": Romanian,
  // Portuguese, Hungarian or English use them as often ("la picior", "lá",
  // "ló", "nem áll le", "al doilea", "én", hay for feed).
  markers: [
    "el", "mi", "mis", "caballo", "caballos", "yegua", "yeguas", "con", "para", "esta", "como", "un", "una",
    "yo", "es", "y", "del", "pero", "su", "puedo", "puede", "debo", "quiero", "quiere", "tiene", "tengo",
    "tienes", "estoy", "estaba", "hace", "hago", "hacer", "pongo", "doy", "veo", "creo", "quito", "entrenamiento",
    "entrenar", "entreno", "hoy", "ayer", "manana", "despues", "ahora", "siempre", "luego", "entonces", "hasta",
    "ya", "muy", "poco", "mucho", "mucha", "bien", "mejor", "derecha", "derecho", "izquierda", "izquierdo",
    "cuando", "porque", "xq", "donde", "cual", "cuanto", "cuanta", "cuantos", "cuantas", "eso", "esto", "estos",
    "ese", "esa", "los", "las", "ellos", "sin", "veces", "pienso", "jinete", "hola", "gracias",
    "otro", "otra", "otros", "otras", "unos", "unas",
    // Words of the body and of a worry that only Spanish writes this way, so that a
    // short message such as "Le duele la espalda" or "He notado que cojea" (Spain's
    // "he", which English also counts) is still read as Spanish. Not "mano": it is
    // also Brazilian slang ("mano, ele tá mancando").
    "cojea", "cojo", "coja", "duele", "duelen", "espalda", "lomo", "panza", "herida", "heridas",
    "hinchada", "hinchado", "hinchazon", "fiebre",
  ],
  phraseMarkers: [
    // Spanish contractions and articles that Portuguese ("pela", "no") and
    // Romanian never write: "sangra por la nariz", "en el box".
    "por la", "por el", "en el", "en la", "a la", "lo que",
    // Spain's perfect tense: "he notado que tiene fever" is a Spanish rider,
    // though "he" alone counts for English.
    "he (?:notado|visto|estado|tenido|hecho|probado|intentado|dado|puesto|montado|llamado|cambiado|leido|saltado|" +
      "trabajado|empezado|comprado|preguntado|observado|sentido|pensado|decidido|conseguido|medido|tomado)",
  ],
  letters: /[ñ¿¡]/,
  healthReply:
    "Detén el entrenamiento y habla con tu veterinario, sobre todo si el cambio es repentino, fuerte o va a peor. Anota cuándo empezó, el apetito, el comportamiento, la temperatura solo si sueles tomarla con seguridad, y cualquier hinchazón visible. No puedo hacer diagnósticos ni decirte si tu caballo puede volver a trabajar.",
  providerReviewReply:
    "No puedo hacer diagnósticos, recetar ni decirte si un caballo puede volver a trabajar. Si es un problema de salud o de cojera, detén el entrenamiento y habla con tu veterinario. Sobre el entrenamiento, puedo ayudarte a preparar observaciones objetivas y preguntas para tu entrenador.",
};
