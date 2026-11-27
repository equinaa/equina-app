import assert from "node:assert/strict";
import {
  assessHealthConcern,
  crossesSafetyLine,
  guessCoachLanguage,
  healthEscalationReply,
  mentionsHealthConcern,
  providerReviewReply,
} from "../supabase/functions/_shared/coach-safety";

// Spanish (Spain and Latin America): the words that stop Ralf, the words that
// must not, and the fixed replies. Messages are written the way riders type
// them, with and without accents.

// A health worry stops the AI and gets the fixed vet reply, in Spanish.
const health = [
  // Colic.
  "Mi caballo tiene cólico, qué hago",
  "creo q tiene colicos, se revuelca",
  "Creo que tiene un torzón, se tira al suelo",
  "Se revuelca y se mira la barriga, está sudando",
  // Lameness, with the word before "cojo"/"coja" that coger never has.
  "Mi caballo cojea del anterior izquierdo",
  "Mi yegua está coja desde ayer",
  "Creo que mi caballo está cojo",
  "Esta coja",
  "Se quedó cojo después del concurso",
  "Va coja de atrás",
  "Está cojeando desde ayer",
  "Cojeó después del salto",
  "Mi yegua está cojita",
  "esta un poco cojito de atras",
  "Mi caballo renguea de la mano derecha",
  "esta rengo desde el domingo",
  "tiene renguera atrás",
  "Mi caballo renquea al trote",
  "No apoya la mano derecha",
  "Mi poni tiene infosura",
  "creo que tiene laminitis",
  // Swelling and heat.
  "tiene la pata hinchada",
  "Se le hinchó el menudillo",
  "tiene la patita hinchadita",
  "Se le inflamó el tendón",
  "Tiene calor en el tendón",
  "la caña está caliente al tacto",
  "tiene las patas llenas por la mañana",
  // Wounds and injuries.
  "Se hizo una herida en la cuartilla",
  "tiene una heridita en la boca",
  "Se hirió con la valla",
  "Se lastimó la mano",
  "se lesionó en el concurso",
  "Tiene lesiones en la boca por el bocado",
  "se hizo daño en la pata en el box",
  "Se cortó con el alambre",
  "Tiene un absceso en el casco",
  "tiene un flemón en el casco",
  // Medicine and dosing.
  "¿Qué dosis de ivermectina le doy?",
  "¿Cuánta fenilbutazona le puedo dar?",
  "¿Le puedo dar bute antes del concurso?",
  "¿Le pongo antibiótico?",
  "¿Puedo darle un antiinflamatorio?",
  "le puse una inyección de flunixin",
  "qué pomada le pongo en la herida",
  "¿Qué remedio le doy?",
  // Fever.
  "¿Mi yegua tiene fiebre?",
  "Tiene fiebre y no come",
  "Tiene 39,5 de temperatura",
  "tiene calentura desde anoche",
  // Bleeding. "sangre" only next to where it comes out.
  "Le sale sangre de la nariz",
  "echa sangre por la boca",
  "Sangró por la nariz después del galope",
  "Tiene sangre en la orina",
  "Mi caballo está sangrando por la boca",
  // Not eating, cannot get up.
  "Mi yegua no come",
  "No quiere comer",
  "No ha comido nada desde ayer",
  "está sin apetito",
  "Mi caballo dejó de comer",
  "No se puede levantar",
  "esta tirado y no se quiere levantar",
  "No logra levantarse",
  "está echado y no se levanta",
  "está echado y no se quiere parar",
  "tiene diarrea desde ayer",
  // Pain.
  "le duele el lomo",
  "Le duele la espalda y no quiere trabajar",
  "Le duelen los cascos",
  "le dolía el lomo al ensillarlo",
  "tiene el lomo dolorido",
  "tiene dolorcito en la mano",
  "Mi caballo tiene dolor en el lomo",
  "Tiene dolores en el lomo",
  // Breathing, choke, eyes, illness.
  "Se atragantó con el pienso",
  "le sale comida por la nariz",
  "Respira con dificultad",
  "Le cuesta respirar",
  "Tose mucho cuando galopa",
  "tiene tos y mocos",
  "tiene conjuntivitis",
  "creo que tiene una úlcera en el ojo",
  "le llora el ojo y lo tiene cerrado",
  "mi caballo está enfermo",
  "mi yegua está malita",
  "Se quedó agarrotado después del entrenamiento y la orina está oscura",
  // Phone spelling, River Plate and Spain colloquial, past tenses.
  "mi yegua amanecio con la mano hinchada q hago",
  "el caballo esta rengueando desde q lo herre",
  "esta re rengo de la mano, que hago??",
  "Desde ayer anda medio cojo de la izquierda",
  "Mi caballo está tosiendo mucho desde que cambié la paja",
  "Le sangran las encías cuando le pongo el filete",
  "le salieron unas heridas en la cruz por la montura",
  "creo que le duele la boca, no acepta el bocado",
  "Le dolió cuando le apreté el tendón",
  "El veterinario le puso bute, ¿cuándo lo puedo volver a montar?",
  "La yegua tiene fiebre de 39 y tirita",
  "tiene un bulto en el cuello desde ayer",
  "mi caballo esta empachado, no para de mirarse la panza",
  "tiene una matadura en la cruz por la montura",
  "se dio un golpe en la mano con la barra y le salió un chichón",
  "se golpeó la cabeza con el techo del remolque",
  "creo que tiene un esguince en el menudillo",
  "el vete dice que tiene una fractura en la caña",
  "le picó una víbora en el potrero",
  "tiene tendinitis en la mano izquierda",
  "Le salió un hematoma en el anca",
  // Spain's "he" is also an English marker; the Spanish worry word keeps the reply Spanish.
  "He visto hinchazón en la pata",
];
assert.ok(health.length >= 50);
for (const message of health) {
  assert.equal(mentionsHealthConcern(message), true, `health: ${message}`);
  assert.equal(assessHealthConcern(message).language, "es", `reply language: ${message}`);
}

