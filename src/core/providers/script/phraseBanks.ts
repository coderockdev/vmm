// Language/niche-specific phrase banks used by MockScriptProvider so that
// each seeded channel visibly produces a different editorial voice from the
// same engine. A real LLM provider will replace this file entirely without
// touching anything else in the app.

export type ContentBucket = "affirmation" | "prayer" | "story" | "ambient";

export function inferBucket(topics: string[]): ContentBucket {
  const joined = topics.join(" ").toLowerCase();
  // PT + ES prayer / oración channels (Amor Amor lives here).
  if (
    joined.includes("oração") ||
    joined.includes("oracion") ||
    joined.includes("oración") ||
    joined.includes("oraciones") ||
    joined.includes("fé") ||
    joined.includes("fe ") ||
    joined.includes("espiritual") ||
    joined.includes("reconciliación") ||
    joined.includes("reconciliacion") ||
    joined.includes("regreso del amor")
  ) {
    return "prayer";
  }
  if (joined.includes("história") || joined.includes("historias") || joined.includes("curiosidade")) return "story";
  if (joined.includes("chuva") || joined.includes("ruído blanco") || joined.includes("ruído branco") || joined.includes("relaxamento")) {
    return "ambient";
  }
  return "affirmation";
}

interface AngleTemplate {
  title: (topic: string) => string;
  angle: string;
  objective: string;
}

const AFFIRMATION_ANGLES_ES: AngleTemplate[] = [
  { title: (t) => `Oración urgente para ${t}`, angle: "oración de urgencia", objective: "gerar esperança inicial" },
  { title: (t) => `Afirmaciones para liberar resentimientos sobre ${t}`, angle: "liberação emocional", objective: "soltar mágoas antigas" },
  { title: (t) => `Cómo preparar tu mente para ${t}`, angle: "preparação mental", objective: "criar clareza e intenção" },
  { title: (t) => `Oración nocturna para restaurar vínculos: ${t}`, angle: "oración nocturna", objective: "acalmar antes de dormir" },
  { title: (t) => `Afirmaciones de autoestima después de ${t}`, angle: "autoestima", objective: "reconstruir autovalor" },
  { title: (t) => `Palabras de esperanza sobre ${t}`, angle: "esperança", objective: "reforçar fé no processo" },
];

const AFFIRMATION_ANGLES_PT: AngleTemplate[] = [
  { title: (t) => `Oração urgente para ${t}`, angle: "oração de urgência", objective: "gerar esperança inicial" },
  { title: (t) => `Afirmações para liberar ressentimentos sobre ${t}`, angle: "liberação emocional", objective: "soltar mágoas antigas" },
  { title: (t) => `Como preparar sua mente para ${t}`, angle: "preparação mental", objective: "criar clareza e intenção" },
  { title: (t) => `Oração noturna para restaurar vínculos: ${t}`, angle: "oração noturna", objective: "acalmar antes de dormir" },
  { title: (t) => `Afirmações de autoestima depois de ${t}`, angle: "autoestima", objective: "reconstruir autovalor" },
  { title: (t) => `Ritual breve de energia para ${t}`, angle: "ritual energético", objective: "renovar energia emocional" },
];

const PRAYER_ANGLES_ES: AngleTemplate[] = [
  { title: (t) => `Oración terrible para que regrese: ${t}`, angle: "invocación de regreso", objective: "despertar urgencia de contacto" },
  { title: (t) => `Si te bloqueó, escucha esto sobre ${t}`, angle: "romper el silencio", objective: "sostener la esperanza de un mensaje" },
  { title: (t) => `Oración de las 3:33 para ${t}`, angle: "hora simbólica", objective: "intensificar el deseo de regreso" },
  { title: (t) => `Que recuerde tu nombre: ${t}`, angle: "arrepentimiento", objective: "imaginar el orgullo cediendo" },
  { title: (t) => `Oración para que escriba esta noche: ${t}`, angle: "mensaje inesperado", objective: "canalizar la desesperación en oración" },
  { title: (t) => `No digas su nombre todavía: ${t}`, angle: "advertencia / gancho", objective: "enganchar en los primeros segundos" },
];

