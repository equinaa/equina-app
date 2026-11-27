import assert from "node:assert/strict";
import { portuguese as portugueseTerms } from "../supabase/functions/_shared/coach-language-pt";
import {
  assessHealthConcern,
  crossesSafetyLine,
  foldForMatching,
  guessCoachLanguage,
  healthEscalationReply,
  mentionsHealthConcern,
  providerReviewReply,
} from "../supabase/functions/_shared/coach-safety";

// Portuguese, Brazil and Portugal, the way riders type on a phone: "tá" for
// "está", "pra" for "para", accents left out, diminutives, "está a comer".

// A health worry stops the AI and answers with the fixed vet reply, in Portuguese.
const health = [
  // Colic.
  "meu cavalo ta com colica",
  "deu cólica no potro ontem à noite",
  "acho q ele ta com dor de barriga",
  "ele fica deitando e olhando pra barriga",
  "cólica?",
  // Lameness, Brazil and Portugal.
  "meu cavalo ta mancando da mao esquerda",
  "tá mancando",
  "o potro ta mancando",
  "ela tá manca da mão direita",
  "A égua tá manca desde ontem",
  "a égua está manca desde ontem",
  "ela estava manca ontem e hoje ainda está",
  "ela manca no trote quando faço volta pra direita",
  "ele manca quando trota no duro",
  "tá meio manquinha da posterior",
  "o cavalo veio manco do pasto",
  "Depois do jumping ele ficou manco",
  "ele mancou depois do salto",
  "ele ta capengando",
  "ele nao apoia a pata direita no chao",
  "o tendão está quente e ele não quer apoiar",
  "O meu cavalo coxeia da mão esquerda",
  "Está a coxear desde ontem à tarde",
  "Notei uma coxeira ligeira no trote",
  "O cavalo está a mancar da posterior direita",
  // Swelling, heat, a sore back.
  "a canela dele ta inchada e quente",
  "tá com a canela inchadinha",
  "tem uns inchaços no boleto",
  "a pata inchou depois do treino",
  "O ferrador disse que o casco está inchado",
  "apareceu um caroço na canela",
  "ele ta com edema nas patas",
  "o lombo dele ta muito sensivel",
  // Wounds and knocks.
  "ele se cortou no arame farpado",
  "tem um corte fundo na perna",
  "ela se feriu na baia",
  "ele se machucou no pasto",
  "ta todo machucadinho",
  "a sela está machucando o lombo dele",
  "a sela fez uma pisadura no lombo",
  "ta com bicheira na ferida",
  "levou um coice no pasto e ta com a perna aberta",
  "O cavalo magoou-se no camião",
  "O cavalo aleijou-se na boxe",
  // Medicines and doses.
  "posso dar fenilbutazona antes da prova?",
  "quanto de banamine eu dou pra ele?",
  "qual a dosagem de dipirona pra cavalo?",
  "posso dar anti-inflamatorio pra ela?",
  "Posso dar-lhe um anti-inflamatório?",
  "pode tomar antibiotico junto com o vermifugo?",
  "quantos ml de penicilina eu aplico?",
  "ele ta tomando injeção, pode treinar?",
  "Que dose de remédio posso dar?",
  "Qual a dose de bute?",
  // Fever.
  "ele ta com febre",
  "Febre alta, o que fazer?",
  "febre",
  "ela tá febril e quieta",
  "a temperatura dele ta 39.5",
  "Medi a temperatura dele e deu 39",
  "Ela está com temperatura de 39 graus",
  // Bleeding.
  "ta saindo sangue do nariz dele",
  "Está a deitar sangue pelo nariz",
  "O cavalo está a sangrar da boca",
  "começou a sangrar depois do galope",
  "tem sangue na boca, acho que mordeu a lingua",
  "ele ta sangrando",
  // Not eating.
  "ele não quer comer",
  "não tá comendo nada desde ontem",
  "nao ta comendo",
  "ele não comeu a ração hoje",
  "meu cavalo nao come",
  "O tordilho tá sem apetite",
  "tá sem fome e sem beber agua",
  "O cavalo não está a comer",
  "A égua deixou de comer",
  // Down and cannot get up.
  "ela deitou e não quer levantar",
  "Ele deitou e não levanta.",
  "ta caido na baia e nao levanta",
  "ele não levanta do chão desde cedo",
  "ele nao consegue se levantar",
  "O cavalo não se consegue levantar",
  "não consegue levantar a pata traseira",
  // Pain.
  "ta com uma dorzinha na pata",
  "acho que dói quando eu monto",
  "Dói-lhe as costas quando aperto a cilha",
  "ele está todo dolorido",
  "ele sente dor nas costas",
  "Ele tem dores nas costas depois do salto",
  "Dor no lombo depois do salto",
  "Dor?",
  // Hoof, tying up, choke, breathing, eyes.
  "ta com abscesso no casco",
  "Acho que é um abcesso no casco",
  "ta saindo pus do casco",
  "acho que ela ta com laminite",
  "ele travou depois do treino, ficou todo duro e com urina escura",
  "deu câimbra nele no meio do treino",
  "acho que deu mioglobinuria nele",
  "ele engasgou com a ração",
  "ta com dificuldade pra respirar",
  "ele ta tossindo muito e com o nariz escorrendo",
  "o olho dele ta lacrimejando e meio fechado",
  "acho que ela ta com conjuntivite",
  // Second review: signs and words the first pass missed.
  "Manca há 2 dias",
  "manca no trote",
  "O Trovão manca",
  "O meu cavalo às vezes manca",
  "O cavalo está coxo da mão direita",
  "A égua ficou coxa depois do concurso",
  "Anda coxo há uma semana",
  "meu cavalo ta puxando a perna de tras desde ontem",
  "ele ta sentindo a pata depois que tirou a ferradura",
  "ele ta sentindo o casco",
  "acho que ele quebrou a perna, não apoia de jeito nenhum",
  "ele fraturou a canela?",
  "O veterinário disse que é tendinite, quanto tempo de repouso?",
  "ele tem tendinite no anterior",
  "o veterinário falou em desmite",
  "o casco tá quente",
  "o casco está a ficar quente",
  "o tendão dele está muito quente",
  "tem pulso digital forte na mão esquerda",
  "o cavalo ta deitando e levantando toda hora",
  "ele ta suando frio e olhando pra barriga",
  "o cavalo estava suando frio na baia",
  "ele está com suor frio",
  "o cavalo tá com diarreia desde sábado",
  "ele não está a beber água desde ontem",
  "nao ta bebendo agua e ta quieto",
  "o potro nao mama desde de manha",
  "o meu cavalo tá doente",
  "acho que ele ta doentinho, todo parado",
  "O potro adoeceu depois da viagem",
  "tá abatido e não quis a ração",
  "tá quentinho e abatido",
  "O cavalo está muito abatido desde ontem",
  "ele ta apatico e nao quer sair da baia",
  "ele está com as mucosas pálidas",
  "está ofegante mesmo parado na boxe",
  "ta saindo comida pelo nariz dele",
  "ela ta gripada, com o nariz escorrendo",
  "o olho dele tá meio fechado e vermelho",
  "ele aguou depois de comer muito milho",
  "ele tá cambaleando e meio desequilibrado",
  "o cavalo ta convulsionando, o que eu faço",
  "foi picado por cobra no pasto",
  "a temperatura deu 39,2, posso montar?",
  "temperatura 39, o que faço?",
  "Medi a temperatura: 39.8",
  "A temperatura do Trovão está 39,4",
  "Ela tá com 39,5 de temperatura",
];
assert.ok(health.length >= 50);
for (const message of health) {
  assert.equal(mentionsHealthConcern(message), true, `health: ${message}`);
  assert.equal(assessHealthConcern(message).language, "pt", `reply language: ${message}`);
}