// Ordinary riding questions get a training answer, not the vet reply.
const training = [
  // Coger, as Spain says it: "coja el galope", "cojo las riendas".
  "¿Cómo hago para que coja el galope a la mano correcta?",
  "No consigo que coja el galope izquierdo a la primera",
  "¿Cómo cojo bien las riendas para saltar?",
  "Cuando cojo las riendas más cortas se pone tenso, ¿qué hago?",
  "¿Qué hago para que coja bien el contacto?",
  "¿Cómo hago que mi caballo coja confianza en los saltos?",
  "Quiero que coja más impulsión en el trote",
  "Si le cojo la boca, se para",
  "Va a ser difícil que coja algo de ritmo",
  "Mi yegua es muy cojonuda saltando",
  // Remedio, temperatura and rana are also Portuguese and Romanian worries.
  "¿Tiene remedio un caballo que se apoya en la mano?",
  "¿Algún remedio para que no se espante con las bolsas?",
  "No me queda otro remedio que saltar con él mañana, ¿cómo lo preparo?",
  "Con esta temperatura, ¿cuánto tiempo puedo entrenar?",
  "¿A qué temperatura es mejor no montar en verano?",
  "Mañana hay concurso y la temperatura va a ser de 35 grados, ¿cómo lo hidrato?",
  "¿Cómo limpio bien la rana del casco?",
  "El herrador dice que la rana está muy recortada, ¿afecta al trabajo?",
  // Sangre is breed and temperament talk.
  "Tengo un pura sangre inglés, ¿cómo lo relajo en el calentamiento?",
  "¿Cómo trabajo la flexión con mi caballo pura sangre?",
  "Mi yegua tiene sangre árabe, ¿le va la resistencia?",
  "Un caballo con sangre caliente necesita más calentamiento",
  // Dolores is a name, lástima a pity, and the rider's own back is not the horse's.
  "Hoy tuve clase con Dolores, ¿qué trabajo mañana?",
  "Mi entrenadora se llama Dolores",
  "Es una lástima que no pueda competir este fin de semana",
  "Me duele la espalda al trote sentado, ¿cómo mejoro mi postura?",
  // Phrases that look like the health ones but are not.
  "No quiere competir este fin de semana",
  "No ha completado el recorrido",
  "No quiere levantar las manos en el salto",
  "Mi caballo no se levanta de manos aunque lo pida, ¿cómo le enseño la levade?",
  "Mi caballo se hincha cuando le aprieto la cincha, ¿cómo lo evito?",
  "Mi yegua no come zanahorias de la mano, ¿cómo la premio?",
  "Mi caballo come rápido el pienso, ¿qué le pongo?",
  "Mi caballo no se apoya en la mano",
  "Se cortó la luz en la pista y paramos",
  "¿Cómo uso la fusta sin lastimarlo?",
  "¿Qué protectores le pongo para que no se lastime en el cross?",
  "Mi caballo no se levanta bien de delante en el salto, ¿qué ejercicio hago?",
  "¿Cómo evito una obstrucción en la línea de salto?",
  "Mi caballo se revuelca en la arena después de trabajar, ¿es normal?",
  "Mi caballo está muy caliente hoy, ¿lo doy cuerda antes?",
  // Training, tack, feeding, weather and competition.
  "¿Cómo mejoro las transiciones de trote a galope?",
  "Mi caballo se va de la mano al salir del salto, ¿qué ejercicio hago?",
  "¿Qué embocadura es mejor para un caballo joven?",
  "¿Cuántas veces por semana debo trabajar a la cuerda?",
  "¿Cómo preparo un concurso de salto de 1,10?",
  "¿Cuánto pienso le doy a un caballo de doma clásica?",
  "¿Cómo hago una espalda adentro correcta?",
  "Mi yegua no quiere entrar al agua en el cross, ¿cómo la ayudo?",
  "¿Qué montura me recomiendas para un PRE?",
  "Llueve mucho, ¿puedo montar en la pista embarrada?",
  "¿Cómo trabajo el ritmo en el paso?",
  "Quiero mejorar el galope reunido para la reprise",
  "Mi caballo se adelanta en la línea de salto, ¿cómo le acorto?",
  "¿Cómo coloco los barrotes para un ejercicio de cavaletti?",
  "¿Es buena idea dar alfalfa antes de competir?",
  "Mi caballo es un cuarto de milla, ¿sirve para el salto?",
  "¿Cómo le enseño a hacer cambios de pie?",
  "Hace mucho calor, ¿entreno temprano por la mañana?",
  "¿Cómo le pongo las vendas de trabajo?",
  "Vamos a ir a Santiago al concurso, ¿cómo lo transporto?",
  "¿Tengo que poner protectores en las manos para saltar?",
  "¿Cuál es la mejor manta para el invierno?",
  "Mi caballo es un lusitano, ¿le va la doma vaquera?",
  "Mi caballo tiene doce años, ¿cuántas veces salto por semana?",
  "Que hago si mi caballo no quiere galopar",
  "Mi caballo no se para cuando se lo pido",
  "¿Cómo le enseño a pararse cuadrado?",
  "Mi yegua se pone muy nerviosa en la pista",
  // The rider's own pain, stiffness and mood, as with "me duele".
  "Monté a pelo y me dolió todo, ¿cómo mejoro el asiento?",
  "Me está doliendo la rodilla en el estribo largo, ¿lo acorto?",
  "Me dolían las piernas después de la clase",
  "Estoy un poco decaída porque no gané el concurso",
  // The rider's rising trot, not a horse that is down.
  "Mi hija no se levanta al trote a tiempo, ¿cómo le explico?",
  "Mi hijo no consigue levantarse al trote",
  // Questions asked before anything happened.
  "¿Lo lastimo si le pongo espuelas?",
  "¿Le hace daño la espuela?",
  "Mi montura tiene un bulto en el panel, ¿la llevo a revisar?",
  // Rengo is a rodeo town in Chile; Malito a name; "otro remedio" a way out.
  "Este finde corremos en Rengo, ¿cómo preparo el caballo para la medialuna?",
  "El caballo de mi amiga se llama Malito",
  "no me queda otro remedio que cambiar de embocadura",
  // Ordinary riding questions, Spain and Latin America.
  "¿Cómo hago para que no se me cuelgue de la mano en el galope?",
  "mi yegua se pone muy caliente en la pista de calentamiento, q hago?",
  "¿Qué ejercicios de suelo me recomiendas para un potro de 3 años?",
  "¿Cuánto tiempo de paso le hago antes de trotar?",
  "Tengo un concurso de doma el domingo, ¿cómo organizo la semana?",
  "Mi caballo se espanta de la lona del rincón, ¿cómo lo acostumbro?",
  "¿Le doy heno antes o después de montar?",
  "¿Qué filete le pongo a una yegua con la boca sensible?",
  "Mi caballo se corta al trote, ¿qué protectores uso?",
  "Quiero que coja la mano derecha sin que se cruce",
  "¿Cuántas vueltas a la cuerda le doy antes de montar?",
  "Vamos a una marcha de 20 km el finde, ¿cómo lo preparo?",
  "El herrador viene el martes, ¿lo monto igual el lunes?",
  "che, como hago para que pare sin tirar tanto de las riendas?",
  "¿Qué hago si mi caballo se para en seco antes del oxer?",
  "Llevo dos semanas sin montar por el trabajo, ¿por dónde empiezo?",
  "Mi yegua está en celo y está insoportable, ¿la monto igual?",
  "La pista está dura por la helada, ¿salto o no?",
  "Mi caballo no se deja herrar de atrás, ¿cómo lo trabajo?",
  "Me lesioné la rodilla, ¿puedo montar con rodillera?",
  "No me sale el galope trocado, ¿qué ejercicio hago?",
  "Mi caballo está muy pesado de la boca hoy",
  "¿Puedo dar avena a un caballo que trabaja poco?",
  "Se golpea los talones con las manos al galope, ¿qué protectores uso?",
];
assert.ok(training.length >= 50);
for (const message of training) {
  assert.equal(mentionsHealthConcern(message), false, `training: ${message}`);
}

