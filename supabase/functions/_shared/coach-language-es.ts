import type { CoachLanguagePack } from "./coach-language-pack.ts";

/**
 * Spanish (Spain and Latin America). Terms are folded: see coach-language-pack.ts.
 *
 * Bare "coja"/"cojo" are never terms: they are also coger ("que coja el
 * galope", "cojo las riendas"), so lameness needs the word before it
 * ("está cojo", "lo noto coja"). "sangre" alone is never a term either:
 * "pura sangre" and "sangre caliente" are breed talk.
 */
export const spanish: CoachLanguagePack = {
  health: [
    // Colic.
    "colicos?", "torzon", "(?:esta|estaba|anda|parece|se) empach(?:ad[oa]s?|o)", "se mira (?:la barriga|la panza|la tripa|el vientre|el flanco|los flancos)",
    // Lameness. "rengo"/"renguea" is the River Plate word, "renquea" Spain's.
    "cojera", "cojea\\w*", "cojee\\w*", "cojeo", "cojit[oa]s?",
    "(?:esta|estaba|estuvo|anda|andaba|va|iba|sale|salio|queda|quedo|quedado|puso|parece|noto|veo|siento|siente|sigue|un poco|medio|algo|bastante|muy|ligeramente|levemente) coj[oa]s?",
    // Not "en Rengo": a rodeo town in Chile.
    "renque\\w*", "rengu\\w*", "(?<!\\b(?:en|de|a|at|in|to) )reng[oa]s?", "claudica(?:r|ndo|ba|cion|ciones)?",
    "no apoya (?:la|el) (?:mano|pata|pie|casco)", "infosura",
    // Swelling and heat. Not "se hincha": a horse blowing out against the girth.
    "hinchad\\w*", "hinchazon(?:es)?", "se le hinch\\w*", "inflamad\\w*", "inflamacion(?:es)?", "inflamo",
    "se le inflam\\w*", "calient\\w* al tacto", "patas llenas",
    // Not "la montura tiene un bulto": a lump on the horse, not on the saddle panel.
    "(?:le salio|le ha salido|le salieron|le han salido) (?:un|unos) bultos?",
    "tiene (?:un|unos|varios) bultos? en (?:el|la|los|las) (?:patas?|manos?|cuello|lomo|cruz|costado|cara|cabeza|pecho|vientre|barriga|panza|tendon|rodillas?|corvejon|menudillo|cana|anca|grupa|piel|ojo|boca)",
    "calor en (?:el|la|los|las) (?:tendon\\w*|cascos?|menudillos?|canas?|corvejon\\w*|rodillas?|patas?|manos?)",
    // Wounds and injuries. Not "lastim\\w*": "es una lástima" is a pity, and
    // "sin lastimarlo" / "para que no se lastime" are about preventing it.
    // Not a bare "lastimo" either: "¿lo lastimo si...?" asks before, and
    // Portuguese "lastimo" is "I regret".
    "herid\\w*", "hirio", "lesion(?:es|o|ad[oa]s?|arse)", "(?:una|la|tiene|tenia|con|esa|alguna) lesion",
    "lastimad\\w*", "se lastim(?:o|aron)", "(?:lo|la|le) lastim(?:o|aron) (?:el|la|los|las|un|una|otro|otra)",
    // Not "¿le hace daño la espuela?": a question about tack, not an injury.
    "(?:se hizo|se ha hecho|le hizo|le ha hecho) dano", "abscesos?", "flemon", "mataduras?",
    "se (?:dio|pego|ha dado|ha pegado) un golpe", "se golpe(?:o|aron)", "esguinces?", "fractur(?:a|as|o|ad[oa]s?)",
    "(?:le|lo|la) (?:pico|mordio) una (?:vibora|serpiente|culebra|yarara)",
    "se corto con (?:el|un|la|una) (?:alambre|hierro|chapa|cristal|vidrio|clavo)", "le (?:dieron|han dado|pegaron) una (?:patada|coz)",
    // Medicine and dosing.
    "medicamentos?", "medicacion", "antibiotico\\w*", "antiinflamatorio\\w*", "fenilbutazona", "inyecc\\w*",
    "(?:que|cuanta) dosis", "remedio le (?:doy|di|pongo|puedo dar|damos)",
    "(?:darle|le doy|le di|le damos|le puedo dar) (?:un |algun |el |este |ese )?remedio",
    // Fever.
    "fiebre", "calentura", "tiene (?:\\d+(?:[.,]\\d+)? (?:grados )?de )?temperatura",
    "(?:le|la|lo) (?:tome|medi) la temperatura",
    // Bleeding.
    "sangra(?:r|do|da|dos|das|ndo|ba|ban|n)?", "sangro", "(?:sale|salia|salio|echa|echando|echo|saliendo) sangre",
    "sangre (?:por|de|en) (?:la |el |las |los )?(?:nariz|boca|ollares?|orina|heces|herida|pata|mano|casco|ojo)",
    "orina (?:esta |muy )?(?:oscura|roja|con sangre)",
    // Not eating, cannot get up. Rearing ("levantarse de manos"), jumping
    // technique ("no se levanta bien de delante") and the rider's rising trot
    // ("no se levanta al trote") are not a horse that is down.
    "no (?:quiere|puede) comer", "no ha comido", "sin apetito", "inapetente", "dej(?:o|ado) de comer",
    "no (?:esta )?comiendo", "no (?:puede|quiere|logra|consigue) levantarse(?! (?:de manos|de delante|de adelante|bien|en el salto|al saltar|al trote|a tiempo))",
    "no se (?:puede |quiere )?levantar?(?! (?:de manos|de delante|de adelante|bien|en el salto|al saltar|al trote|a tiempo))",
    // "pararse" is to stand up in Latin America, and to stop everywhere.
    "(?:echad|tirad|acostad|caid)[oa]s? y no se (?:puede |quiere )?parar?",
    // Pain. "dolor" alone is English (sorrow) and "Dolores" a name, so they need a word before them.
    // "me duele", "me dolió" and "estoy dolorida" are the rider's own pain and stiffness.
    "(?<!\\bme )duelen?", "(?<!\\bme )dol(?:io|ian)", "(?<!\\bme (?:esta |estan |estaba |estaban )?)doliendo", "dolorcito",
    "(?<!\\b(?:estoy|ando|quede|termine|acabe|me siento|me levante) )a?dolorid[oa]s?",
    "(?:tiene|tenia|tuvo|siente|sentia|con|mucho|algo de|un) dolor",
    "(?:tiene|tenia|tuvo|los|sus|muchos|unos|esos|estos) dolores",
    // Breathing, choke, eyes, illness.
    "atragant\\w*", "esofago", "respira con dificultad", "cuesta respirar", "tiene tos", "tos(?:e|en|iendo|io)",
    "tiene mocos", "(?:sale|salen|echa) (?:comida|pienso|agua|mocos?) por (?:la nariz|los ollares)",
    "conjuntivitis", "ulceras?", "le llora (?:el|un) ojo", "rabdomiolisis", "mal del lunes",
    // Not "estoy decaída" (the rider's mood) or a pony called Malita.
    "(?<!\\b(?:estoy|ando|quede|me siento) (?:un poco |muy |algo |bastante )?)decaid[oa]s?",
    "(?:esta|estaba|anda|sigue|se puso|parece|noto|veo|muy|un poco|medio) malit[oa]s?", "diarrea",
    "(?:esta|estaba|anda|parece|se puso|noto|veo|sigue|muy|un poco) enferm[oa]s?",
  ],
  healthWhenDetected: [
    // "no come back" in English; carrots from the hand are a treat question.
    "no come(?! (?:zanahorias?|manzanas?|golosinas?|premios?|de (?:la|mi) mano))",
    // English words (dosis, dolor, lesion, laminitis, bute, banamine, flunixin,
    // azoturia, dolia, tos, tendinitis, hematoma) and Portuguese "medicina", the field of study.
    "dosis", "dolor", "lesion", "medicina", "laminitis", "bute", "banamine", "flunixin\\w*", "azoturia",
    "tos", "(?<!\\bme )dolia", "tendinitis", "hematomas?",
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
  ],
  unsafeOutputWhenDetected: [],
  // Not "la", "de", "que", "se", "lo", "le", "al", "en" or "hay": Romanian,
  // Portuguese, Hungarian or English use them as often ("la picior", "lá",
  // "ló", "nem áll le", "al doilea", "én", hay for feed).
  markers: [
    "el", "mi", "mis", "caballo", "caballos", "yegua", "yeguas", "con", "para", "esta", "como", "un", "una",
    "yo", "es", "y", "del", "pero", "su", "puedo", "puede", "debo", "quiero", "quiere", "tiene", "tengo",
    "tienes", "estoy", "estaba", "hace", "hago", "hacer", "pongo", "doy", "veo", "creo", "entrenamiento",
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
  ],
  letters: /[ñ¿¡]/,
  healthReply:
    "Detén el entrenamiento y habla con tu veterinario, sobre todo si el cambio es repentino, fuerte o va a peor. Anota cuándo empezó, el apetito, el comportamiento, la temperatura solo si sueles tomarla con seguridad, y cualquier hinchazón visible. No puedo hacer diagnósticos ni decirte si tu caballo puede volver a trabajar.",
  providerReviewReply:
    "No puedo hacer diagnósticos, recetar ni decirte si un caballo puede volver a trabajar. Si es un problema de salud o de cojera, detén el entrenamiento y habla con tu veterinario. Sobre el entrenamiento, puedo ayudarte a preparar observaciones objetivas y preguntas para tu entrenador.",
};
