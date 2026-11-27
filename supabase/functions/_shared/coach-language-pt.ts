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
export const portuguese: CoachLanguagePack = {
  health: [
    // Colic, and its signs: up and down, throwing itself down, kicking at the belly, no droppings.
    "colicas?", "deitando e levantando", "deita e levanta (?:toda hora|o tempo todo|sem parar|varias vezes)",
    "se (?:joga|jogando|jogou|atira|atirando) no chao", "coices? na barriga", "escoicea\\w* (?:a |na )?barriga",
    // "Fiquei suando frio no percurso" is the rider's nerves, so only the horse's cold sweat.
    "(?:ele|ela|cavalo|egua|potr[oa]|esta|ta) (?:\\w+ )?(?:suando frio|com suor frio)", "barriga estufada",
    "nao (?:fez|faz|esta fazendo|ta fazendo) (?:coco|fezes|esterco|bosta)", "nao (?:defeca|defecou|estrumou|estercou)",
    "diarreia",
    // Lameness. Brazil says mancar, Portugal coxear and "está coxo".
    "mancando", "mancar", "mancou", "manquinh[oa]s?", "manqueira", "manqueja\\w*",
    "(?:esta|tava|estava|ficou|anda|andava|parece|meio|veio) manc[oa]",
    "(?:ele|ela|egua|cavalo|potr[oa]|ponei|garanhao|ainda) manca",
    // "Manca há 2 dias", "manca no trote". Not "manca de", "din" or "un": the Romanian "mânca" (to eat).
    "manca (?:d[ao] (?:mao|pata|perna|posterior|anterior|frente)|de tras|ha|desde|faz|quando|no|na|nos|nas|um pouco|muito|bastante|ligeiramente|levemente|sempre|as vezes)",
    "coxe(?:ia|iam|ar|ando|ou|ava|avam|ira|iras)", "claudica(?:r|ndo|cao|coes|ou|m)?", "capeng(?:ando|ar|ou)",
    // Portugal's "está coxo". Bare "coxa" is the thigh (and an English word), so it needs the verb.
    "coxos?", "(?:esta|ta|tava|estava|ficou|anda|andava|parece|meio|veio) coxas?",
    // "Puxando da perna" is limping; "puxando a perna pra trás" can be the rider's own leg
    // and "puxa da mão" is pulling on the reins.
    "puxa(?:ndo|va)? da (?:perna|pata)", "puxa(?:ndo|va)? (?:a )?(?:perna|pata) (?:de tras|traseira)",
    // "Está sentindo a pata" is sore on it. Not "a perna" or "a boca" (the aids), nor "as costas"
    // or "o posterior", which is how a rider describes the feel ("sentindo as costas dele subirem").
    "sentindo (?:a |o |as |os )?(?:pata|patas|casco|cascos|tendao|tendoes|boleto|boletos)",
    "sente (?:a |o )?(?:pata|casco|tendao|boleto)",
    "nao (?:quer |consegue )?apoia(?:r)? (?:bem )?(?:a |o |as |os )?(?:pata|patas|perna|pernas|membro|posterior|anterior|casco|mao (?:direita|esquerda))",
    "nao (?:quer|consegue) apoiar(?=\\s*(?:[.,;!?]|$))",
    "nao (?:quer |consegue )?(?:por|poe|pousar|pousa|colocar|coloca) (?:a |o )?(?:pata|perna|mao|casco|pe) no chao",
    "fratur\\w*", "quebrou (?:a |o )?(?:perna|pata|canela|osso|casco|joelho|costela)",
    // Not "tenho tendinite no punho", the rider's own.
    "(?<!\\b(?:tenho|tive|estou com|to com|tou com|fiquei com) )(?:tendinite|desmite|(?:osteo)?artrite|artrose|sinovite)",
    // Sick. Not "sou doente por cavalos" (crazy about), "estou doente" or "adoeci", the rider's own.
    "(?<!\\b(?:estou|to|tou|fiquei|ando|sou|estive) )doent(?:e|es|inh[oa]s?|ezinh[oa]s?)(?! (?:por|pra|para)\\b)",
    "adoec(?:eu|endo|er|ido|ida)",
    "nao (?:esta |ta )?(?:mama|mamando|mamou)", "mucosas? (?:\\w+ )?(?:palid|rox|amarel|congest|escur|branc)\\w*",
    "pulso digital", "infec(?:cao|coes)", "infeccionad[oa]s?", "infeccionou", "infectad[oa]s?", "infectou",
    // An eye problem; not "de olho fechado", the idiom for doing it easily.
    "(?<!de )olho(?: \\w+){0,3} (?:fechado|vermelho|opaco|esbranquicado|purulento)",
    // Swelling, heat, lumps, a sore back.
    "incha\\w*", "inchou", "inflamad[oa]s?", "inflamacao", "carocos? n[ao]s?", "com edema", "edema n[ao]s?",
    "(?:lombo|dorso|cernelha)(?: \\w+){0,3} sensive(?:l|is)",
    // Heat in a leg or hoof; not "ferrar o casco a quente", hot shoeing.
    "(?:tendao|tendoes|casco|cascos|boleto|boletos|canela|canelas|jarrete|quartela|machinho)(?: \\w+){0,3}(?<! a) quentes?",
    // Wounds and knocks. "magoada com o treinador" is about feelings, so only the reflexive.
    "ferid[oa]s?", "ferimentos?", "feriu", "lesao", "lesoes", "machucad[oa]s?", "machucadinh[oa]s?", "machucou",
    "machucando", "se cortou", "cortou-se", "cortes? (?:fundos?|profundos?|feios?|abertos?)", "se magoou", "magoou-se",
    "aleijou(?:-se)?", "aleijad[oa]s?", "bicheira",
    // Medicines.
    "medicamentos?", "medicacao", "dosagem", "anti-?inflamatorios?", "fenilbutazona", "dipirona", "antibioticos?",
    "penicilina", "corticoides?", "inje(?:cao|coes)",
    "(?:dar|dou|dei|aplicar|aplico|apliquei|tomou|tomando) (?:o |um pouco de )?banamine", "banamine (?:eu|pra|ele|ela)",
    // Fever. "temperatura" alone is the weather; this is the horse's, or a fever reading.
    // A whole number is also the weather ("temperatura de 40 hoje", Spanish "40 grados",
    // Romanian "39 de grade"), so it counts only without a weather word after it.
    "febre", "febril",
    "temperatura (?:dele|dela|do (?:cavalo|potro|animal)|da (?:egua|potra)|corporal|retal)",
    "temperatura:? (?:de |esta |ta |em |a |e |deu |marcou )?(?:3[89]|4[0-2])(?:[.,]\\d)?(?! ?(?:graus|grados|grade|gradi|fok|[°º]|o ?c\\b|c\\b|de grade|hoje|amanha|ontem|la fora|na rua|a sombra|ao sol|no sol|de manha|a tarde|a noite|durante o dia|no verao|esta semana))",
    "temperatura:?(?: \\w+){1,3} (?:3[89]|4[0-2])[.,]\\d(?! ?(?:graus|grados|grade|fok|[°º]|c\\b))",
    "(?:3[89]|4[0-2])[.,]\\d (?:graus )?de temperatura", "(?:esta|ta|tava|estava|ficou) com (?:3[89]|4[0-2])(?:[.,]\\d)? de temperatura",
    "(?:esta|ta|tava|estava|ficou) com temperatura",
    // Bleeding. Bare "sangue" stays out: puro-sangue, sangue quente, "tem sangue árabe".
    "sangrando", "sangrar", "sangramentos?", "sangrou", "hemorragias?",
    "(?:saindo|sai|saiu|deitar|deitando|deita|deitou|escorrendo|perdendo|perdeu) sangue",
    "sangue (?:no|na|do|da|pelo|pela|nas|nos) (?:nariz|narina|narinas|boca|casco|urina|fezes|perna|pata|olho|ferida)",
    // Not eating or drinking. A bare "não comer" stays out ("como fazer ele não comer grama"),
    // and so does a treat refused from the hand.
    "nao (?:esta |ta |tava |estava )?(?:comendo|comeu|bebe|bebendo|bebeu)",
    "nao come(?! (?:a |as |o |os |um |uma )?(?:cenouras?|macas?|petiscos?|biscoitos?|bolachas?|guloseimas?|acucar|torroes?|(?:d|n)a (?:minha )?mao)\\b)",
    "nao (?:esta|ta|tava|estava) a (?:comer|beber)", "nao (?:quer|quis) (?:comer|beber)",
    "(?:deixou|parou) de (?:comer|beber)", "sem apetite", "sem fome",
    // Cannot get up. "não levanta as mãos no salto" and "não quer levantar a pata" are not this.
    "nao se levanta", "nao (?:se )?consegue (?:se )?levantar(?! (?:as?|os?|bem|mais)\\b)",
    "nao quer (?:se )?levantar(?! (?:as?|os?|bem|mais)\\b)", "nao consegue levantar a (?:pata|perna)",
    "nao levanta(?: mais)?(?= do chao|\\s*(?:[.,;!?]|$))",
    // Pain. Bare "doi" is the Romanian two.
    "doendo", "dorzinhas?", "(?:que|lhe|me|ainda|isso|so|nao) doi", "doi (?:quando|muito|ao|na|no|nas|nos)",
    "doi-(?:lhe|me)",
    // Hoof, breathing, eyes, tying up, choke. "Aguou" is also watering the arena, so only the horse's.
    "abs?cessos?", "laminite", "aguamento", "(?:ele|ela|cavalo|egua|potr[oa]|ponei) aguou(?! (?:a|o|as|os|um|uma|bem|tudo)\\b)",
    "ficou aguad[oa]", "pisou (?:num|em um|um|no|em) prego", "prego no casco", "furou o casco",
    "engasg\\w*", "(?:comida|racao|agua|capim|feno|alimento|saliva) (?:pelo nariz|pelas narinas)",
    "dificuldade (?:pra|para|a|de) respirar", "respira(?:ndo)? com dificuldade",
    "ofegante (?:mesmo )?(?:parad[oa]|em repouso|na baia|na boxe|deitad[oa]|sem fazer nada)", "tosse", "tossindo",
    "olh(?:ando|a|ar) (?:pra|para) (?:a )?barriga", "(?:saindo|sai|saiu|com|tem|cheio de) pus", "levou (?:um |uns )?coices?",
    // Not "estou gripada", the rider's own.
    "corrimento nasal", "nariz escorrendo", "secrec(?:ao|oes)", "(?<!\\b(?:estou|to|tou|fiquei|ando|estive) )(?:gripad[oa]s?|com gripe)",
    "gripe equina",
    "garrotilho", "adenite",
    "lacrimej\\w*", "conjuntivite", "uveite", "c(?:aimbra|aibra)s? (?:nele|nela|no cavalo|na egua|no potro)",
    "mioglobinuria", "rabdomiolise", "urina (?:escura|com sangue)",
    // Staggering, fitting, a snake bite (not a bee: "fui picada por uma abelha" is the rider), a lost foal.
    "cambalea\\w*", "convuls(?:ao|oes|ionando|ionou|ionar)", "abortou",
    "(?:picad[oa]|mordid[oa]) (?:de|por) (?:uma )?(?:cobra|cascavel|jararaca|serpente)",
  ],
  healthWhenDetected: [
    // Spanish "estoy dolorida" is the rider's own soreness.
    "dolorid[oa]s?",
    // "O Trovão manca". Also the Romanian "mânca" (was eating: "ea mânca", "calul mânca fân"),
    // so not after a Romanian subject or before Romanian food words, even when no language stands out.
    "(?<!\\b(?:ea|el|calul|iapa|armasarul|manzul|poate|a|sa|de|va|(?:iapa|calul|manzul|armasarul) (?:ta|tau)) )manca(?! (?:fan|ovaz|lucerna|iarba|morcovi?|mere|din|bine|mult|putin|tot|repede|incet|linistit[ae]?)\\b)",
    // Spanish "manco" (one-armed), English "dor" and "dose", the names Dores (but not
    // "Maria das Dores") and Remedios, Spanish "pisadura" (footprint). English words
    // such as "edema" and "Banamine" are only matched inside Portuguese phrases, above,
    // so a short English message without clues never gets the Portuguese reply.
    "manco", "remedios?", "dose", "dor", "(?<!das )dores", "pisadura",
    // Spanish "está abatido" is also low spirits; not "estou abatida", the rider's own.
    "(?:esta|ta|tava|estava|anda|andava|ficou|parece|ele|ela|cavalo|egua|potr[oa]) (?:meio |muito |bem |todo |toda |um pouco )?(?:abatid|apatic)[oa]s?",
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
    "(?:e|esta|estara|sera|seria|parece|totalmente|perfeitamente) segur[oa] (?:para )?(?:monta(?:r|-l[oa])|trabalha-l[oa]|treina-l[oa]|voltar a (?:montar|treinar|trabalhar|saltar|competir))",
    "liberad[oa]s? para (?:o |a |as )?(?:trabalho|treino|trabalhar|treinar|montar|montaria|voltar|competir|competicao|provas?|saltar|ser montad[oa])",
    "dad[oa] de alta",
    "pode (?:voltar a )?(?:monta|treina|trabalha|salta|competi)(?:r|-l[oa]) (?:normalmente|tranquilamente|sem (?:problemas?|medo|riscos?|restric(?:ao|oes))|com seguranca)",
    "pode (?:ja )?(?:voltar (?:ao|aos) |retomar (?:o |os |a )?)(?:trabalho|treino|treinos|competicao|montaria) (?:norma(?:l\\w*|is)|sem (?:restric(?:ao|oes)|problemas?|riscos?)|com seguranca)",
    // "Pronto para voltar ao trote" is a training step; back to work is not.
    "pront[oa]s? para voltar (?:ao trabalho|ao treino|aos treinos|a trabalhar|a treinar|a competir|a montar|a saltar|as provas|a ser montad[oa])",
    "em condic(?:ao|oes) de voltar (?:a|ao|aos|as)",
    "(?:nao ha|sem|nenhuma) contra-?indicac(?:ao|oes) (?:para|a|em) (?:\\w+ )?(?:montar|treinar|trabalhar|saltar|competir|trabalho|treino)",
  ],
  unsafeOutputWhenDetected: [
    // Spanish training replies say "apto para competir" of a fit horse.
    "apt[oa]s? (?:para|a) (?:o |a )?(?:trabalho|trabalhar|treino|treinar|montar|montaria|voltar|competir|competicao|provas?|saltar)",
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
  ],
  letters: /[ãõçêà]/,
  healthReply:
    "Pare o treino e fale com o seu veterinário, sobretudo se a mudança for repentina, forte ou se agravar. Anote quando começou, o apetite, o comportamento, a temperatura apenas se costuma medi-la com segurança, e qualquer inchaço visível. Não posso fazer diagnósticos nem dizer que o seu cavalo pode voltar a trabalhar.",
  providerReviewReply:
    "Não posso fazer diagnósticos, receitar nem dizer que um cavalo pode voltar a trabalhar. Se for uma questão de saúde ou de claudicação, pare o treino e fale com o seu veterinário. Sobre o treino, posso ajudar a preparar observações objetivas e perguntas para o seu treinador.",
};
