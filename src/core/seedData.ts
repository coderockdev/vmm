import { ChannelDNA } from "./types";
import {
  defaultAmorAmorCoverDna,
  defaultArquivoCoverDna,
  defaultJulioVerneCoverDna,
  ARQUIVO_INTERIOR_STYLE_RULES,
  JULIO_VERNE_INTERIOR_STYLE_RULES,
} from "./providers/image/coverFormats";
import { defaultAmorAmorCommentAutomation } from "./comments/defaults";
import { DEFAULT_AMOR_AMOR_MUSICAL } from "./providers/music/musicalDna";
import { AMOR_AMOR_SUCCESSFUL_TITLES } from "./channels/amorAmorSuccessfulTitles";
import { AMOR_AMOR_SCRIPT_PROMPT } from "./channels/amorAmorScriptPrompt";
import { ARQUIVO_SCRIPT_PROMPT } from "./channels/arquivoScriptPrompt";

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
    niche: "Oraciones intensas para cuando el amor duele, se aleja y quieres que regrese.",
    coverColor: "#e05a7c",
    dna: {
      description: `Amor Amor es un canal de oraciones intensas para personas que atraviesan abandono, silencio, distancia, ruptura, bloqueo, orgullo, celos o desesperación amorosa.

No es un canal de meditación ni de bienestar emocional suave. Amor Amor habla desde el lugar real de quien está herido y quiere una respuesta ahora: que esa persona recuerde, extrañe, se arrepienta, rompa el silencio, llame, escriba, vuelva y pida perdón.

Los videos comienzan con alta tensión emocional y una promesa narrativa inmediata. La oración acompaña el deseo urgente del espectador sin juzgarlo ni darle lecciones sobre cómo debería sentir.

La intensidad crece hasta un clímax casi excesivo: que vuelva, que llore, que vuelva a mis pies. Después el quiebre. La persona no renuncia al deseo. Reconoce que su voluntad es humana y entrega el control a Dios. El deseo permanece. El control termina.

Amor Amor no empieza en la aceptación. Empieza en el deseo.`,
      purpose: `Crear videos de oración amorosa altamente emocionales y adictivos, capaces de captar inmediatamente a una persona que está sufriendo por amor y mantenerla escuchando hasta el final.

El espectador debe sentir desde los primeros segundos: «Esto habla exactamente de lo que me está pasando.»

La narrativa debe transformar dolor, abandono, bronca y desesperación en expectativa: algo puede cambiar, el silencio puede romperse, esa persona puede recordar lo vivido, arrepentirse, buscar contacto y regresar.

El final no es terapia de ruptura. El deseo sigue dicho. Sobre esa voluntad humana queda la de Dios. Amén.`,
      audience: `Adultos hispanohablantes que atraviesan: rupturas; abandono; contacto cero; bloqueos; mensajes sin responder; infidelidad; distancia; orgullo de la pareja o expareja; peleas; separaciones; amores que parecen perdidos; ansiedad por una llamada o mensaje; deseo urgente de reconciliación.

El espectador llega emocionalmente activado. No busca una clase sobre relaciones saludables. Busca esperanza, intensidad, compañía emocional y una oración que represente exactamente lo que desea en ese momento.`,
      language: "es",
      tone: [
        "intenso",
        "dramático",
        "urgente",
        "íntimo",
        "apasionado",
        "misterioso",
        "espiritual",
        "profundamente emocional",
        "humano y cercano",
        "autoridad al comenzar",
        "frases cortas en máxima tensión",
        "sin moralizar bronca/celos/desesperación",
      ],
      topics: [
        "Regreso del amor",
        "Reconciliación",
        "Contacto después del silencio",
        "Que vuelva a escribir",
        "Que vuelva a llamar",
        "Arrepentimiento",
        "Orgullo roto",
        "Perdón",
        "Extrañar a alguien",
        "Ser extrañado",
        "Bloqueos",
        "Contacto cero",
        "Distancia",
        "Separaciones",
        "Infidelidad",
        "Abandono",
        "No poder olvidar",
        "Recuperar una relación",
        "Una llamada inesperada",
        "Un mensaje inesperado",
        "Oraciones nocturnas",
        "Horas simbólicas 3:33 y 7:07",
        "Pronunciar el nombre de la persona",
        "Testimonios de reconciliación",
        "Del dolor a la esperanza",
      ],
      avoid: [
        "Meditaciones largas",
        "Ejercicios de respiración",
        "Respira profundamente",
        "Relájate",
        "Cierra los ojos y encuentra tu centro",
        "Preparar té, café, velas u rituales cotidianos innecesarios",
        "Introducciones filosóficas largas",
        "Psicología explicada como una clase",
        "Discursos moralizantes sobre relaciones",
        "Regañar al espectador por querer que alguien vuelva",
        "Convertir inmediatamente todo en amor propio",
        "Decir demasiado pronto que debe olvidar a esa persona",
        "Si este amor terminó, dame fuerzas para aceptarlo",
        "Quizás debemos seguir caminos separados",
        "Enséñame a olvidarlo",
        "Dame fuerzas para dejarlo ir",
        "Quizás esa persona no era para mí",
        "Si no vuelve, ayúdame a superarlo",
        "Tal vez debo cerrar este capítulo",
        "Repetir en todos los videos la misma frase «Cuidado, no pronuncies su nombre todavía»",
        "Lenguaje corporativo o terapéutico",
        "Oraciones genéricas para cualquier tema",
        "Repeticiones mecánicas sin aumento emocional",
        "Garantizar como hecho que una persona específica actuará contra su voluntad",
        "Empezar en paz o alivio antes del clímax",
        // Titles: "mantra" is rare in the hit bank (~1/111). Prefer oración/aviso/cuidado/regreso.
        "Títulos con la palabra MANTRA (usar como máximo en ~5% de los videos; casi siempre preferir oración, advertencia, cuidado, regreso, mensaje, llamada)",
        "Repetir MANTRA en títulos consecutivos o en la mayoría de ideas de un lote",
      ],
      scriptRules: {
        opening:
          "Cada video abre con su propio gancho: tensión, peligro, deseo, curiosidad y consecuencia. No saludar. No meditar. No copiar siempre «Cuidado, no pronuncies su nombre todavía». La advertencia de que el vínculo tiene que ser el correcto vive solo en este comienzo. Después, los cuatro pedidos (suscribirse a Amor Amor, comentar, compartir, like) y la frase «Ahora sí. Vamos a comenzar con la oración.»",
        structure: `1. GANCHO — algo importante está a punto de ocurrir. Entrar directo en el conflicto.
2. ADVERTENCIA — la oración no es inocua. Eficacia, consecuencias inmediatas, no decir el nombre todavía, confirmar que el vínculo es el correcto. Si no lo es: amarre, calvario, sufrimiento. Si sigue aquí, ya sabe quién es.
3. CTA — Suscríbete a Amor Amor. Comentario. Compartir. Like. Dentro de la tensión, no como comercial.
4. AHORA SÍ — «Ahora sí. Vamos a comenzar con la oración.» Y empieza la oración, sin otra introducción.
5. DESEO — quiero que vuelva. Sin vergüenza. Sin «si todavía siente algo».
6. INTENSIFICACIÓN — que me busque, que recuerde, escenas concretas (teléfono, mensaje, cama, puerta).
7. RABIA / DOLOR — que sienta mi ausencia.
8. CLÍMAX HUMANO — que vuelva llorando, desesperado, a mis pies. Casi excesivo.
9. RECONOCIMIENTO — Dios, escucha lo que acabo de pedir. Ésta es mi voluntad humana. Éste es mi ego herido. No me retracto.
10. ENTREGA — sigo queriendo que vuelva. Entrego el control, no el deseo. Yo no soy Dios. Tú eres Dios.
11. CIERRE — mi deseo permanece. Mi control termina. Tu voluntad permanece sobre la mía. Amén.
Columna: DESEO → DESESPERACIÓN → CLÍMAX → EGO → DIOS.`,
        cta: "Temprano, antes de la oración, y dentro de la tensión: «Suscríbete a Amor Amor», comentario, compartir y like. Después: «Ahora sí. Vamos a comenzar con la oración.» No interrumpir el clímax con otro comercial.",
        defaultDurationMinutes: 11,
        defaultSceneCount: 4,
        generationPrompt: AMOR_AMOR_SCRIPT_PROMPT,
        pauses: { betweenLines: 0.45, betweenSections: 0.7 },
        wordsPerMinute: 145,
        charsPerWord: 6,
        performanceTags: {
          enabled: false,
          tagsPerThousandWords: 35,
          selected: [
            "[softly]",
            "[sighs]",
            "[whispers]",
            "[warmly]",
            "[excited]",
            "[sad]",
            "[thoughtfully]",
            "[exhales]",
            "[emotional]",
            "[pause]",
            "[tenderly]",
            "[hopeful]",
            "[laughs softly]",
          ],
        },
      },
      visual: {
        template: "neon-meditation",
        palette: "cosmic",
        textPreset: "bold-scroll",
        cover: defaultAmorAmorCoverDna(),
      },
      musical: DEFAULT_AMOR_AMOR_MUSICAL,
      commentAutomation: defaultAmorAmorCommentAutomation(),
      voice: {
        provider: "heygen",
        voiceId: null,
        speed: 0.85,
        volume: 1,
        profile: {
          provider: "heygen",
          voice_id: null,
          elevenlabs_voice_id: "RyfjEHnKbtma4Srae2za",
          voice_name: "Juan Carlos",
          model: "elevenlabs_v3",
          language: "es",
          accent: "latin american",
          speed: 0.85,
          stability: 0.5,
          heygen_template_id: "c12ae661d2b6442bb079871a697ea4ef",
          capabilities: {
            emotion_tags: true,
            allowed_tags: [
              "[softly]",
              "[sighs]",
              "[whispers]",
              "[warmly]",
              "[excited]",
              "[sad]",
              "[thoughtfully]",
              "[exhales]",
              "[emotional]",
              "[pause]",
              "[tenderly]",
              "[hopeful]",
              "[laughs softly]",
            ],
            break_tags: true,
            accent_tag: false,
          },
          validated_for_channel: true,
          notes:
            "Mesma voz ElevenLabs v3 (Juan Carlos — Warm, Calm and Deep) que o template HeyGen usa. Vídeo: generate_from_template SEM voice_id. Áudio: elevenlabs_voice_id + speed 0.9 + stability 0.5.",
        },
      },
      successfulTitles: [...AMOR_AMOR_SUCCESSFUL_TITLES],
      usesScript: true,
      usesNarration: true,
    },
  },
  {
    id: "arquivo-ovni",
    name: "O Arquivo",
    niche: "Mistério brasileiro • testemunho • investigação",
    coverColor: "#071510",
    dna: {
      description:
        "Canal brasileiro de mistérios contados por quem estava lá: testemunho, dossiê e reconstrução. OVNI é um ramo, não o canal inteiro. O Brasil é o lugar — sertão, litoral, Amazônia, Minas, estrada, rio, pista, farol — e não um cenário americano com nome brasileiro.",
      purpose:
        "Publicar um caso por vídeo, em português do Brasil. Casos reais e histórias originais se alternam. O vídeo diz qual é qual. Fato documentado não se mistura com reconstrução. Cada episódio termina num detalhe concreto que continua sem resposta.",
      audience:
        "Quem assiste no Brasil e quer uma investigação, não um corte de curiosidades nem uma Area 51 traduzida.",
      language: "pt",
      tone: ["testemunho", "contido", "concreto", "noturno", "investigativo"],
      topics: [
        "mistério brasileiro",
        "testemunho em primeira pessoa",
        "dossiê",
        "sertão",
        "Amazônia",
        "litoral",
        "casos reais brasileiros",
        "história original",
      ],
      avoid: [
        "Cenário americano com nome brasileiro",
        "Viatura, placa, uniforme ou fazenda dos Estados Unidos",
        "Deserto estilo Nevada",
        "Inventar documento, testemunha, foto ou gravação e apresentar como prova real",
        "Tratar ficção como caso documentado",
        "Encerrar com «talvez nunca saibamos a verdade»",
        "Pedir like e inscrição como fecho",
        "Homenzinhos verdes e abdução de filme",
      ],
      scriptRules: {
        opening:
          "Começa dentro do momento. Não começa com o nome, a data nem com boas-vindas. O cartão verde do lugar entra depois do corte.",
        structure:
          "Testemunho em primeira pessoa. O caso vira investigação. Cartão de lugar em português, no Brasil. Fato, testemunho e reconstrução ficam separados. Um detalhe final sem resposta.",
        cta: "Uma pergunta só, depois da história. Sem pedido de like ou inscrição.",
        defaultDurationMinutes: 18,
        defaultSceneCount: 8,
        generationPrompt: ARQUIVO_SCRIPT_PROMPT,
        pauses: { betweenLines: 0.4, betweenSections: 1.2 },
        wordsPerMinute: 150,
        charsPerWord: 6,
        performanceTags: { enabled: false, selected: [], tagsPerThousandWords: 0 },
      },
      visual: {
        template: "neon-meditation",
        palette: "night-sky",
        textPreset: "none",
        cover: defaultArquivoCoverDna(),
        interiorStyleRules: ARQUIVO_INTERIOR_STYLE_RULES,
        stillImage: "gpt-image-1-medium",
        locationCard: {
          background: "#071510",
          textColor: "#3DFF7A",
          reveal: "character",
          glow: true,
        },
      },
      voice: {
        provider: "google",
        voiceId: "pt-BR-Chirp3-HD-Charon",
        speed: 0.95,
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
        defaultSceneCount: 3,
        generationPrompt: "",
        pauses: { betweenLines: 0.3, betweenSections: 0.9 },
        wordsPerMinute: 150,
        charsPerWord: 6,
        performanceTags: { enabled: false, selected: [], tagsPerThousandWords: 35 },
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
        defaultSceneCount: 4,
        generationPrompt: "",
        pauses: { betweenLines: 0, betweenSections: 0 },
        wordsPerMinute: 145,
        charsPerWord: 6,
        performanceTags: { enabled: false, selected: [], tagsPerThousandWords: 35 },
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
  {
    id: "julio-verne-audiolivro",
    name: "Júlio Verne em Audiolivro",
    niche: "Audiolivros • Clássicos • Júlio Verne",
    coverColor: "#1a3a5c",
    dna: {
      mode: "audiobook",
      description:
        "Canal de audiolivros capítulo a capítulo das obras de Júlio Verne em português. Cada vídeo é exatamente um capítulo; cada obra vira uma playlist completa.",
      purpose:
        "Produzir e publicar o catálogo de Júlio Verne em audiolivro completo, obra a obra, com narração fiel ao texto original (sem resumir nem modernizar).",
      audience:
        "Ouvintes de audiolivros e literatura clássica em português que querem acompanhar romances de Verne capítulo a capítulo.",
      language: "pt",
      tone: ["clássico", "narrativo", "sereno", "literário"],
      topics: [
        "Júlio Verne",
        "audiolivro",
        "ficção científica clássica",
        "aventura",
        "literatura do século XIX",
      ],
      avoid: [
        "Resumir o texto",
        "Modernizar / abrasileirar a prosa",
        "Alterar o conteúdo literário",
        "Spoilers na descrição da playlist",
      ],
      scriptRules: {
        opening: "Abertura falada fixa: «Júlio Verne em Audiolivro. {Obra}. {capítulo}.»",
        structure: "1 capítulo = 1 vídeo. Texto integral do capítulo + abertura/encerramento técnicos.",
        cta: "Encerramento aponta para o próximo capítulo na playlist e pede inscrição.",
        defaultDurationMinutes: 15,
        defaultSceneCount: 4,
        generationPrompt: "",
        pauses: { betweenLines: 0.4, betweenSections: 1.0 },
        wordsPerMinute: 150,
        charsPerWord: 6,
        performanceTags: { enabled: false, selected: [], tagsPerThousandWords: 0 },
      },
      visual: {
        template: "neon-meditation",
        palette: "night-sky",
        textPreset: "none",
        cover: defaultJulioVerneCoverDna(),
        interiorStyleRules: JULIO_VERNE_INTERIOR_STYLE_RULES,
      },
      voice: {
        provider: "google",
        voiceId: "pt-BR-Chirp3-HD-Orus",
        speed: 0.95,
        volume: 1,
      },
      usesScript: false,
      usesNarration: true,
    },
  },
];