const PRAYER_ANGLES_PT: AngleTemplate[] = [
  { title: (t) => `Oração para atravessar ${t}`, angle: "oração central", objective: "trazer conforto imediato" },
  { title: (t) => `Momento de gratidão sobre ${t}`, angle: "gratidão", objective: "mudar o foco para o que há de bom" },
  { title: (t) => `Oração de paz interior diante de ${t}`, angle: "paz interior", objective: "acalmar antes de dormir" },
  { title: (t) => `Palavras de fé para ${t}`, angle: "fortalecimento da fé", objective: "renovar esperança" },
  { title: (t) => `Bênção da noite para quem enfrenta ${t}`, angle: "bênção noturna", objective: "encerrar o dia em paz" },
  { title: (t) => `Reflexão espiritual sobre ${t}`, angle: "reflexão", objective: "trazer clareza espiritual" },
];

const STORY_ANGLES_PT: AngleTemplate[] = [
  { title: (t) => `A vez que Zé se meteu em ${t}`, angle: "episódio cômico", objective: "entreter com um imprevisto" },
  { title: (t) => `O dia em que Zé descobriu ${t}`, angle: "descoberta surpreendente", objective: "gerar curiosidade" },
  { title: (t) => `Como Zé resolveu um problema com ${t}`, angle: "resolução engenhosa", objective: "surpreender com a solução" },
  { title: (t) => `A história de Zé e ${t}`, angle: "narrativa de bastidor", objective: "criar identificação" },
  { title: (t) => `O que ninguém contou sobre ${t} (segundo o Zé)`, angle: "revelação leve", objective: "prender atenção com um segredo" },
];

const AMBIENT_ANGLES_PT: AngleTemplate[] = [
  { title: (t) => `Ambiente de ${t} para relaxar`, angle: "loop ambiente", objective: "induzir relaxamento" },
  { title: (t) => `${t} para uma noite tranquila`, angle: "loop noturno", objective: "ajudar a dormir" },
  { title: (t) => `Sons de ${t} para foco e descanso`, angle: "loop de foco", objective: "acompanhar estudo/descanso" },
];

export function pickAngleTemplates(bucket: ContentBucket, language: string): AngleTemplate[] {
  if (bucket === "affirmation") return language === "es" ? AFFIRMATION_ANGLES_ES : AFFIRMATION_ANGLES_PT;
  if (bucket === "prayer") return language === "es" ? PRAYER_ANGLES_ES : PRAYER_ANGLES_PT;
  if (bucket === "story") return STORY_ANGLES_PT;
  return AMBIENT_ANGLES_PT;
}

// ---------------------------------------------------------------------------
// Script section builders. Each returns an array of short sentences (lines).
// ---------------------------------------------------------------------------

export interface ScriptSections {
  opening: string[];
  preparation: string[];
  main: string[];
  reflection: string[];
  closing: string[];
}

// Rough speaking+pause budget per generated line, used to scale the "main"
// section toward the requested duration instead of always emitting a fixed
// handful of sentences (a real LLM provider would do this properly; this is
// the mock's best-effort approximation of the same contract).
const SECONDS_PER_LINE_ESTIMATE = 3.6;
const MAX_MAIN_LINES = 90; // guardrail so a 20min request doesn't runaway

function targetMainLineCount(durationMinutes: number, baseCount: number): number {
  const estimated = Math.round((durationMinutes * 60) / SECONDS_PER_LINE_ESTIMATE);
  return Math.min(MAX_MAIN_LINES, Math.max(baseCount, estimated));
}

/** Cycles through `pool`, prefixing repeats with a connector so a long mock
 * script doesn't read as literally copy-pasted once it wraps around. */