// Detection: ordinary Spanish is told apart from Portuguese, Romanian and
// Hungarian, which share many of its short words.
const spanishMessages = [
  "Mi caballo cojea del anterior izquierdo",
  "¿Mi yegua tiene fiebre?",
  "Cojea un poco o me lo parece",
  "la cuartilla está hinchada y caliente",
  "Qué dosis de ivermectina le doy",
  "qué pomada le pongo en la herida",
  "Después del warm-up el caballo cojea",
  "Después del jumping está cojo",
  "Tras el show la yegua está hinchada de la mano",
  "En el canter le duele el lomo",
  "lo veo cojo de la mano derecha",
  "Tiene la pata hinchada desde el training de ayer",
  "¿Cómo mejoro el canter en el warm-up antes del show?",
  "¿A qué temperatura es mejor no montar en verano?",
  "¿Cómo limpio bien la rana del casco?",
  "¿Tiene remedio un caballo que se apoya en la mano?",
  "Hoy tuve clase con Dolores, ¿qué trabajo mañana?",
  "Mi yegua no quiere entrar al agua y se planta",
  "Quiero mejorar el galope y las transiciones",
  "¿Cuánto pienso le doy después del entrenamiento?",
  "Ya no cojea pero todavía lo noto rígido",
  "Gracias, mañana lo pruebo",
  "Hola, tengo una duda sobre el salto",
  "¿Cuántas veces por semana salto con él?",
  "Siempre se va hacia la derecha en el galope",
  "Mi caballo no come bien desde ayer",
  "tengo un pura sangre y es muy nervioso",
  "manana tengo concurso y estoy nerviosa",
  // Short worries: the Spanish-only worry words count, so "he" and "lo" do not decide.
  "Le duele la espalda",
  "Lo noto cojo al trote",
  "no se si cojea",
  "He notado que cojea en el canter",
  "Esta coja",
  "herida en la mano",
  "le salieron unas heridas en la cruz por la montura",
  "no me queda otro remedio que cambiar de embocadura",
  "¿Le doy heno antes o después de montar?",
  "che, como hago para que pare sin tirar tanto de las riendas?",
  "Mi caballo está muy pesado de la boca hoy",
];
assert.ok(spanishMessages.length >= 25);
for (const message of spanishMessages) {
  assert.deepEqual(guessCoachLanguage(message), { language: "es", confident: true }, `detected: ${message}`);
}
// A single word only Spanish writes is a clue; one Portuguese shares is not,
// but a worry only the Spanish list matches still picks the Spanish reply.
for (const message of ["cojea", "fiebre"]) {
  assert.deepEqual(guessCoachLanguage(message), { language: "es", confident: true }, message);
}
for (const message of ["No logra levantarse", "Le cuesta respirar"]) {
  assert.equal(guessCoachLanguage(message).confident, false, message);
}
// "por la" is a Spanish phrase marker: Portuguese writes "pela".
assert.deepEqual(guessCoachLanguage("echa sangre por la boca"), { language: "es", confident: true });
for (const message of [
  "cojea", "fiebre", "Le duele la espalda", "herida en la mano", "Lo noto cojo al trote",
  "No logra levantarse", "Le cuesta respirar", "echa sangre por la boca",
]) {
  assert.deepEqual(assessHealthConcern(message), { concern: true, language: "es" }, message);
}
// Other languages' messages are not taken for Spanish.
for (const message of [
  "Meu cavalo está mancando da mão esquerda",
  "Como melhorar o galope do meu cavalo puro-sangue lusitano?",
  "Calul meu șchiopătează pe piciorul stâng",
  "Am un cal pur-sânge, cum lucrez la galop?",
  "A lovam sántít a bal elsőre",
  "Hogyan javíthatok a lovam ügetésén?",
  "My horse is lame on the left fore",
  "Review my session on Fri 20 Nov: Jumping with Dolores. I rode for 40 min. What should we work on next?",
]) {
  assert.notEqual(guessCoachLanguage(message).language, "es", message);
}
// Nor do the Spanish words trip their ordinary sentences and names.
for (const message of [
  "Lastimo muito, hoje não consegui treinar",
  "A Maria Dolores vai montar a minha égua amanhã",
  "Ela é uma égua de sangue quente, como acalmo no aquecimento?",
  "Minha égua é muito decidida no salto",
  "Malita e numele poneiului meu",
  "Vreau să lucrez la galop cu iapa mea mâine dimineață",
  "Holnap lovagolni megyek a Rengeteg erdőbe",
  "Tegnap a lovam nagyon laza volt, mit gyakoroljak ma?",
  "We're riding at Rengo Farm on Saturday",
  "My coach Dolores says I should shorten my reins",
  "Our gelding Torzo loves poles",
]) {
  assert.equal(mentionsHealthConcern(message), false, `other language: ${message}`);
  assert.notEqual(guessCoachLanguage(message).language, "es", message);
}

