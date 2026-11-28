import assert from "node:assert/strict";
import { spanish } from "../supabase/functions/_shared/coach-language-es";
import {
  assessHealthConcern,
  crossesSafetyLine,
  foldForMatching,
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
  // Fever and temperature with the horse, or no subject, as the one who has it.
  "Mi yegua tiene temperatura hoy",
  "Mi caballo tiene temperatura desde ayer",
  "Mi caballo hoy tiene temperatura",
  "Tiene 39 grados de temperatura",
  "La yegua de mi hija tiene temperatura",
  "La yegua de mi hija tiene fiebre",
  "Mi hija dice que la yegua tiene fiebre",
  "Tengo a mi yegua con fiebre desde ayer",
  "Con fiebre no la monto, ¿verdad?",
  "La temperatura es 39,5",
  "La temperatura es de 39.8",
  "Temperatura 39,5, ¿llamo al veterinario?",
  "Temperatura 39,5 a la yegua",
  "Le tomé la temperatura y marca 39,6",
  "En la cuadra tiene 39 de temperatura",
  "Por la noche tiene temperatura",
  "Mi yegua tiene tos desde ayer",
  // A person who owns the horse is not the one who is ill.
  "El caballo de mi entrenador está enfermo",
  "La yegua de mi profe está enferma",
  "El caballo de mi hija está malito",
  "Mi caballo está malito",
  "Mi entrenador dice que está enfermo",
  "Creo que está enferma",
  "Mi yegua se puso enferma",
  "Mi caballo está muy decaído",
  // The horse's soreness, with an intensifier or a dropped subject.
  "Mi yegua está muy dolorida del lomo",
  "Está toda dolorida después del concurso",
  "El caballo está todo dolorido",
  "Mi yegua anda adolorida de la mano",
  "Lo noto dolorido del lomo",
  "Quedó dolorido después del salto",
  "Sigue dolorida del lomo",
  "Le sigue doliendo la mano",
  "A mi yegua le sigue doliendo el casco",
  "A mi yegua le duele el lomo",
  "Al caballo de mi hija le duele la mano",
  "Mi yegua siente dolor al trote",
  "Mi caballo se queja de dolor en la mano",
  "Tengo un caballo con dolor de espalda, ¿qué hago?",
  "tiene mucho dolor en el casco",
  // A horse that is down, not one that jumps flat.
  "Mi caballo no se levanta",
  "No se levanta desde esta mañana",
  "Está tumbado y no se quiere levantar",
  "No puede levantarse del suelo",
  "No se quiere levantar del suelo",
  "No se levanta en el box",
  "Mi caballo no se levanta en la cuadra",
  // Doses of medicine, not of feed.
  "¿Qué dosis de bute le doy?",
  "¿Cuánta dosis de fenilbutazona?",
  "¿Qué dosis le doy?",
  "¿Qué dosis de antiinflamatorio?",
  "¿Qué dosis de Banamine le pongo?",
  "¿Qué dosis de antibiótico le doy?",
  "Mi caballo tiene una lesión y no sé qué dosis de bute darle",
  // Lameness: "rengo" with the word before it, "claudicar" as limping.
  "Mi yegua está renga",
  "Anda rengo de la mano",
  "lo veo rengo de atrás",
  "El potro empezó a claudicar de la mano",
  "Mi caballo claudica de la mano derecha",
  "Ya no claudica pero lo noto rígido",
  // Illness as Latin America and Spain say it: "se enfermó", "enfermito",
  // "está malo", "pachucho", and the broodmare ("la yegua madre") is not a person.
  "mi yegua se enfermó y no quiere salir del box",
  "el potro está enfermito desde el finde, q le doy?",
  "Tengo la yegua enferma, qué hago?",
  "Mi caballo enfermó de repente",
  "¿Cómo cuido a un caballo enfermo?",
  "Mi yegua se ha enfermado",
  "Tengo un potro enfermito",
  "Mi yegua está mala desde ayer, no sé qué tiene",
  "La yegua sigue mala",
  "Mi caballo está pachucho, no tiene ganas de nada",
  "esta re pachucho el petiso",
  "La yegua madre tiene fiebre desde que parió",
  "La yegua madre está enferma y el potrillo no mama",
  "La yegua madre se lastimó",
  // Coughing, a runny nose and weepy eyes.
  "Empezó a toser cuando lo saco a galopar",
  "tosía mucho anoche y hoy tiene moquitos",
  "Tose",
  "Está tosiendo",
  "Le moquea la nariz",
  "Tiene el ojo lloroso y medio cerrado",
  "Tiene los ojos llorosos",
  "Le lloran los ojos",
  "Le cuesta respirar después del galope y le sale moco por la nariz",
  "A mi yegua le cuesta respirar",
  // Heat, swelling, colic and lameness, phone spelling included.
  "Tiene los cascos calientes y no quiere caminar",
  "tiene los tendones calientes",
  "Le salió un bulto en la panza y está caliente",
  "Se le hinchó la barriga y no defeca",
  "Se le hincha la panza cuando come",
  "Se le hinchó la pata cuando lo ensillé",
  "Se revuelca mucho y suda, creo q es un cólico",
  "Le dio un cólico anoche, ¿cuándo lo vuelvo a montar?",
  "Tiene cólicos frecuentes",
  "Está con cólicos",
  "Tenemos un cólico en la cuadra",
  "Hoy lo vi rengueando un poco al trote, ¿lo monto?",
  "Mi caballo está cojeando de la mano izq, le pongo hielo?",
  "Cojea un poco en el medio de la pista",
  "lo noto medio rengo",
  "Mi yegua renquea",
  "Tiene renquera desde ayer",
  "No apoya la pata de atrás desde ayer",
  "Está como triste, no come y se echa todo el rato",
  "Está muy flaco y con diarrea, qué le doy?",
  "No ha hecho bosta en todo el día y se mira la panza",
  "¿Cuántos ml de flunixin le pongo?",
  // Injuries with the horse, or a dropped subject, as the one who has them.
  "Tiene un tajo en la caña y le sale sangre",
  "Se lastimó la boca con el bocado y sangra",
  "tiene una herida fea en el corvejón q supura",
  "Tengo un caballo con una herida en la pata",
  "Tengo una yegua herida",
  "Mi hija dice que la yegua tiene una herida",
  "El caballo de mi hija tiene un esguince",
  "Mi entrenador dice que tiene una lesión en el tendón",
  "Mi veterinario dice que tiene una fractura",
  "Mi caballo está lesionado",
  "Se fracturó la caña",
  "El vete dice que está fracturado",
  "Mi caballo se cayó y le duele la mano",
  "Tengo una lesión en el tendón de mi yegua, ¿cuánto reposo?",
  "Tengo un esguince en la mano de mi caballo",
  "Tengo una herida fea en la pata de mi yegua, ¿la curo yo?",
  "Mi hija tiene la yegua lesionada",
  "Mi entrenador está preocupado porque la yegua está enferma",
  "Mi hija me dijo que se lastimó la yegua",
  "Estoy preocupada, está enferma",
  "Estoy viendo una herida en la pata",
  "Me di cuenta de que tiene una herida",
  "La yegua de mi hija tiene tos",
  "Mi caballo tiene fiebre y mi hija también",
  "La potra está mala de la panza",
  "q le doy, esta re malita",
  // Spain's "he notado": the reply is Spanish even when the worry word is English.
  "He notado que tiene fever",
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
  // The weather, the water and the stable have a temperature too, and so does a person.
  "La pista tiene 40 grados de temperatura hoy",
  "Tiene temperatura el agua del bebedero?",
  "Hoy el agua tiene temperatura ambiente, ¿le doy?",
  "La cuadra tiene 35 grados de temperatura, ¿abro las ventanas?",
  "Este box tiene temperatura agradable",
  "La temperatura es 39,5 grados en Sevilla, ¿entreno?",
  "La temperatura de 40 en Sevilla no ayuda",
  "Con una temperatura de 40, ¿cuánta agua le doy?",
  "Mañana habrá una temperatura de 40, ¿entreno temprano?",
  "Con temperatura de 39 mañana, ¿suspendo?",
  // The coach, the judge, a child or the rider being ill or in pain is not the horse.
  "Mi entrenador está enfermo y no hay clase, ¿qué trabajo hago sola?",
  "El juez está enfermo y el concurso se retrasa",
  "Mi coach está malita y no viene",
  "Mi hija está enferma",
  "Mi hija está muy enferma y no puedo ir a montar",
  "Mi profe se puso enferma, ¿qué trabajo hago?",
  "Mi madre está malita y no puedo ir a montar",
  "Mi amiga se quedó enferma en casa",
  "Mi hija tiene temperatura y no vamos a la clase",
  "Mi entrenador tiene fiebre y se cancela la clase",
  "Mi hija tiene fiebre y hoy no vamos a la cuadra",
  "Tengo fiebre, ¿puedo montar igual?",
  "Mi entrenador tiene tos y no hay clase",
  "Tengo mucha tos, ¿monto igual?",
  "Estoy enferma, ¿monto igual?",
  "Estoy un poco enferma, ¿monto igual?",
  "Mi entrenador tiene dolor de espalda y no hay clase",
  "A mi hija le duele la rodilla, ¿puede montar con rodillera?",
  "Al profe le dolía la espalda y cancelamos",
  "Mi hija está toda dolorida del gimnasio",
  "Tengo dolor de espalda, ¿cómo monto?",
  "Tengo un dolor de cabeza terrible, ¿monto igual?",
  "Tengo dolores en las piernas después de montar",
  "Me da dolor de rodilla el estribo largo, ¿lo acorto?",
  // The rider's own soreness, with an intensifier or an aspect word.
  "Estoy muy dolorida después de la clase de ayer, ¿qué estiramientos me recomiendas?",
  "Estoy toda adolorida del concurso",
  "Ando toda dolorida del gimnasio",
  "Estoy toda dolorida, ¿monto mañana?",
  "Estoy muy dolorida de la clase, ¿monto?",
  "Quedé toda adolorida después del concurso",
  "Me siento muy dolorida, ¿puedo montar?",
  "Estoy muy cansada y dolorida",
  "Estoy dolorida de la clase de ayer, ¿monto hoy igual?",
  "Me sigue doliendo la rodilla desde la caída, ¿puedo montar?",
  "Me siguen doliendo las piernas",
  // Jumping technique, rising, standing in the stirrups and getting up early.
  "Mi caballo no se levanta en los saltos, ¿qué ejercicio hago?",
  "La yegua no se levanta delante en los oxers",
  "La yegua de mi hija no se levanta delante en los oxers",
  "no se levanta nada en los verticales",
  "No se levanta lo suficiente en el salto",
  "Mi hija no se levanta temprano para montar",
  "Mi hija no se levanta en los estribos al galope",
  // Feed and supplement doses, and a dose of patience.
  "¿Qué dosis de electrolitos le doy en verano?",
  "Que dosis de sal le doy",
  "Cuanta dosis de magnesio para que se relaje?",
  "¿Qué dosis de pienso le doy?",
  "¿Qué dosis de vitamina E le doy?",
  "¿Qué dosis de electrolitos recomiendas?",
  "¿Qué dosis de biotina le doy?",
  "¿Qué dosis diaria de electrolitos le doy?",
  "Con una buena dosis de paciencia lo conseguirás",
  // "claudicar" is also giving up, and medicine a field of study.
  "No voy a claudicar con este caballo, ¿qué hago?",
  "No pienso claudicar, quiero llegar al concurso",
  "Estudio medicina y solo puedo montar dos veces por semana",
  "Estudio medicina veterinaria y monto los fines de semana",
  // Spanish words and names that other languages' worries look like:
  // Romanian "plagă"/"rană la" (wound), "julit" (grazed) and "tuse" (cough),
  // Hungarian "-ficam" (sprain) and "Butet", Portuguese "pisadura" (bruise).
  "Las moscas este año son una plaga la verdad, ¿qué repelente uso?",
  "Es una plaga la cantidad de moscas en la cuadra",
  "Monté a Rana la semana pasada y estuvo genial",
  "Mi yegua se llama Julita y salta muy bien",
  "Mañana monto con Julito, ¿qué ejercicio hago?",
  "Hoy tusé las crines de mi yegua para el concurso",
  "Y tusé la cola también",
  "Nos clasificamos para la final del domingo, ¿cómo lo preparo?",
  "Modificamos el ejercicio de barras, ¿está bien así?",
  "Le pongo el Butet nuevo, ¿cómo ajusto los estribos?",
  "como quito la pisadura de la arena",
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
  // The rider's or another person's injury, illness and breath are not the horse's.
  "Mi entrenadora se lesionó la rodilla y estoy sin clases, ¿qué hago sola?",
  "Tengo un esguince en el tobillo, ¿cuándo vuelvo a montar?",
  "Tengo una lesión en el hombro, ¿puedo montar?",
  "Tengo una lesión en la rodilla y mi yegua está bien, ¿monto?",
  "Estoy lesionada del hombro, ¿puedo montar al paso?",
  "Mi hijo tiene una fractura en el brazo, ¿cuándo puede montar?",
  "Mi hijo tiene un esguince",
  "Mi profe se fracturó la muñeca",
  "Mi hija se lesionó en el gimnasio",
  "El juez se lastimó la mano",
  "Mi entrenador se lastimó la espalda",
  "Mi hija se dio un golpe",
  "Tengo una herida en la mano, ¿me pongo guantes?",
  "Me siento herida porque el juez me puso mala nota",
  "Estoy herida del orgullo jaja",
  "Mi hija se cayó y le duele el brazo, ¿cuándo puede volver a montar?",
  "Mi novio se cayó y le duele la espalda, ¿puede montar?",
  "Me caí ayer y tengo el hombro dolorido, ¿monto hoy?",
  "Tengo el cuerpo dolorido",
  "Me cuesta respirar bien al galope por los nervios, ¿algún truco?",
  "Me cuesta respirar",
  "Mi hija tiene los ojos llorosos por la alergia al heno",
  "Tengo los ojos llorosos por el polvo de la pista",
  "Mi hija tiene tos",
  "Mi hija tose mucho",
  "Estoy tosiendo mucho, ¿monto?",
  "Tuve tos toda la semana pero ya estoy bien, ¿retomo el entrenamiento?",
  "Estoy medio enferma pero quiero ir a montar",
  "Estoy enfermita",
  "Me enfermé y no pude ir a montar",
  "Mi amiga se enfermó y no viene",
  "Se enfermó mi profe",
  "Mi entrenadora está pachucha",
  "Estoy pachucha hoy, ¿monto suave?",
  "Mi profe está con gripe, así que hoy monto sola",
  // Mexico's "tengo cólicos" is the rider's period cramps.
  "Tengo cólicos, ¿monto igual hoy?",
  "Tengo cólicos",
  // Coger, the girth, River Plate fans and a bad footing.
  "Quiero que en el medio coja el galope a la izquierda",
  "¿Cómo hago para que no se le hinche la barriga al cinchar?",
  "Se me hinchan las manos con el frío, ¿qué guantes uso?",
  "La hinchada aplaudió y mi yegua se asustó, ¿cómo la acostumbro al ruido?",
  "La hinchada de River gritaba mucho",
  "La pista está mala por la lluvia, ¿salto igual?",
  "La silla está mala",
  "Mi caballo está mal herrado",
  "Mi caballo está malo de la boca",
  "El caballo malo de la clase me tiró",
  // Giving up, and preventing an injury.
  "No quiero claudicar ahora",
  "No claudica nunca, es un luchador",
  "Ni rendirse ni claudicar, a por el concurso",
  "¿Cómo evitar lesionarse al caer?",
  // Ordinary riding talk.
  "Hoy hace un calor tremendo, ¿cuánta agua le doy después de entrenar?",
  "Mi caballo está muy fresco hoy, ¿lo doy a la cuerda primero?",
  "q ejercicio hago para q no se tire a la mano?",
  "Tengo clase con el profe Toño mañana, ¿qué preparo?",
  "Mañana vamos a Tandil a un concurso, ¿cómo cargo el remolque?",
  "¿Qué dosis de trabajo es buena para un potro de 4 años?",
  "Mi yegua me lame la mano, ¿es cariño?",
  "El caballo de mi amiga se llama Remedio y es un crack",
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
  // "quito" (I take off) is Spanish; "como" alone ties with Portuguese.
  "como quito la pisadura de la arena",
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
  "Renga is my new mare, how do I start?",
  // The rider's own soreness in Portuguese, giving up, and medicine as a field of study.
  "Estou dolorida da aula de ontem, monto hoje mesmo assim?",
  "Estou dolorida da aula de ontem, posso montar leve hoje?",
  "Fiquei toda dolorida, treino amanhã?",
  "Fiquei dolorida da aula de ontem, mas ela estava ótima.",
  "Fiquei toda dolorida depois do salto, devo montar amanhã?",
  "Estou toda dolorida depois do treino",
  "Me sinto dolorida, posso montar?",
  "Não vou claudicar, quero competir",
  "Estudo medicina e só consigo montar 2x por semana",
]) {
  assert.equal(mentionsHealthConcern(message), false, `other language: ${message}`);
  assert.notEqual(guessCoachLanguage(message).language, "es", message);
}
// The Spanish words for the rider's soreness, giving up and medicine as a
// field of study leave a Portuguese rider alone, whatever the Portuguese
// words do: "estou", "fiquei", "toda" and "meio" are the rider too.
const spanishAlwaysOn = new RegExp(`\\b(?:${spanish.health.join("|")})\\b`);
for (const message of [
  "Estou dolorida da aula de ontem, monto hoje mesmo assim?",
  "Fiquei toda dolorida, treino amanhã?",
  "Estou meio dolorida, monto assim mesmo?",
  "To dolorida hoje, monto?",
  "Acordei toda dolorida, treino leve?",
  "Me sinto dolorida, posso montar?",
  "Ando dolorida das costas, monto?",
  "Não vou claudicar, quero competir",
  "Renga is my new mare, how do I start?",
  // Portuguese "renque" (a row of trees), "tose" (clip), "estou lesionada" and
  // "nem claudicar", and Spanish "no claudica nunca" (never gives up).
  "Montamos ao longo do renque de eucaliptos até a lagoa do haras",
  "Quer que eu tose a crina dele antes da prova em Sorocaba?",
  "Estou lesionada do ombro, posso montar só ao passo?",
  "Não vou desistir nem claudicar, quero o CSN!",
  "Rafa no claudica nunca, siempre termina el recorrido",
]) {
  assert.equal(spanishAlwaysOn.test(foldForMatching(message)), false, `Spanish always-on: ${message}`);
}
// Ordinary sentences in the other languages, with names of horses, coaches and
// places: the Spanish words never fire on them, and nothing else does either.
for (const message of [
  "Montamos ao longo do renque de eucaliptos até a lagoa do haras",
  "Quer que eu tose a crina dele antes da prova em Sorocaba?",
  "A treinadora Malu disse que a Dolores pulou muito bem ontem",
  "Estou lesionada do ombro, posso montar só ao passo?",
  "O Heriberto vai ferrar a Estrela amanhã no Clube Hípico de Santo Amaro",
  "Ficamos em segundo na prova de 1,10 com o Torzão",
  "Antrenorul meu, Doru, zice că iapa Malita sare foarte bine",
  "Mergem la concursul de la Cojocna cu Fulger sâmbătă",
  "Am cumpărat un cojoc nou pentru iarnă, merg la grajd",
  "Iapa Dolores a câștigat la Sângeorz-Băi, ce lucrăm acum?",
  "Calul Sangria e foarte cuminte la pas",
  "Vreau să lucrez trapul cu Renato mâine dimineață",
  "Am fost la herghelia de la Rădăuți cu antrenoarea Ioana",
  "Holnap Dolorest lovagolom a Rengeteg erdőben",
  "Az edzőm, Tosa Péter, szerint jobban kell ülnöm",
  "Malita nagyon ügyes volt a díjugratáson Herceghalomban",
  "A Fiesta nevű kancám ma szépen ugrott",
  "Mit gyakoroljak holnap Enfer nevű lovammal?",
  "A dolog úgy áll, hogy holnap versenyre megyünk Kecskemétre",
  "We're riding at Malito Farm on Saturday with coach Dolores",
  "My coach Remedios says I should sit deeper",
  "We entered the Sangre de Cristo derby, what should I practice?",
  "Colita did a great canter on the left rein",
  "Tosin is coming to teach a clinic next week",
]) {
  assert.equal(spanishAlwaysOn.test(foldForMatching(message)), false, `Spanish always-on: ${message}`);
  assert.equal(mentionsHealthConcern(message), false, `other language: ${message}`);
}
// V8 compiles a pattern on first use, and that time grows steeply with its
// length: a 57,000-character Spanish list took over five seconds. Terms that
// share a lookbehind are grouped behind one copy of it to stay well below.
assert.ok(spanishAlwaysOn.source.length < 30_000, `Spanish always-on pattern: ${spanishAlwaysOn.source.length} characters`);
// The horse's soreness in Portuguese is still everyone's worry.
for (const message of ["A égua está dolorida no lombo", "ele está todo dolorido"]) {
  assert.equal(spanishAlwaysOn.test(foldForMatching(message)), true, `Spanish always-on: ${message}`);
  assert.deepEqual(assessHealthConcern(message), { concern: true, language: "pt" }, message);
}
// English words and names in the Spanish list wait for a Spanish message:
// they are never always-on.
for (const word of [
  "laminitis", "tendinitis", "dolor", "dosis", "lesion", "bute", "banamine", "flunixin", "azoturia", "tos",
  "hematoma", "renga", "rengo", "medicina", "dolia",
]) {
  assert.equal(spanishAlwaysOn.test(word), false, `always-on English word or name: ${word}`);
}

