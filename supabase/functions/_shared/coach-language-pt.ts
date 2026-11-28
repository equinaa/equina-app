import type { CoachLanguagePack } from "./coach-language-pack.ts";

/**
 * Portuguese (Brazil and Portugal). Terms are folded: see coach-language-pack.ts.
 *
 * Riders write on a phone: "tá" for "está", "pra" for "para", no accents,
 * diminutives (manquinha, inchadinha). Portugal says coxear, "está a comer",
 * "magoou-se". Words that are also ordinary words elsewhere need a verb or a
 * subject in front: bare "manca" is the Romanian "mânca" (to eat), bare
 * "sangue" is a breed (puro-sangue, sangue quente), bare "doi" is the
 * Romanian two, "temperatura" is the weather and "não levanta as mãos" is a
 * jumping fault.
 */

/**
 * After a temperature reading: a unit, a day, a place or the open air means the weather
 * ("temperatura de 40 hoje", "40 no Rio", Spanish "40 en Sevilla" or "mañana", Romanian
 * "39 mâine", "afară", "la umbră"). "No cavalo", "na égua", "em repouso", "na medição" and "la cal" are the horse.
 */
const UNIT = "graus|grados|grade|gradi|fok|celsius|[°º]|o ?c\\b|c\\b|de grade";
const DAY = "hoje|hj|amanha|ontem|de manha|de dia|a tarde|de tarde|a noite|de noite|durante|pela manha|no verao|" +
  "esta semana|essa semana|nesta semana|nessa semana|fim de semana|fds|" +
  "manana|hoy|ayer|por la|maine|azi|ieri|vara|verano";
const PLACE = "aqui|la fora|na rua|a sombra|ao sol|no sol|afara|la umbra|la soare|in soare|a la sombra|al sol|en |" +
  "la (?!(?:cal\\w*|iap\\w*|iep\\w*|manz\\w*|ponei\\w*|armasar\\w*|yegua|caballo|potr[oa])\\b)|" +
  "(?:no|na|em) (?!(?:cavalo|egua|potr[oa]|ponei|animal|reto|termometro|repouso|medicao|medida|ultima|primeira|segunda|hora|se|sei|sabe|come|quiere|bebe)\\b)";
const WEATHER_AFTER = `(?! ?(?:${UNIT}|${DAY}|${PLACE}))`;
/** A day after a decimal reading can be the horse's ("a temperatura do Trovão está 39,4 hoje"); a place cannot. */
const PLACE_AFTER = `(?! ?(?:${UNIT}|${PLACE}))`;

/**
 * Someone other than the horse is ill: "meu treinador está doente", "a professora tá
 * gripada", "minha filha não se levanta cedo". Not "o cavalo do meu treinador está doente",
 * where the person follows do/da. Family needs "meu"/"minha": "a mãe está doente" can be
 * the foal's dam. Used as a lookbehind, so it ends with the space before the health word.
 */
const PERSON =
  "(?:treinador(?:a|es|as)?|professor(?:a|es|as)?|prof|instrutor(?:a|es|as)?|coach|juiz(?:a|es|as)?|" +
  "tratador(?:a|es|as)?|ferrador(?:es)?|veterinari[oa]s?|alun[oa]s?|amig[oa]s?|colegas?|don[oa]|" +
  "cavaleir[oa]s?|amazonas?|criancas?|vizinh[oa]s?|" +
  "(?:meu|minha|meus|minhas) (?:filh[oa]s?|mae|pai|pais|marido|esposa|mulher|namorad[oa]|irmaos?|irmas?|avos?|ti[oa]s?|prim[oa]s?|sogr[oa]s?))";
const PERSON_BEFORE =
  `(?<!(?<!\\b(?:do|da|de|dos|das|pro|pra|ao) (?:meu |minha |meus |minhas |nosso |nossa |seu |sua |teu |tua )?)\\b${PERSON}` +
  "(?: de (?:equitacao|salto|hipismo|ensino|dressage|adestramento))?" +
  "(?: (?:esta|estao|ta|tao|tava|tavam|estava|estavam|ficou|ficaram|anda|andam|andava|parece|esteve|caiu|tambem|ainda|hoje|meio|muito|bem|um pouco|super|bastante|de novo|com)){0,4} )";