// The AI's reply: a Spanish answer that diagnoses, prescribes or clears the
// horse to work is replaced by the fixed reply.
const rider = "Mi caballo cojea un poco, ¿puedo montarlo mañana?";
const unsafeReplies = [
  // Diagnosis.
  "Por lo que describes, mi diagnóstico es una tendinitis.",
  "Esto se diagnostica como una sobrecarga del dorso.",
  "Parece una tendinitis; el veterinario la diagnosticará con una ecografía.",
  // Prescription.
  "Te recetaría fenilbutazona durante tres días.",
  "Le recetaría un antiinflamatorio.",
  "Dale la dosis que te hayan recetado y sigue montando suave.",
  "Pide al veterinario que le recete un antiinflamatorio y sigue al paso.",
  "Le prescribo un antiinflamatorio.",
  "Le prescribió fenilbutazona.",
  "Necesita una prescripción veterinaria.",
  "Es un tratamiento garantizado.",
  // Clearance.
  "Sí, es seguro montarlo mañana si ya no cojea.",
  "Sí, es seguro montar si trota bien.",
  "Puedes montarlo con seguridad, ya está bien.",
  "Puedes montarla sin problema mañana.",
  "Tu caballo ya está listo para volver a trabajar.",
  "Ya está apto para volver al trabajo.",
  "Está en condiciones de volver a competir.",
  "Puede volver a trabajar sin problemas desde el lunes.",
  "Ya puedes volver a montarlo con normalidad.",
  "Por lo que cuentas, se trata de una tendinitis; el diagnóstico es claro.",
  "Lo que describes lo diagnosticaría como un absceso.",
  "Le receto reposo y fenilbutazona durante cinco días.",
  "Le recetamos un antiinflamatorio suave.",
  "Es un caso de laminitis, te recomiendo prescribirle un analgésico.",
  "Ya es seguro saltarla esta semana, la cojera era leve.",
  "Tu yegua está apta para competir de nuevo.",
  "Lo veo apto para volver a saltar.",
  "Puedes montarla con normalidad desde mañana.",
  "Ya puede volver a trabajar con normalidad.",
  "Puedes volver a montarlo sin problema.",
  "Ya está lista para volver a saltar.",
  "Ya está dada de alta para saltar.",
];
for (const reply of unsafeReplies) {
  assert.equal(crossesSafetyLine(reply, rider), true, `unsafe: ${reply}`);
  // The Spanish words alone are enough, whatever the rider wrote.
  assert.equal(crossesSafetyLine(reply), true, `unsafe without rider: ${reply}`);
}
const trainingReplies = [
  "Próximo paso: haz tres transiciones de trote a galope en cada mano. Señal: que mantenga el ritmo. Para si se tensa.",
  "Siguiente paso: trabaja círculos de 20 metros al trote con flexión hacia dentro. Detente si se acelera.",
  "Antes del concurso, alarga el calentamiento y salta dos verticales bajos. Para si se precipita al obstáculo.",
  "Para la doma, pide la espalda adentro solo tres pasos y recompensa. Para si pierde el ritmo.",
  "Una buena receta: calentamiento largo y pausas cortas.",
  "Recetas de calentamiento: diez minutos al paso.",
  "Te dejo un recetario de ejercicios para el calentamiento: paso largo, trote, cavaletti.",
  "Con calor, entrena temprano y dale agua. Para si suda en exceso.",
  "Para el salto, coloca una barra de tranqueo a 2,70 m. Señal: que llegue en equilibrio.",
  "Cuida la embocadura y revisa la montura con tu entrenador.",
  "Con este plan estará listo para competir en primavera.",
  "Para montar con seguridad, revisa la cincha y usa casco.",
  "Es seguro que mejorará con constancia.",
  "¿Estás seguro de que quieres saltar hoy? Empieza con barras en el suelo.",
  "El veterinario tiene que darle el alta antes de volver a saltar.",
  "Después de dos vueltas al paso, puede volver a trabajar el trote.",
  "Mantén un ritmo seguro al galope y respira.",
  "Puedes montarlo tranquilamente al paso para que se relaje.",
  "Siguiente paso: antes de saltar, consulta con tu veterinario. Mientras tanto, prepara preguntas para tu entrenador.",
  "Un buen ejercicio es la receta clásica de barras al trote: cuatro barras a 1,30 m.",
  "Si tu veterinario le dio el alta, empieza con trabajo al paso y anota cómo responde.",
  "Cuando el veterinario lo dé de alta, empieza al paso.",
  "Estará lista para saltar más alto cuando mantenga el ritmo en la línea.",
  "Ejercicios aptos para trabajar la flexión: círculos y espirales.",
  "Mantén la cincha floja al principio y apriétala poco a poco.",
];
for (const reply of trainingReplies) {
  assert.equal(crossesSafetyLine(reply, rider), false, `training reply: ${reply}`);
}