// A Spanish note inside the app's English ride review is read in Spanish.
const review = (note: string) =>
  `Review my session on Fri 20 Nov: Jumping with Paloma.\n\nThe app timed it live. I rode for 40 min.\nMy note: ${note}\n\n` +
  "What went well, and what is the one thing to work on next time?";
for (const note of ["Le dolía el lomo al final.", "Dolor en la mano derecha al trote.", "Creo que la dosis de bute no le hizo nada."]) {
  assert.deepEqual(assessHealthConcern(review(note)), { concern: true, language: "es" }, note);
}
for (const note of [
  "Estoy muy dolorida de la clase, pero ella fue genial.",
  "Me sigue doliendo la rodilla, pero saltó muy bien.",
  "No se levanta lo suficiente en el salto.",
]) {
  assert.equal(mentionsHealthConcern(review(note)), false, note);
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
  // A dose of a medicine, back to work and "fine to ride".
  "Puedes darle 2 gramos de fenilbutazona al día durante tres días y ver cómo evoluciona.",
  "Ponle 10 ml de Banamine en vena y llámame si no mejora.",
  "Dale una dosis de flunixin y luego llama al veterinario.",
  "Por lo que cuentas parece una tendinitis; dale fenilbutazona dos días.",
  "Ya puedes retomar el trabajo normal la semana que viene, no hace falta reposo.",
  "Tranquila, puede volver al trabajo sin problemas después de dos días de paso.",
  "Sí, ya está bien para montar, la cojera era leve.",
  "Ya está recuperada para volver a competir.",
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
  // Feed amounts, a disclaimer without a dose, a training rhythm, the footing
  // and the week after a show.
  "Dale 1 kg de heno extra por la noche y 30 gramos de electrolitos en verano.",
  "Dale una zanahoria de premio y media hora de paso.",
  "Ponle una manta ligera después del trabajo.",
  "Si el veterinario recomienda fenilbutazona, sigue sus indicaciones.",
  "No le des bute sin hablar con tu veterinario.",
  "Puedes retomar el ritmo normal del galope después de la transición.",
  "Después del concurso, puede volver al entrenamiento normal el martes.",
  "Con este calor, entrena temprano y retoma el trabajo normal cuando bajen las temperaturas.",
  "Esa altura está bien para saltar con un potro.",
  "La pista ya está bien para montar después de la lluvia.",
  "Para tu posición, prueba a alargar los estribos un agujero y respira al ritmo del galope.",
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