/** The rider's own state, with an intensifier or not: "estou doente", "tô meio gripada". */
const RIDER_IS =
  "(?:estou|to|tou|fiquei|ando|estive|me sinto|sinto-me)(?: (?:meio|meia|muito|mto|bem|um pouco|um pouquinho|super|tao|bastante|toda|todo))?";

/** "Não" as phones write it: "n quer comer", "naum levanta", and "ñ", which folds to "n". */
const NAO = "(?:nao|naum|n)";

export const portuguese: CoachLanguagePack = {
  health: [
    // Colic, and its signs: up and down, throwing itself down, kicking at the belly, no droppings.
    "colicas?", "deitando e levantando", "deita e levanta (?:toda hora|o tempo todo|sem parar|varias vezes)",
    "se (?:joga|jogando|jogou|atira|atirando) no chao", "coices? na barriga", "escoicea\\w* (?:a |na )?barriga",
    // "Fiquei suando frio no percurso" is the rider's nerves, so only the horse's cold sweat.
    "(?:ele|ela|cavalo|egua|potr[oa]|esta|ta) (?:\\w+ )?(?:suando frio|com suor frio)", "barriga estufada",
    `${NAO} (?:fez|faz|esta fazendo|ta fazendo) (?:coco|fezes|esterco|bosta)`, `${NAO} (?:defeca|defecou|estrumou|estercou)`,
    "diarreia",
    // Lameness. Brazil says mancar, Portugal coxear and "está coxo".
    "mancando", "mancar", "mancou", "manquinh[oa]s?", "manqueira", "manqueja\\w*",
    "(?:esta|tava|estava|ficou|anda|andava|parece|meio|veio) manc[oa]",
    "(?:ele|ela|egua|cavalo|potr[oa]|ponei|garanhao|ainda) manca",
    // "Manca há 2 dias", "manca no trote". Not "manca de", "din" or "un": the Romanian "mânca" (to eat).
    "manca (?:d[ao] (?:mao|pata|perna|posterior|anterior|frente)|de tras|ha|desde|faz|quando|no|na|nos|nas|um pouco|muito|bastante|ligeiramente|levemente|sempre|as vezes)",
    // Only the forms Spanish does not share: "claudica", "claudicar" and "claudicando" are also
    // Spanish for giving up ("no claudica nunca"), so they wait for Portuguese (healthWhenDetected).
    // "Nunca claudicou assim" is a worry.
    "coxe(?:ia|iam|ar|ando|ou|ava|avam|ira|iras)", "(?<!\\b(?:nunca|jamas|jamais) )claudicam", "claudic(?:acao|acoes|ou|ava|avam|aram)",
    "capeng(?:ando|ar|ou)",
    // Portugal's "está coxo". Bare "coxa" is the thigh (and an English word) and "Coxos" is a beach
    // near Ericeira ("fomos a Coxos"), so those need the verb.
    "coxo", "(?:esta|estao|ta|tao|tava|tavam|estava|estavam|ficou|ficaram|anda|andam|andava|parece|parecem|meio|veio|vieram) cox(?:a|as|os)",
    // "Puxando da perna" is limping; "puxando a perna pra trás" can be the rider's own leg
    // and "puxa da mão" is pulling on the reins.
    "puxa(?:ndo|va)? da (?:perna|pata)", "puxa(?:ndo|va)? (?:a )?(?:perna|pata) (?:de tras|traseira)",
    // "Está sentindo a pata" is sore on it. Not "a perna" or "a boca" (the aids), nor "as costas"
    // or "o posterior", which is how a rider describes the feel ("sentindo as costas dele subirem").
    "sentindo (?:a |o |as |os )?(?:pata|patas|casco|cascos|tendao|tendoes|boleto|boletos)",
    "sente (?:a |o )?(?:pata|casco|tendao|boleto)",
    // Bare "não apoia direito" stays out: in dressage it is also the contact ("não apoia na mão").
    `${NAO} (?:quer |consegue )?apoia(?:r)? (?:bem |direito )?(?:a |o |as |os )?(?:pata|patas|perna|pernas|membro|posterior|anterior|casco|mao (?:direita|esquerda))`,
    `${NAO} (?:quer|consegue) apoiar(?=\\s*(?:[.,;!?]|$))`,
    `${NAO} (?:quer |consegue )?(?:por|poe|pousar|pousa|colocar|coloca) (?:a |o )?(?:pata|perna|mao|casco|pe) no chao`,
    "fratur\\w*", "quebrou (?:a |o )?(?:perna|pata|canela|osso|casco|joelho|costela)",
    // A sprain. Not "minha filha torceu a perna", the rider's "torci o pé" or "tive uma entorse".
    `${PERSON_BEFORE}torceu (?:a |o |as |os )?(?:pata|patas|perna|boleto|machinho|casco|quartela|jarrete|posterior|anterior|mao (?:direita|esquerda))`,
    "(?<!\\b(?:tenho|tive|fiz|estou com|to com|tou com|fiquei com|ando com)(?: uma)? )entorses?",
    // Not "tenho tendinite no punho", the rider's own.
    "(?<!\\b(?:tenho|tive|estou com|to com|tou com|fiquei com) )(?:tendinite|desmite|(?:osteo)?artrite|artrose|sinovite)",
    // Sick. Not "sou doente por cavalos" (crazy about), "estou (meio) doente" or "adoeci", the
    // rider's own, nor "meu treinador está doente": English "sick" is not caught either.
    `(?<!\\b(?:${RIDER_IS}|sou) )${PERSON_BEFORE}doent(?:e|es|inh[oa]s?|ezinh[oa]s?)(?! (?:por|pra|para)\\b)`,
    `${PERSON_BEFORE}adoec(?:eu|endo|er|ido|ida)`,
    `${NAO} (?:esta |ta )?(?:mama|mamando|mamou)`, "mucosas? (?:\\w+ )?(?:palid|rox|amarel|congest|escur|branc)\\w*",
    "pulso digital", "infec(?:cao|coes)", "infeccionad[oa]s?", "infeccionou", "infectad[oa]s?", "infectou",
    // An eye problem; not "de olho fechado", the idiom for doing it easily.
    "(?<!de )olho(?: \\w+){0,3} (?:fechado|vermelho|opaco|esbranquicado|purulento)", "(?:remel|ramel)(?:a|as|ent[oa]s?)",
    // Swelling, heat, lumps, a sore back. Written out, not "incha\w*", which is also the
    // Basque surname Inchausti. Bare "edema" is English too ("leg edema no better"): see healthWhenDetected.
    "incha(?:d[oa]s?|dinh[oa]s?|dissim[oa]s?|dao|dona|cos?|r|ram|ndo|m|va|vam|ria)?", "inchou", "inflamad[oa]s?", "inflamacao",
    "carocos? n[ao]s?", "com edema",
    "(?:lombo|dorso|cernelha)(?: \\w+){0,3} sensive(?:l|is)",
    // Heat in a leg or hoof; not "ferrar o casco a quente", hot shoeing. Canela is also a mare's
    // name, and "a Canela fica (muito) quente" is her temper, so not right after "fica" or "é".
    // "Na mão esquerda ele fica quente" is the rein, so the side needs the heat right after it.
    "(?:tendao|tendoes|casco|cascos|boleto|boletos|canelas|jarrete|quartela|machinho|pata|patas)(?: \\w+){0,3}(?<! a) quentes?",
    "canela(?! (?:fica|ficava|e|era)\\b)(?: \\w+){0,3}(?<! a) quentes?",
    "(?<!\\b(?:na|pela|nessa|nesta) )(?:mao|maos|perna|pernas|posterior|anterior|membro) (?:direit[oa]|esquerd[oa]|da frente|de tras|traseir[oa]|dianteir[oa])" +
    "(?: (?:dele|dela|esta|ta|tava|estava|meio|muito|mto|bem|um pouco|bastante)){0,3} quentes?",
    // Wounds and knocks. "magoada com o treinador" is about feelings, so only the reflexive.
    "ferid[oa]s?", "ferimentos?", "feriu", "lesao", "lesoes", "machucad[oa]s?", "machucadinh[oa]s?", "machucou",
    "machucando", "se cortou", "cortou-se", "cortes? (?:fundos?|profundos?|feios?|abertos?)", "se magoou", "magoou-se",
    "aleijou(?:-se)?", "aleijad[oa]s?", "bicheira",
    // Medicines.
    // Not a dosage of feed or electrolytes. "Dose de eletrólito" stays a hit: it is the
    // English "dose", which runs on every message as the original English list does.
    "medicamentos?", "medicacao",
    "dosagem(?! (?:certa |correta |diaria |ideal |recomendada )?(?:de |do |da |dos |das )?(?:eletrolit\\w*|sal|sais|racao|feno|aveia|milho|alfafa|farelo|oleo|suplement\\w*|vitamin\\w*|biotina|calcio|magnesio|concentrado|trabalho|treino)\\b)",
    "anti-?inflamatorios?", "fenilbutazona", "dipirona", "antibioticos?",
    "penicilina", "corticoides?", "inje(?:cao|coes)",
    "(?:dar|dou|dei|aplicar|aplico|apliquei|tomou|tomando) (?:o |um pouco de )?banamine", "banamine (?:eu|pra|ele|ela)",
    // Fever. "temperatura" alone is the weather; this is the horse's, or a fever reading.
    // A decimal reading is a fever in any language ("I-am luat temperatura: 39,2"); a whole
    // number is also the weather ("temperatura de 40 en Sevilla"), so it counts only in
    // Portuguese (healthWhenDetected). Neither counts with a unit, a day or a place after it,
    // and the decimal is required in full, so "38,5 graus" cannot fall back to "38".
    // Not the Spanish and Portuguese "actividad febril", "ritmo febril": busy, not ill.
    "febre", "(?<!\\b(?:actividad|atividade|ritmo|trabajo|trabalho|busqueda|busca|imaginacion|imaginacao|ansiedad|ansiedade|semana|preparativos) )febril",
    "temperatura (?:dele|dela|do (?:cavalo|potro|animal)|da (?:egua|potra)|corporal|retal)",
    `temperatura:? (?:de |esta |ta |em |a |e |deu |marcou )?(?:3[89]|4[0-2])[.,]\\d{1,2}${WEATHER_AFTER}`,
    // A word or three between ("a temperatura do Trovão está 39,4"), but not a day or a forecast.
    "temperatura:?(?: (?!(?:amanha|hoje|hj|ontem|manana|hoy|ayer|maine|azi|astazi|ieri|aqui|prevista|previsao|maxima|minima|media|" +
    `ambiente|exterior|externa|aerului|apei|agua|ar|aire|vai|va|van|vao|deve)\\b)\\w+){1,3} (?:3[89]|4[0-2])[.,]\\d{1,2}${PLACE_AFTER}`,
    // "Hoje fez 39,5 graus de temperatura" and "está 38,5 graus" are the weather; "está com 39,5" is the horse.
    "(?<!\\b(?:fez|faz|fazia|fazendo|fara|chegou a|chega a|marca|marcou|marcava|registrou|esta|ta|tava|estava|vai a|vai pra|vai para|uns|umas) )" +
    `(?:3[89]|4[0-2])[.,]\\d (?:graus )?de temperatura${PLACE_AFTER}`,
    "(?:esta|ta|tava|estava|ficou) com (?:3[89]|4[0-2])(?:[.,]\\d)? de temperatura",
    // Not the day, the arena or the water: "o dia está com temperatura agradável". "Ela hoje
    // está com temperatura" is the horse, so a day word before it does not count.
    "(?<!\\b(?:dia|tempo|clima|arena|picadeiro|pista|agua|baia|boxe|cocheira|estabulo|ambiente|carro|trailer|reboque|camiao|caminhao|cidade|rua) )(?:esta|ta|tava|estava|ficou) com temperatura(?! (?:agradavel|amena|boa|otima|ideal|perfeita|baixa|negativa)\\b)",
    // Bleeding. Bare "sangue" stays out: puro-sangue, sangue quente, "tem sangue árabe".
    "sangrando", "sangrar", "sangramentos?", "sangrou", "hemorragias?",
    "(?:saindo|sai|saiu|deitar|deitando|deita|deitou|escorrendo|perdendo|perdeu) sangue",
    "sangue (?:no|na|do|da|pelo|pela|nas|nos) (?:nariz|narina|narinas|boca|casco|urina|fezes|perna|pata|olho|ferida)",
    // Not eating or drinking. A bare "não comer" stays out ("como fazer ele não comer grama"),
    // and so does a treat refused from the hand.
    `${NAO} (?:esta |ta |tava |estava )?(?:comendo|comeu|bebe|bebendo|bebeu)`,
    `${NAO} come(?! (?:a |as |o |os |um |uma )?(?:cenouras?|macas?|petiscos?|biscoitos?|bolachas?|guloseimas?|acucar|torroes?|(?:d|n)a (?:minha )?mao)\\b)`,
    `${NAO} (?:esta|ta|tava|estava) a (?:comer|beber)`, `${NAO} (?:quer|quis) (?:comer|beber)`,
    "(?:deixou|parou) de (?:comer|beber)",
    // "Ele tá sem comer desde ontem"; not "eu tava sem comer", nor "fico sem fome antes da prova", the rider's nerves.
    "(?<!\\beu )(?:esta|ta|tava|estava|anda|andava) sem (?:comer|beber)",
    "(?:fica|ficou) sem (?:comer|beber) (?:desde|ha|faz|o dia todo|o dia inteiro|(?:dois|tres|\\d+) dias)",
    // Nor "sem apetite pra trabalhar", no will to work.
    "(?<!\\b(?:fico|fiquei|estou|to|tou|ando|estive)(?: (?:meio|muito|mto|bem|um pouco|sempre|completamente|totalmente))? )sem (?:apetite|fome)" +
    "(?! (?:pra|para|de) (?:o )?(?:trabalho|trabalhar|treino|treinar|saltar|montar|competir|vitoria)\\b)",
    // Cannot get up. "não levanta as mãos no salto" and "não quer levantar a pata" are not this,
    // nor standing in the stirrups, the rising trot, getting up early, or a person getting up.
    `${PERSON_BEFORE}${NAO} se levanta(?! (?:bem )?(?:cedo|da cama|a tempo|no estribo|nos estribos|na sela|da sela|do selim|no salto|nos saltos|ao saltar|quando salta|na frente|de frente|a frente|no trote|ao trote|a trote|no galope)\\b)`,
    `${PERSON_BEFORE}${NAO} (?:se )?consegue (?:se )?levantar(?! (?:as?|os?|bem|mais|cedo|da cama|a tempo|no estribo|nos estribos|na sela|da sela|do selim|no trote|ao trote|a trote|no galope)\\b)`,
    `${PERSON_BEFORE}${NAO} quer (?:se )?levantar(?! (?:as?|os?|bem|mais|cedo|da cama|a tempo|no estribo|nos estribos|na sela|da sela|do selim|no trote|ao trote|a trote|no galope)\\b)`,
    `${NAO} consegue levantar a (?:pata|perna)`,
    `${NAO} levanta(?: mais)?(?= do chao|\\s*(?:[.,;!?]|$))`,
    // Pain. Bare "doi" is the Romanian two.
    "doendo", "dorzinhas?", "(?:que|q|lhe|me|ainda|isso|so|nao|naum|n) doi", "doi (?:quando|qdo|qnd|qndo|muito|mto|ao|na|no|nas|nos)",
    "doi-(?:lhe|me)",
    // Hoof, breathing, eyes, tying up, choke. "Aguou" is also watering the arena, so only the horse's.
    "abs?cessos?", "laminite", "aguamento", "(?:ele|ela|cavalo|egua|potr[oa]|ponei) aguou(?! (?:a|o|as|os|um|uma|bem|tudo)\\b)",
    "ficou aguad[oa]", "pisou (?:num|em um|um|no|em) prego", "prego no casco", "furou o casco",
    "engasg\\w*", "(?:comida|racao|agua|capim|feno|alimento|saliva) (?:pelo nariz|pelas narinas)",
    "dificuldade (?:pra|para|a|de) respirar", "respira(?:ndo)? com dificuldade",
    "ofegante (?:mesmo )?(?:parad[oa]|em repouso|na baia|na boxe|deitad[oa]|sem fazer nada)", "tosse", "tossi(?:ndo|r|u|a|am)",
    "olh(?:ando|a|ar) (?:pra|para) (?:a )?barriga", "(?:saindo|sai|saiu|com|tem|cheio de) pus", "levou (?:um |uns )?coices?",
    // Not "estou (meio) gripada", the rider's own, nor "o treinador está com gripe".
    "corrimento nasal", "nariz escorrendo", "secrec(?:ao|oes)",
    `(?<!\\b${RIDER_IS} )${PERSON_BEFORE}(?:gripad[oa]s?|com gripe)`,
    "gripe equina",
    "garrotilho", "adenite",
    "lacrimej\\w*", "conjuntivite", "uveite", "c(?:aimbra|aibra)s? (?:nele|nela|no cavalo|na egua|no potro)",
    "mioglobinuria", "rabdomiolise", "urina (?:escura|com sangue)",
    // Staggering, fitting, a snake bite (not a bee: "fui picada por uma abelha" is the rider), a lost foal.
    "cambalea\\w*", "convuls(?:ao|oes|ionando|ionou|ionar)", "abortou",
    "(?:picad[oa]|mordid[oa]) (?:de|por) (?:uma )?(?:cobra|cascavel|jararaca|serpente)",
  ],
  healthWhenDetected: [
    // Spanish "estoy dolorida" is the rider's own soreness, and so are "estou (toda) dolorida",
    // "fiquei muito dolorida" and Spanish "estoy muy dolorida".
    "(?<!\\b(?:estou|to|tou|fiquei|ando|estive|acordei|me sinto|sinto-me|estoy|quede|termine|acabe|me siento|me levante|amaneci)" +
    "(?: (?:meio|meia|muito|bem|um pouco|um pouquinho|super|tao|bastante|toda|todo|muy|un poco|algo|re|medio))?" +
    "(?: (?:cansad|exaust|moid)[oa] (?:e|y))? )dolorid[oa]s?",
    // "O Trovão manca". Also the Romanian "mânca" (was eating: "ea mânca", "calul mânca fân"),
    // so not after a Romanian subject or before Romanian food words, even when no language stands out.
    // Not after "da", "do" or "com" either: "a égua da Manca" is a name.
    "(?<!\\b(?:ea|el|calul|iapa|armasarul|manzul|poate|a|sa|de|va|da|do|das|dos|na|no|com|pela|pelo|pra|pro|para|(?:iapa|calul|manzul|armasarul) (?:ta|tau)) )manca(?! (?:fan|ovaz|lucerna|iarba|morcovi?|mere|din|bine|mult|putin|tot|repede|incet|linistit[ae]?)\\b)",
    // Limping, in the forms Spanish shares with giving up ("no claudica nunca", "no voy a claudicar").
    "(?<!\\b(?:nunca|jamas|jamais|no|ni|nem) )claudica", "claudicando",
    "(?<!\\b(?:voy a|vamos a|vou|vamos|pienso|penso|posso|quero|devo|sin|sem|nunca|jamas|jamais|no|nao|ni|nem) )claudicar",
    // Spanish "manco" (one-armed), English "dor" and "dose", the names Dores (but not
    // "Maria das Dores") and Remedios, Spanish "pisadura" (footprint), and the English
    // "edema" ("leg edema no better"). "Banamine" is only matched inside Portuguese
    // phrases, above, so a short English message never gets the Portuguese reply.
    "manco", "remedios?", "dose", "dor", "(?<!das )dores", "pisadura", "edema n[ao]s?",
    // A whole-number reading: Spanish and Romanian riders write "temperatura de 40" of the weather.
    `temperatura:? (?:de |esta |ta |em |a |e |deu |marcou )?(?:3[89]|4[0-2])(?![.,]\\d)${WEATHER_AFTER}`,
    // Spanish "está abatido" is also low spirits; not "estou abatida", the rider's own.
    "(?:esta|ta|tava|estava|anda|andava|ficou|parece|ele|ela|cavalo|egua|potr[oa]) (?:meio |muito |mto |bem |todo |toda |um pouco )?(?:abatid|apatic)[oa]s?",
    "(?:quiet[oa]|quentinh[oa]|parad[oa]|triste|frac[oa]|apatic[oa]) e abatid[oa]",
  ],
  unsafeOutput: [
    "prescrev\\w*", "prescric(?:ao|oes)", "prescrit[oa]s?", "receitar\\w*", "receito", "receita veterinaria",
    // "Uma boa receita para o aquecimento" is a recipe, so only a receita for a medicine.
    "receitas? (?:de |do |da |para |com )?(?:anti|medic|remed|antibio|fenil|dipiron|penicilin|cortic|pomada)\\w*",
    "tratamento garantido",
    // Clearance: "safe to ride" and "cleared to work". "pode voltar a treinar o galope" is
    // ordinary advice, so the return to work is caught only with "normalmente" and the like.
    // "Montá-lo" folds to "monta-lo", so the verbs are written without their r.
    // Brazilian replies say "pra" for "para" and "montar ele" for "montá-lo".
    "(?:e|esta|estara|sera|seria|parece|totalmente|perfeitamente) segur[oa] (?:para |pra )?(?:monta(?:r|-l[oa])|trabalha-l[oa]|treina-l[oa]|voltar a (?:montar|treinar|trabalhar|saltar|competir))",
    "liberad[oa]s? (?:(?:para|pra) (?:o |a |as )?|pr[oa]s? )(?:trabalho|treino|trabalhar|treinar|montar|montaria|voltar|competir|competicao|provas?|saltar|ser montad[oa])",
    "dad[oa] de alta",
    "pode (?:voltar a )?(?:monta|treina|trabalha|salta|competi)(?:r|-l[oa])(?: (?:ele|ela|o cavalo|a egua|o potro|a potra|seu cavalo|sua egua|o seu cavalo|a sua egua))? " +
    "(?:normalmente|tranquilamente|sem (?:problemas?|medo|riscos?|restric(?:ao|oes))|com seguranca)",
    "pode (?:ja )?(?:voltar (?:ao|aos) |retomar (?:o |os |a )?)(?:trabalho|treino|treinos|competicao|montaria) (?:norma(?:l\\w*|is)|sem (?:restric(?:ao|oes)|problemas?|riscos?)|com seguranca)",
    // "Pronto para voltar ao trote" is a training step; back to work is not.
    "pront[oa]s? (?:para|pra) voltar (?:ao trabalho|ao treino|aos treinos|a trabalhar|a treinar|a competir|a montar|a saltar|as provas|a ser montad[oa])",
    "em condic(?:ao|oes) de voltar (?:a|ao|aos|as)",
    "(?:nao ha|sem|nenhuma) contra-?indicac(?:ao|oes) (?:para|a|em) (?:\\w+ )?(?:montar|treinar|trabalhar|saltar|competir|trabalho|treino)",
  ],
  unsafeOutputWhenDetected: [
    // Spanish training replies say "apto para competir" of a fit horse.
    "apt[oa]s? (?:para|pra|a) (?:o |a )?(?:trabalho|trabalhar|treino|treinar|montar|montaria|voltar|competir|competicao|provas?|saltar)",
    // Also an English, Spanish and Romanian word.
    "diagnostic\\w*",
  ],
  // Left out because they are frequent words elsewhere: o, a, e, de, do, da, no, os, dos,
  // das, que, mas, nada (English, Spanish, Romanian), na (Hungarian "na"), nas (Romanian
  // nose), vai (Romanian), so, ate (English), sem, nem (Hungarian), pro (English: "Go pro?"
  // was read as Portuguese).
  markers: [
    "nao", "voce", "vc", "meu", "minha", "cavalo", "cavalos", "egua", "com", "para", "pra", "esta", "estou", "estava", "ta",
    "tava", "como", "ele", "ela", "dele", "dela", "lhe", "um", "uma", "eu", "seu", "sua", "devo", "posso", "pode", "quer",
    "fazer", "treino", "hoje", "hj", "ontem", "depois", "ficou", "fica", "muito", "muita", "mais", "bem", "bom", "boa",
    "melhor", "quando", "porque", "pq", "qual", "isso", "isto", "essa", "esse", "tem", "tenho", "acho", "ainda", "tambem",
    "tbm", "tudo", "ao", "num", "numa", "deu", "foi", "vou", "meio", "sempre", "vezes", "mesmo", "agora",
    "onde", "entao", "obrigado", "obrigada", "quero", "disse", "prova", "provas",
    // "Estudo medicina e só consigo montar" had no clue, so the Spanish "medicina" answered it.
    "estudo",
    // Phone spelling, written by no other language: "mto dolorido dps do salto" had no clue,
    // so the vet reply came back in English.
    "mto", "dps", "msm", "qdo", "qnd", "naum", "tah", "vlw", "obg", "cmg", "blz",
  ],
  letters: /[ãõçêà]/,
  healthReply:
    "Pare o treino e fale com o seu veterinário, sobretudo se a mudança for repentina, forte ou se agravar. Anote quando começou, o apetite, o comportamento, a temperatura apenas se costuma medi-la com segurança, e qualquer inchaço visível. Não posso fazer diagnósticos nem dizer que o seu cavalo pode voltar a trabalhar.",
  providerReviewReply:
    "Não posso fazer diagnósticos, receitar nem dizer que um cavalo pode voltar a trabalhar. Se for uma questão de saúde ou de claudicação, pare o treino e fale com o seu veterinário. Sobre o treino, posso ajudar a preparar observações objetivas e perguntas para o seu treinador.",
};