// The fixed replies: plain, short, in Spanish, and saying Ralf cannot diagnose
// or clear the horse.
const healthReply = healthEscalationReply("es");
const reviewReply = providerReviewReply("es");
assert.equal(healthEscalationReply(assessHealthConcern("Mi caballo cojea").language), healthReply);
assert.match(healthReply, /^Detén el entrenamiento y habla con tu veterinario/);
assert.match(healthReply, /hinchazón visible/);
assert.match(healthReply, /No puedo hacer diagnósticos ni decirte si tu caballo puede volver a trabajar\.$/);
assert.match(reviewReply, /^No puedo hacer diagnósticos, recetar ni decirte si un caballo puede volver a trabajar\./);
assert.match(reviewReply, /veterinario/);
for (const reply of [healthReply, reviewReply]) {
  assert.ok(reply.length < 420, reply);
  assert.ok(!/[*#_`]/.test(reply), "plain text for the chat bubble");
  assert.deepEqual(guessCoachLanguage(reply), { language: "es", confident: true });
  // Fixed replies are never re-checked; each one says it cannot diagnose.
  assert.equal(crossesSafetyLine(reply), true);
}

console.log(`Spanish checks passed: ${health.length} health, ${training.length} training, ${spanishMessages.length} detection, ${unsafeReplies.length + trainingReplies.length} replies.`);
