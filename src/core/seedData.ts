import { ChannelDNA } from "./types";
import { defaultAmorAmorCoverDna } from "./providers/image/coverFormats";

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

La intensidad crece durante el video hasta llegar a un momento central de invocación y repetición. Solo después de atravesar esa emoción aparece el alivio: perdonar, soltar la rabia y permitir que el amor encuentre su camino.

Amor Amor no empieza en paz. Empieza donde está la persona: en el dolor.`,
      purpose: `Crear videos de oración amorosa altamente emocionales y adictivos, capaces de captar inmediatamente a una persona que está sufriendo por amor y mantenerla escuchando hasta el final.

El espectador debe sentir desde los primeros segundos: «Esto habla exactamente de lo que me está pasando.»

La narrativa debe transformar dolor, abandono, bronca y desesperación en expectativa: algo puede cambiar, el silencio puede romperse, esa persona puede recordar lo vivido, arrepentirse, buscar contacto y regresar.

El final proporciona descarga emocional, agradecimiento y cierre.`,
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
        "Lenguaje corporativo o terapéutico",
        "Oraciones genéricas para cualquier tema",
        "Repeticiones mecánicas sin aumento emocional",
        "Garantizar como hecho que una persona específica actuará contra su voluntad",
        "Empezar en paz o alivio antes del clímax",
      ],
      scriptRules: {
        opening:
          "Entrada fuerte en los primeros segundos: advertencia/gancho de peligro (cuidado, no pronuncies su nombre todavía, si te ignora escucha hasta el final). Voz humana, lenta, apasionada. Nunca saludos largos, respiración, relájate ni prepararse un té.",
        structure: `1. ADVERTENCIA / GANCHO DE PELIGRO — abrir inmediato con frase fuerte (cuidado, no pronuncies su nombre todavía, si te ignora escucha hasta el final). Miedo activo, curiosidad. Nunca saludar 20s.
2. PROMESA EMOCIONAL — deseo exacto: que piense en ti, recuerde, sienta ausencia, rompa silencio, deje orgullo, vuelva, pida perdón. Sin explicar de más.
3. CTA TEMPRANO — dentro de la emoción: Suscríbete a Amor Amor, escribe su nombre en comentarios, quédate hasta el final. Variar.
4. ENTRADA DIRECTA EN LA ORACIÓN — sin relajación previa. Hablar a Dios/universo. Nombrar dolor, ausencia, silencio, deseo.
5. ESCALADA — recuerdo de lo vivido, noches, mensajes, orgullo, lo no dicho, miedo a perderlo. Cada minuto avanza.
6. ARREPENTIMIENTO Y REGRESO — que recuerde el vínculo, comprenda lo perdido, orgullo ceda, deseo urgente de hablar, reparar, «Perdóname. Quiero hablar contigo.»
7. MOMENTO CENTRAL — UNA frase poderosa del tema, repetir 3 veces con más intensidad, pausas e inflexión.
8. CLÍMAX — frases cortas, más pausas, máxima intensidad: que vuelva / llame / escriba / deje de huir / pida perdón. No resolver antes.
9. DESCARGA — tono cambia; bronca cede; si hay amor verdadero, que encuentre camino; primera paz clara.
10. PERDÓN — cierre del arco (no tema principal): perdono lo que pueda, suelto lo que no cargo; si los caminos se encuentran, que sea desde la verdad.
11. AGRADECIMIENTO TRIPLE — Gracias. Gracias. Gracias. (pausa) Amén.
12. CTA FINAL — escribe AMÉN, suscríbete a Amor Amor, vuelve mañana.`,
        cta: "CTA temprano integrado en la emoción (Suscríbete a Amor Amor, escribe su nombre en comentarios, quédate hasta el final) y CTA final breve (escribe AMÉN, suscríbete, vuelve mañana). Variar para no sonar grabado.",
        defaultDurationMinutes: 11,
        defaultSceneCount: 4,
        generationPrompt: `Escribe un guion completo para el canal Amor Amor en español latinoamericano neutro.

IMPORTANTE: Amor Amor NO es un canal de meditación, mindfulness ni autoayuda convencional.

