import { ChannelDNA } from "./types";

export interface SeedChannel {
  id: string;
  name: string;
  niche: string;
  coverColor: string;
  dna: ChannelDNA;
}

export const SEED_CHANNELS: SeedChannel[] = [
  {
    id: "amor-amor",
    name: "Amor Amor",
    niche: "Amor • Relacionamentos",
    coverColor: "#e05a7c",
    dna: {
      description:
        "Canal em espanhol sobre amor, relacionamentos, reconciliação, energia emocional, afirmações e mantras.",
      purpose:
        "Criar conteúdos emocionais relacionados a amor, reconciliação, autoestima e relacionamentos.",
      audience:
        "Adultos interessados em relacionamentos, reconciliação amorosa e conteúdo espiritual/emocional.",
      language: "es",
      tone: ["acolhedor", "emocional", "calmo", "esperançoso"],
      topics: [
        "amor",
        "reconciliação",
        "relacionamentos",
        "autoestima",
        "afirmações",
        "mantras",
        "energia emocional",
      ],
      avoid: ["política", "notícias", "tecnologia", "assuntos não relacionados ao universo do canal"],
      scriptRules: {
        opening: "começar criando conexão emocional rapidamente",
        structure: "introdução → preparação → conteúdo principal → repetição/reflexão → encerramento",
        cta: "CTA curto e natural quando apropriado",
        defaultDurationMinutes: 8,
        pauses: { betweenLines: 0.5, betweenSections: 1.5 },
      },
      visual: {
        template: "neon-meditation",
        palette: "cosmic",
        textPreset: "bold-scroll",
      },
      voice: {
        provider: "cartesia",
        voiceId: "ae823354-f9be-4aef-8543-f569644136b4", // Mariana (es-CO, maternal/calm)
        speed: 0.9,
        volume: 1,
      },
      usesScript: true,
      usesNarration: true,
    },
  },
  {
    id: "oracoes-da-noite",
    name: "Orações da Noite",
    niche: "Oração • Espiritual",
    coverColor: "#5a6fe0",
    dna: {
      description:
        "Canal em português sobre orações, reflexão, gratidão, paz e mensagens espirituais para o fim do dia.",
      purpose:
        "Criar conteúdos de oração e reflexão espiritual que tragam paz e acolhimento antes de dormir.",
      audience:
        "Pessoas que buscam conforto espiritual, fé e paz interior antes de dormir.",
      language: "pt",
      tone: ["sereno", "acolhedor", "reverente", "esperançoso"],
      topics: ["oração", "gratidão", "paz interior", "fé", "reflexão noturna", "mensagens espirituais"],
      avoid: ["política", "polêmicas religiosas", "notícias", "assuntos não relacionados à espiritualidade"],
      scriptRules: {
        opening: "acolher quem chega cansado do dia com serenidade",
        structure: "introdução → oração principal → reflexão → momento de silêncio → encerramento com bênção",
        cta: "convite gentil para compartilhar ou voltar amanhã",
        defaultDurationMinutes: 10,
        pauses: { betweenLines: 0.65, betweenSections: 2 },
      },
      visual: {
        template: "neon-meditation",
        palette: "night-sky",
        textPreset: "bold-scroll",
      },
      voice: {
        provider: "cartesia",
        voiceId: "cb2694c3-715f-4da9-99f3-1c974fff2928", // Eloá (pt-BR, calorosa/calma)
        speed: 0.85,
        volume: 1,
      },
      usesScript: true,
      usesNarration: true,
    },
  },
  {
    id: "historias-do-ze",
    name: "Histórias do Zé",
    niche: "Histórias",
    coverColor: "#e0a35a",
    dna: {
      description:
        "Canal em português com histórias curtas, situações curiosas e pequenas narrativas do dia a dia contadas por um personagem fixo (Zé).",
      purpose: "Entreter com pequenas histórias curiosas, engraçadas ou surpreendentes.",
      audience: "Público geral que gosta de histórias curtas e curiosidades narrativas.",
      language: "pt",
      tone: ["descontraído", "curioso", "envolvente", "levemente bem-humorado"],
      topics: ["histórias curtas", "situações curiosas", "cotidiano", "curiosidades", "narrativas populares"],
      avoid: ["política", "conteúdo sensível", "notícias reais de terceiros identificáveis"],
      scriptRules: {
        opening: "gancho narrativo curto que gera curiosidade imediata",
        structure: "gancho → contexto → desenvolvimento → virada → conclusão/moral leve",
        cta: "convite curto para continuar acompanhando as histórias do Zé",
        defaultDurationMinutes: 5,
        pauses: { betweenLines: 0.3, betweenSections: 0.9 },
      },
      visual: {
        template: "neon-meditation",
        palette: "warm-story",
        textPreset: "bold-scroll",
      },
      voice: {
        provider: "cartesia",
        voiceId: "b0f46533-d4bb-493f-a26f-a99e1f2e86e3", // Heitor (pt-BR, caloroso/interior)
        speed: 1,
        volume: 1,
      },
      usesScript: true,
      usesNarration: true,
    },
  },
  {
    id: "chuva-para-dormir",
    name: "Chuva para Dormir",
    niche: "Relaxamento • Sono",
    coverColor: "#4a8fa0",
    dna: {
      description:
        "Canal ambiente sobre relaxamento, sono, chuva, natureza e ambientes tranquilos, sem narração — apenas visual e som.",
      purpose: "Criar ambientes visuais e sonoros relaxantes que ajudem no sono e relaxamento.",
      audience: "Pessoas com dificuldade para dormir ou que buscam relaxamento/estudo focado.",
      language: "pt",
      tone: ["calmo", "minimalista", "imersivo"],
      topics: ["chuva", "natureza", "relaxamento", "sono", "ambientes tranquilos", "ruído branco"],
      avoid: ["falas", "narração", "elementos que quebrem a imersão"],
      scriptRules: {
        opening: "sem abertura falada — transição visual suave para o ambiente",
        structure: "loop ambiente contínuo, sem estrutura narrativa tradicional",
        cta: "nenhum (canal não utiliza narração)",
        defaultDurationMinutes: 20,
        pauses: { betweenLines: 0, betweenSections: 0 },
      },
      visual: {
        template: "neon-meditation",
        palette: "rain-blue",
        textPreset: "none",
      },
      voice: {
        provider: "local",
        voiceId: null,
        speed: 1,
        volume: 0,
      },
      usesScript: false,
      usesNarration: false,
    },
  },
];