function expandPool(pool: string[], count: number, connectors: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const line = pool[i % pool.length];
    const cycle = Math.floor(i / pool.length);
    out.push(cycle === 0 ? line : `${connectors[(cycle - 1) % connectors.length]} ${line[0].toLowerCase()}${line.slice(1)}`);
  }
  return out;
}

export function buildAffirmationSections(
  topic: string,
  angle: string,
  language: "es" | "pt",
  durationMinutes: number
): ScriptSections {
  if (language === "es") {
    const pool = [
      `Hoy vamos a trabajar en ${angle}.`,
      "Repite en silencio cada afirmación que voy a decir.",
      "Yo merezco amor verdadero y correspondido.",
      "Suelto lo que ya no puedo controlar.",
      "Abro espacio para nuevas posibilidades en mi corazón.",
      "Confío en el momento correcto de las cosas.",
      "Mi corazón sana a su propio ritmo, sin prisa.",
      "Elijo la paz por encima de la necesidad de tener razón.",
      "Soy digno de un amor tranquilo y correspondido.",
      "Libero cualquier expectativa que me cause ansiedad.",
      "Cada respiración me acerca un poco más a mi calma.",
      "Agradezco lo que este proceso me está enseñando.",
    ];
    const connectors = ["Una vez más,", "Con calma,", "Respirando,", "Sin prisa,"];
    return {
      opening: ["Respira profundamente.", `Este es un momento para ti y para ${topic}.`],
      preparation: ["Permite que tu mente se quede tranquila.", "Suelta la tensión de los hombros y del pecho."],
      main: expandPool(pool, targetMainLineCount(durationMinutes, 5), connectors),
      reflection: ["Quédate unos segundos con esa sensación.", "Nota cómo tu respiración se vuelve más calma."],
      closing: ["Lleva esta energía contigo el resto del día.", "Si esta oración te ayudó, vuelve mañana para la siguiente."],
    };
  }
  const pool = [
    `Hoje vamos trabalhar em ${angle}.`,
    "Repita em silêncio cada afirmação que eu disser.",
    "Eu mereço amor verdadeiro e correspondido.",
    "Eu solto aquilo que já não posso controlar.",
    "Abro espaço para novas possibilidades no meu coração.",
    "Confio no tempo certo das coisas.",
    "Meu coração cura no seu próprio ritmo, sem pressa.",
    "Escolho a paz em vez da necessidade de ter razão.",
    "Sou digno de um amor tranquilo e correspondido.",
    "Solto qualquer expectativa que me cause ansiedade.",
    "Cada respiração me aproxima um pouco mais da calma.",
    "Sou grato pelo que esse processo está me ensinando.",
  ];
  const connectors = ["Mais uma vez,", "Com calma,", "Respirando fundo,", "Sem pressa,"];
  return {
    opening: ["Respire profundamente.", `Este é um momento só seu e sobre ${topic}.`],
    preparation: ["Permita que sua mente fique tranquila.", "Solte a tensão dos ombros e do peito."],
    main: expandPool(pool, targetMainLineCount(durationMinutes, 5), connectors),
    reflection: ["Fique alguns segundos com essa sensação.", "Perceba sua respiração ficando mais calma."],
    closing: ["Leve essa energia com você pelo resto do dia.", "Se essa oração te ajudou, volte amanhã para a próxima."],
  };
}