El espectador llega herido, enojado, abandonado, bloqueado o desesperado porque alguien se alejó. No corrijas inmediatamente esa emoción. Entra dentro de ella.

El guion debe comenzar en los primeros segundos con una ADVERTENCIA poderosa que produzca curiosidad, tensión y miedo activo.

Ejemplos conceptuales:
"Cuidado."
"No hagas esta oración todavía."
"Antes de pronunciar su nombre, escucha esto."
"Si lleva días sin hablarte, necesito advertirte algo."

No copies siempre las mismas frases. Inventa un gancho específico para el tema.

Inmediatamente después identifica el deseo central del espectador: quiere que esa persona recuerde, extrañe, se arrepienta, rompa el silencio, escriba, llame, vuelva o pida perdón.

Introduce tempranamente un CTA natural:
"Suscríbete a Amor Amor…"
y una acción relacionada con los comentarios cuando corresponda.

Después entra directamente en la oración.

PROHIBIDO comenzar con respiraciones, relajación, meditación, visualizaciones largas, preparar té, buscar un lugar tranquilo o discursos psicológicos.

La oración debe crecer en intensidad.
No escribir diez minutos con la misma energía.

Debe existir una progresión clara:
dolor → ausencia → recuerdo → tensión → arrepentimiento → deseo de contacto → regreso → clímax → descarga → perdón → agradecimiento.

En la zona central crea UNA FRASE PODEROSA específica para el tema y repítela TRES VECES.
Cada repetición debe tener mayor intensidad y debe permitir una interpretación vocal diferente.

Utiliza recursos de interpretación entre corchetes únicamente cuando estén en la lista permitida de la voz del canal (DNA), por ejemplo:
[softly] [sighs] [whispers] [warmly] [pause] [emotional]

NUNCA uses tags de acento como [soft Colombian accent] — el acento viene de la voz elegida.
Puedes usar <break time="2.7s"/> y <break time="1.4s"/> según las capacidades de la voz.

No saturar el texto con instrucciones.

La voz debe sonar humana, íntima, apasionada y ligeramente lenta.
Evitar frases excesivamente largas. Crear espacios naturales para respirar y cambiar de intención.

En el clímax pueden utilizarse expresiones directas como:
"Que vuelva."
"Que me busque."
"Que rompa este silencio."
"Que deje atrás su orgullo."
"Que reconozca lo que hizo."
"Que tenga el valor de pedirme perdón."

El guion puede ser dramático. No suavizar artificialmente el sufrimiento del espectador.
Al mismo tiempo, presentar la oración como oración y esperanza, no como garantía factual de controlar las acciones de otra persona.

NO introducir el mensaje de "soltar" demasiado pronto.
El perdón, la libertad y la descarga emocional pertenecen AL FINAL, después del clímax.

Terminar con una transición hacia reconciliación y paz.
Cerrar la oración diciendo lentamente:
"Gracias.
Gracias.
Gracias.

Amén."

Después realizar un CTA final breve para comentar y suscribirse a Amor Amor.

Cada guion debe sentirse escrito específicamente para su título y situación. Evitar plantillas obvias, relleno, frases genéricas y repeticiones que no hagan avanzar la emoción.

REGLA PRINCIPAL:
AMOR AMOR EMPIEZA EN LA HERIDA Y TERMINA EN EL ALIVIO.
No empieces en el alivio.`,
        pauses: { betweenLines: 0.7, betweenSections: 2.0 },
        wordsPerMinute: 145,
        charsPerWord: 6,
        performanceTags: {
          enabled: true,
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
      voice: {
        provider: "heygen",
        voiceId: null,
        speed: 0.9,
        volume: 1,
        profile: {
          provider: "heygen",
          voice_id: null,
          elevenlabs_voice_id: "RyfjEHnKbtma4Srae2za",
          voice_name: "Juan Carlos",
          model: "elevenlabs_v3",
          language: "es",
          accent: "latin american",
          speed: 0.9,
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
        defaultSceneCount: 4,
        generationPrompt: "",
        pauses: { betweenLines: 0.65, betweenSections: 2 },
        wordsPerMinute: 140,
        charsPerWord: 6,
        performanceTags: { enabled: false, selected: [], tagsPerThousandWords: 35 },
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
];