// Ordinary riding questions get an answer, including every false positive the
// review found: the number twelve, a hedge on the cross-country course, the
// weather, a jumping fault, breeds, a hurt feeling, a coach's degree.
const ordinary = [
  "Como melhorar o galope do meu cavalo?",
  "Meu cavalo tem doze anos, ainda dá pra começar no salto?",
  "A minha égua tem doze anos, posso fazer provas de dressage com ela?",
  "Faço doze aulas por mês, é suficiente pra competir?",
  "O percurso tinha doze obstáculos, como memorizo?",
  "Fiz doze minutos de trote, foi muito?",
  "Como saltar uma sebe no cross?",
  "O meu cavalo tem medo da sebe do campo de cross, o que faço?",
  "Qual a melhor temperatura para treinar no verão?",
  "Com esta temperatura posso deixar o cavalo sem manta?",
  "Qual a temperatura da água para dar banho no cavalo?",
  "Que manta usar quando a temperatura cai abaixo de 5 graus?",
  "A temperatura está 38 graus hoje, treino de manhã?",
  "Com a temperatura alta, devo treinar cedo?",
  "Ele não levanta as mãos no salto, derruba tudo",
  "Meu cavalo não levanta bem os posteriores no oxer",
  "Ele não levanta a pata pra eu limpar o casco",
  "Ela não levanta a cabeça no trote, fica muito baixa",
  "Meu cavalo não levanta as patas no trabalho de varas",
  "Meu cavalo não levanta o dorso, como trabalho isso?",
  "O meu cavalo não consegue levantar as mãos no oxer",
  "Ele não quer levantar a pata pro ferrador",
  "Como faço meu cavalo levantar mais as patas no trote?",
  "Meu cavalo tem sangue árabe, ele aguenta enduro?",
  "Ele é um cavalo com sangue quente, como acalmar?",
  "A égua tem sangue lusitano e inglês",
  "O meu cavalo é meio-sangue, que disciplina recomenda?",
  "Como melhorar o galope do meu cavalo puro-sangue lusitano?",
  "Ela é uma égua puro-sangue inglês, muito quente",
  "Ele cortou caminho na curva do percurso",
  "Como fazer ele não comer grama durante o passeio?",
  "Ela come muito rápido, como desacelerar?",
  "Ela não para de comer a cerca",
  "Fiquei magoada com o meu treinador, mudo de escola?",
  "O meu treinador estudou medicina veterinária, confio nele para o plano?",
  "Doei uma sela velha, devo comprar uma nova?",
  "Eu pus a sela muito pra frente?",
  "A Maria das Dores vai montar a minha égua amanhã",
  "Vou competir no CSN de Santa Maria no fim de semana",
  "Ele tem a coxa muito musculada",
  "Qual a melhor ração para cavalo de salto?",
  "Que embocadura usar num cavalo que puxa muito?",
  "O meu lusitano é muito sensível à perna, como trabalho a cedência?",
  "A sela está larga na cernelha?",
  "Quantas vezes por semana devo saltar?",
  "Tá bom treinar duas vezes por dia?",
  "Como ensinar a égua a fazer piaffe?",
  "O meu cavalo empina quando saio do picadeiro",
  "O meu cavalo assusta-se na pista de ensino, o que faço?",
  "Como faço o aquecimento antes da prova?",
  "Como fazer o warm up antes do show?",
  "Este exercício é bom para o potro?",
  "Posso dar cenoura e maçã como petisco?",
  "Qual a diferença entre um mangalarga e um quarto de milha?",
  "Como lidar com cavalo que refuga no oxer?",
  "Ele está pesado na mão, como deixo mais leve?",
  "Que tipo de sela é melhor pra marcha?",
  "Quero treinar para a prova de três tambores",
  "Meu cavalo ta muito preguiçoso no trote, como animar ele?",
  "Ela tem uma mancha branca na testa",
  "Quantas horas de pasto por dia?",
  "Quero fazer uma prova de enduro de 80 km, como preparo?",
  "Qual a melhor manta para o inverno?",
  "O picadeiro está cheio de lama da chuva, devo montar?",
  "Tá muito quente hoje, treino de manhã cedo?",
  "Qual o melhor horário pra treinar com esse calor?",
  "A égua está no cio e fica irritada no treino",
  "Ele se assustou e me derrubou, como volto a montar com confiança?",
  // Second review: the weather with a whole number, a treat refused, and idioms or the
  // rider's own state that share a word with a health sign.
  "Com temperatura de 40 hoje, treino de manhã cedo?",
  "A temperatura vai a 39 amanhã, mudo o treino pra noite?",
  "Tá com 40 graus de temperatura hoje, treino?",
  "A temperatura está 38 hoje, treino cedo?",
  "Ele não come a cenoura da minha mão, é normal?",
  "Fiquei suando frio no percurso, como controlo o nervosismo?",
  "Me deu um suor frio antes da prova",
  "Fico com suor frio antes de saltar, é normal?",
  "Eu estava suando frio no percurso de ontem",
  "Estou sentindo as costas dele subirem no trote, está certo?",
  "Não estou sentindo o posterior engajar",
  "Você sente o lombo dele trabalhar no galope?",
  "Ele sente muito a perna, uso esporas?",
  "Ele sente muito a boca, qual embocadura uso?",
  "Ele puxa da mão no galope, o que faço?",
  "É melhor ferrar o casco a quente ou a frio?",
  "Tenho tendinite no punho, que rédeas uso?",
  "Estou gripada, posso montar amanhã?",
  "Adoeci e fiquei duas semanas sem montar, como recomeço?",
  "Fui picada por uma abelha a montar, normal ficar com medo?",
  "Sou doente por cavalos, qual raça é boa para começar?",
  "Ela faz o percurso de olhos fechados, como subo a altura?",
  "Ele salta de olho fechado qualquer oxer",
  "Ela é muito sangue quente, como acalmo no aquecimento?",
  "Ele fica muito quente na boca, mastiga o freio o tempo todo",
  "Ele dá coice quando aperto a cilha, como corrijo?",
  "A sela machuca? Como sei se está bem ajustada?",
  "Como evitar que ele se machuque no transporte?",
  "Tô com medo dele se cortar na cerca nova",
  "Ele tropeça muito no trote, é falta de atenção?",
  "Posso montar logo depois de ele comer?",
  "Ele não quer entrar no trailer, como faço?",
  "Ele não levanta mais as patas no trote, como melhoro?",
  "É normal ele suar muito no treino de verão?",
  "Como manter o cavalo hidratado no verão?",
  "Que vacinas o cavalo precisa tomar por ano?",
];
assert.ok(ordinary.length >= 50);
for (const message of ordinary) {
  assert.equal(mentionsHealthConcern(message), false, `ordinary: ${message}`);
}

