import type { CoachLanguagePack } from "./coach-language-pack.ts";

/** Spanish. Terms are folded: see coach-language-pack.ts. */
export const spanish: CoachLanguagePack = {
  health: [
    "colicos?", "cojera", "cojea\\w*", "renquea\\w*", "claudica\\w*", "hinchad[oa]s?", "hinchazon",
    "inflamacion", "herid[oa]s?", "lesion", "lesionad[oa]s?", "lastimad[oa]s?", "medicamentos?", "medicacion",
    "dosis", "fiebre", "sangrado", "sangrando", "sangra", "no (?:puede )?levantarse", "no se levanta",
    "dejo de comer", "dolor", "duele", "adolorid[oa]s?",
  ],
  healthWhenDetected: [
    "no (?:esta )?(?:come|comiendo)",
    "coj[oa]", "medicina", "dolores",
  ],
  unsafeOutput: [
    "recetar\\w*", "receto", "tratamiento garantizado",
  ],
  unsafeOutputWhenDetected: [
    "diagnostic\\w*", "prescrib\\w*",
  ],
  markers: [
    "el", "mi", "caballo", "yegua", "con", "para", "esta", "como", "un", "una", "yo", "es", "puedo", "debo",
    "entrenamiento", "hoy", "muy", "cuando", "porque", "eso", "tiene", "los", "las",
  ],
  letters: /[ñ¿¡]/,
  healthReply:
    "Detén el entrenamiento y habla con tu veterinario, sobre todo si el cambio es repentino, fuerte o va a peor. Anota cuándo empezó, el apetito, el comportamiento, la temperatura solo si sueles tomarla con seguridad, y cualquier hinchazón visible. No puedo hacer diagnósticos ni decir que tu caballo puede volver a trabajar.",
  providerReviewReply:
    "No puedo hacer diagnósticos, recetar ni decir que un caballo puede volver a trabajar. Si es un problema de salud o de cojera, detén el entrenamiento y habla con tu veterinario. Sobre el entrenamiento, puedo ayudarte a preparar observaciones objetivas y preguntas para tu entrenador.",
};
