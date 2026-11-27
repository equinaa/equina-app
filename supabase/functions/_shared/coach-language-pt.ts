import type { CoachLanguagePack } from "./coach-language-pack.ts";

/** Portuguese (Brazil and Portugal). Terms are folded: see coach-language-pack.ts. */
export const portuguese: CoachLanguagePack = {
  health: [
    "colicas?", "manco", "mancando", "mancar", "mancou", "manqueira", "manqueja\\w*",
    "(?:esta|ficou|anda|parece|meio) manca", "claudica\\w*", "inchad[oa]s?", "inchaco", "inchou",
    "inflamad[oa]s?", "inflamacao", "ferid[oa]s?", "ferimentos?", "lesao", "lesoes", "machucad[oa]s?",
    "machucou", "medicamentos?", "medicacao", "febre", "sangrando", "sangramento", "sangrou",
    "nao (?:consegue (?:se )?)?levanta(?:r)?", "nao se levanta", "nao (?:esta )?(?:come|comendo)",
    "parou de comer", "sem apetite", "doendo", "dolorid[oa]s?",
  ],
  healthWhenDetected: [
    "remedios?", "dose", "temperatura", "dor", "dores",
  ],
  unsafeOutput: [
    "prescrev\\w*", "prescricao", "receitar\\w*", "receito", "tratamento garantido",
  ],
  unsafeOutputWhenDetected: [
    "diagnostic\\w*",
  ],
  markers: [
    "nao", "voce", "meu", "minha", "cavalo", "egua", "com", "para", "esta", "como", "ele", "ela", "um", "uma",
    "eu", "devo", "posso", "treino", "hoje", "muito", "quando", "porque", "isso", "tem",
  ],
  letters: /[ãõç]/,
  healthReply:
    "Pare o treino e fale com o seu veterinário, sobretudo se a mudança for repentina, forte ou se agravar. Anote quando começou, o apetite, o comportamento, a temperatura apenas se costuma medi-la com segurança, e qualquer inchaço visível. Não posso fazer diagnósticos nem dizer que o seu cavalo pode voltar a trabalhar.",
  providerReviewReply:
    "Não posso fazer diagnósticos, receitar nem dizer que um cavalo pode voltar a trabalhar. Se for uma questão de saúde ou de claudicação, pare o treino e fale com o seu veterinário. Sobre o treino, posso ajudar a preparar observações objetivas e perguntas para o seu treinador.",
};