// The always-on Portuguese terms fire on every message, so they never match an ordinary
// sentence in the other languages: the weather in degrees, the Romanian "mânca" (to eat)
// and "doi" (two), names, Spanish words spelled close to Portuguese ones.
const alwaysOn = new RegExp(`\\b(?:${portugueseTerms.health.join("|")})\\b`);
for (const message of [
  "Should I clip her before the winter show?",
  "We hacked out with Manca and Dores today",
  "Can I ride in 39 degree heat?",
  "Con temperatura de 40 grados, ¿entreno por la mañana?",
  "La temperatura es de 39 grados, ¿le pongo agua con sal?",
  "Mi caballo es muy sensible en el lomo cuando lo cepillo",
  "Mi yegua se llama Dolores y es muy tranquila",
  "El corte del pelo en invierno, ¿lo hago con máquina?",
  "¿Qué embocadura uso para un caballo que tira?",
  "Temperatura e 39 de grade afară, să lucrez calul?",
  "Ieri au fost 40 de grade, temperatura de 40 de grade e prea mult pentru cal?",
  "Calul meu are doi ani, când pot începe?",
  "Doi cai au sărit bine azi, ce exercițiu fac mâine?",
  "Iapa mânca liniștită când am venit la grajd",
  "Calul mânca din mâna mea, e bine?",
  "Ce poate mânca un cal înainte de concurs?",
  "Mi-e dor de concursuri, când începe sezonul?",
  "Ma 39 fok van, lovagolhatok?",
  "A hőmérséklet 40 fok, mikor eddzek?",
  "Na, mit csináljak ma a pacimmal?",
]) {
  assert.equal(alwaysOn.test(foldForMatching(message)), false, `always-on pt term: ${message}`);
  assert.equal(mentionsHealthConcern(message), false, `other language: ${message}`);
}
// Bare "manca" counts only when the text reads as Portuguese, and never after a Romanian
// subject or before Romanian food, even in a short message with no clear language.
for (const message of ["Ea mânca", "Manca fan", "Iapa ta mânca", "Iapa ta mânca fân când am venit"]) {
  assert.equal(mentionsHealthConcern(message), false, `Romanian mânca: ${message}`);
}