export function buildPrayerSections(
  topic: string,
  angle: string,
  durationMinutes: number,
  language: "es" | "pt" = "pt"
): ScriptSections {
  if (language === "es") {
    // Intense love-prayer mock (Amor Amor style) — NO breathing / meditation.
    const pool = [
      `Hoy no vengo a pedirte que te calmes. Vengo a orar por ${topic}.`,
      "Si te duele el silencio, quédate. Esta oración es para ese dolor exacto.",
      "Que esa persona recuerde lo que vivieron juntos cuando menos lo espere.",
      "Que el orgullo se quiebre. Que la distancia duela también del otro lado.",
      "Que sienta la urgencia de escribir, de llamar, de volver a buscarte.",
      "Que diga en su corazón: perdóname, quiero hablar contigo.",
      "Repito: que regrese. Que regrese. Que regrese.",
      "Que rompa este bloqueo. Que deje de huir de lo que aún siente.",
      "Que esta noche no pueda dormir sin pensar en ti.",
      "Que el amor verdadero encuentre camino, aunque ahora solo haya herida.",
    ];
    const connectors = ["Escucha:", "Con más fuerza:", "Ahora:", "Desde el fondo:"];
    return {
      opening: [
        "Cuidado.",
        "No digas su nombre todavía.",
        `Si llegaste aquí por ${topic}, esta oración no es suave: es urgente.`,
      ],
      preparation: [
        "Suscríbete a Amor Amor si esto te está hablando al pecho.",
        "Escribe su nombre en los comentarios solo si estás listo para orar hasta el final.",
      ],
      main: expandPool(pool, targetMainLineCount(durationMinutes, 8), connectors),
      reflection: [
        "Ahora suelta un poco la bronca. Si hay amor verdadero, que encuentre su camino.",
        "Perdono lo que pueda. Suelto lo que ya no me corresponde cargar.",
      ],
      closing: ["Gracias.", "Gracias.", "Gracias.", "Amén.", "Escribe AMÉN y vuelve mañana."],
    };
  }

  const pool = [
    `Vamos entrar juntos em ${angle}.`,
    "Senhor, obrigado por mais um dia de vida.",
    "Peço serenidade para lidar com o que ainda pesa no coração.",
    "Que a paz encontre cada canto desta casa e desta mente.",
    "Renova em mim a esperança para amanhã.",
    "Que eu consiga perdoar o que hoje ainda dói.",
    "Coloco em tuas mãos aquilo que não consigo resolver sozinho.",
    "Que meus passos amanhã sejam mais leves que hoje.",
    "Obrigado pelas pessoas que caminham comigo.",
    "Que eu enxergue as bênçãos escondidas neste dia difícil.",
  ];
  const connectors = ["Senhor,", "Mais uma vez,", "Em silêncio,", "Com fé,"];
  return {
    opening: ["Boa noite.", `Se você chegou até aqui pensando em ${topic}, este momento é para você.`],
    preparation: ["Feche os olhos, se puder.", "Solte o peso do dia dos seus ombros."],
    main: expandPool(pool, targetMainLineCount(durationMinutes, 5), connectors),
    reflection: ["Fique em silêncio por um instante.", "Sinta essa paz se espalhando devagar."],
    closing: ["Que você durma em paz esta noite.", "Amém. Até amanhã."],
  };
}

export function buildStorySections(topic: string, angle: string, durationMinutes: number): ScriptSections {
  const pool = [
    `Tudo começou quando o Zé decidiu se meter em ${angle}.`,
    "Ele achou que ia ser simples. Não foi.",
    "No meio da confusão, uma coisa que ninguém esperava aconteceu.",
    "E foi exatamente aí que a história virou de cabeça para baixo.",
    "Ninguém no bairro sabia como aquilo ia terminar.",
    "O Zé, claro, resolveu complicar ainda mais as coisas.",
    "E foi bem naquele momento que tudo quase deu errado.",
  ];
  const connectors = ["Pois é,", "E não parou por aí:", "Só que", "Aí"];
  return {
    opening: [`Vou te contar uma história sobre ${topic}.`, "Se prepara que essa é boa."],
    preparation: ["Foi numa tarde comum, dessas que ninguém espera nada de diferente."],
    main: expandPool(pool, targetMainLineCount(durationMinutes, 4), connectors),
    reflection: ["No fim, o Zé aprendeu algo que não vou esquecer de te contar."],
    closing: ["E é assim que termina mais uma do Zé.", "Se você riu, comenta aqui embaixo."],
  };
}

export function buildAmbientSections(topic: string): ScriptSections {
  return {
    opening: [],
    preparation: [],
    main: [`Ambiente contínuo de ${topic}, sem narração.`],
    reflection: [],
    closing: [],
  };
}