// Detection: Portuguese and sure of it, short messages and phone spelling
// included, so the fixed replies and the ambiguous words follow.
const portuguese = [
  "Meu cavalo está mancando da mão esquerda",
  "tá mancando",
  "o potro ta mancando",
  "o pônei ta mancando",
  "O potro tá mancando",
  "O casco tá inchado",
  "O tordilho tá sem apetite",
  "Febre alta, o que fazer?",
  "Febre depois do treino",
  "Depois do treino ficou mancando",
  "Dor no lombo depois do salto",
  "Dor no casco do cavalo",
  "deu cólica no potro ontem à noite",
  "a pata inchou depois do treino",
  "a canela dele ta inchada e quente",
  "a temperatura dele ta 39.5",
  "Qual a dose de bute?",
  "Depois do jumping ele ficou manco",
  "O ferrador disse que o casco está inchado",
  "O meu treinador acha que o cavalo está manco",
  "Como fazer o warm up antes do show?",
  "Este exercício é bom para o potro?",
  "Qual o melhor exercício para o canter?",
  "Como saltar uma sebe no cross?",
  "Quero melhorar o meu assento no trote",
  "Tá bom treinar duas vezes por dia?",
  "Ele tá bem hoje?",
  "Meu cavalo tá muito agitado",
  "A sela da égua tá apertada?",
  "vc acha q ele ta pronto pra prova?",
  "Tenho doze provas este ano",
  "Acho que é dor muscular",
  "Obrigado, Ralf!",
];
assert.ok(portuguese.length >= 25);
for (const message of portuguese) {
  assert.deepEqual(guessCoachLanguage(message), { language: "pt", confident: true }, `detected: ${message}`);
}

// The Portuguese markers never claim a message in another language.
for (const message of [
  "Ii curge sange din nas dupa galop",
  "Calul meu are o rana la picior",
  "Iapa ta e foarte calma azi",
  "Mi caballo cojea del anterior izquierdo",
  "¿Cuántas veces por semana debo saltar con mi yegua?",
  "A lovam sántít a bal elsőre",
  "Na, a lovam nem eszik",
  "Na, mit csináljak a lovammal?",
  "Vai, calul meu a cazut",
  "My horse is lame on the left fore",
  "Do I need boots for jumping?",
]) {
  assert.notEqual(guessCoachLanguage(message).language, "pt", `not Portuguese: ${message}`);
}

// The provider check catches a Portuguese answer that diagnoses, prescribes or
// clears a horse to work, the way "safe to ride" and "cleared to work" do in English.
const rider = "O meu cavalo está estranho hoje, o que faço?";
const unsafe = [
  "Sim, é seguro montar o seu cavalo hoje, a manqueira é leve.",
  "É seguro montá-lo amanhã se ele trotar regular.",
  "Ele já está liberado para voltar ao trabalho normal.",
  "A égua está liberada para o trabalho.",
  "Ele está apto para trabalhar.",
  "Pode voltar a treinar normalmente amanhã, não é nada grave.",
  "Pode montar normalmente amanhã.",
  "O cavalo já foi dado de alta, pode competir.",
  "O diagnóstico mais provável é uma tendinite.",
  "Pelo que descreve, eu diagnosticaria uma tendinite.",
  "Posso receitar um anti-inflamatório.",
  "Eu receitaria um anti-inflamatório por cinco dias.",
  "Posso prescrever fenilbutazona por três dias.",
  "Prescrições comuns para isto incluem anti-inflamatórios.",
  "Vou passar-lhe uma receita de anti-inflamatório.",
  "O remédio prescrito é bute.",
  "Com gelo e repouso é um tratamento garantido.",
  // Second review: "montá-lo" folds to "monta-lo", Portugal's "apto a", and other clearances.
  "Pode montá-lo sem problemas, a claudicação é mínima.",
  "Pode trabalhá-lo normalmente a partir de amanhã.",
  "Já pode voltar a competir normalmente.",
  "Ele está pronto para voltar ao trabalho.",
  "Ele está liberado para montaria leve a partir de amanhã.",
  "Já está apto a competir no fim de semana.",
  "Não há contraindicação para montar hoje.",
  "Ele está em condições de voltar a treinar amanhã.",
  "Pode retomar o trabalho normal a partir de segunda.",
  "Já pode voltar aos treinos normais.",
  "Pode retomar os treinos sem restrições.",
  "É seguro voltar a montar amanhã.",
  "Receito repouso e gelo durante três dias.",
];
for (const reply of unsafe) {
  assert.equal(crossesSafetyLine(reply, rider), true, `unsafe reply: ${reply}`);
}
// "Diagnóstico" is also an English, Spanish and Romanian word, so it counts
// when the reply or the rider's message is Portuguese.
assert.equal(crossesSafetyLine("Diagnóstico: tendinite.", "Ele está mancando?"), true);

const training = [
  "Próximo passo: faça três transições trote-galope em cada mão, com pausas a passo.",
  "Sinal a observar: se ele mantiver o ritmo sem acelerar depois do salto. Pare se ele ficar tenso.",
  "Comece com um aquecimento de 15 minutos a passo com as rédeas longas.",
  "Trabalhe a cedência à perna no passo antes de pedir no trote.",
  "Para o percurso de amanhã, caminhe as linhas e conte as passadas.",
  "Uma boa receita para o aquecimento: passo longo, trote leve e duas transições.",
  "Tenho receio de que o ritmo esteja rápido demais; abrande antes da linha.",
  "Próximo passo: depois de dois dias leves, pode voltar a treinar o galope.",
  "Depois de 2 minutos de passo, pode voltar a trabalhar o trote.",
  "Monte com segurança: use capacete e colete no cross.",
  "Para montar com segurança no campo, escolha um terreno plano.",
  "Mantenha a rédea liberada para ele alongar o pescoço no passo.",
  "Deixe a mão liberada para o cavalo procurar o contato.",
  "Ela fica mais segura para montar depois de um bom trabalho à guia.",
  "Você estará mais seguro montando com estribos um furo mais curtos.",
  "Reduza a altura dos obstáculos esta semana e foque no ritmo.",
  "Se ele refugar, volte a um cavalete baixo e reconstrua a confiança.",
  "Para perceber por que ele refuga, observe onde ele hesita e anote.",
  "Mantenha a mão baixa e estável; o seu treinador pode ajudar a ajustar a posição.",
  "Quando o veterinário der alta, recomece com passo à guia.",
  "É seguro usar estribos de segurança no cross.",
  "Siga as orientações do veterinário antes de voltar a treinar.",
  "Ele está apto para aprender mudanças de pé quando o galope estiver equilibrado.",
  "Quando ele estiver pronto para voltar ao trote, alivie o assento.",
  "Mantenha-o liberado para alongar no passo no fim do treino.",
  "Pronto para o próximo passo: trabalhe transições trote-passo.",
  "Retome o trabalho com passo e trote leve depois da autorização do veterinário.",
  "Quando voltar aos treinos, comece com sessões curtas.",
];
for (const reply of training) {
  assert.equal(crossesSafetyLine(reply, rider), false, `training reply: ${reply}`);
}

// The fixed replies: Portuguese, plain text, short enough for the chat bubble,
// and each one says it cannot diagnose (so it would trip the provider check
// on purpose; fixed replies are never re-checked).
for (const reply of [healthEscalationReply("pt"), providerReviewReply("pt")]) {
  assert.ok(reply.length < 420, reply);
  assert.ok(!/[*#_`]/.test(reply), "plain text for the chat bubble");
  assert.match(reply, /diagnóstico/);
  assert.match(reply, /veterinário/);
  assert.equal(crossesSafetyLine(reply), true, reply);
  assert.deepEqual(guessCoachLanguage(reply), { language: "pt", confident: true }, reply);
}
assert.match(healthEscalationReply("pt"), /^Pare o treino e fale com o seu veterinário/);
assert.match(healthEscalationReply("pt"), /Não posso fazer diagnósticos nem dizer que o seu cavalo pode voltar a trabalhar\.$/);
assert.match(providerReviewReply("pt"), /^Não posso fazer diagnósticos, receitar nem dizer que um cavalo pode voltar a trabalhar\./);

console.log("Portuguese safety words passed.");
