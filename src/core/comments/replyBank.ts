import type { CommentCategory } from "./types";

export const AMOR_AMOR_REPLY_BANK: Record<
  Exclude<CommentCategory, "REVIEW_REQUIRED" | "NO_REPLY">,
  string[]
> = {
  AMEN: [
    "Amén 🙏 Gracias por acompañarnos. Bendiciones ❤️",
    "Amén ❤️ Que llegue mucha paz a tu vida.",
    "Amén 🙏 Seguimos juntos en oración.",
    "Que así sea 🙏 Gracias por estar aquí ❤️",
    "Amén ❤️ Gracias por acompañar a Amor Amor.",
  ],
  THANKS: [
    "Gracias a ti por acompañarnos ❤️ Bendiciones 🙏",
    "Muchas gracias por estar aquí 🙏",
    "Gracias por compartir este momento con nosotros ❤️",
    "Gracias por acompañarnos una vez más 🙏❤️",
  ],
  BLESSINGS: [
    "Bendiciones para ti también 🙏❤️",
    "Muchas bendiciones y mucha paz para ti ❤️",
    "Gracias 🙏 Que tengas un día lleno de paz.",
  ],
  TESTIMONIAL: [
    "Qué alegría leer esto ❤️ Gracias por volver a contárnoslo. Bendiciones 🙏",
    "Gracias por compartirlo con nosotros ❤️ Nos alegra mucho leerte.",
    "Qué lindo recibir tu mensaje 🙏 Gracias por compartir tu experiencia.",
  ],
  PRAYER_REQUEST: [
    "Te acompañamos en oración 🙏 Que encuentres paz y claridad ❤️",
    "Gracias por compartirlo 🙏 Te acompañamos con mucho cariño.",
    "Que encuentres fuerza, paz y claridad en este momento 🙏❤️",
  ],
  SAD_WAITING: [
    "Te mandamos mucha fuerza y paz 🙏 Gracias por estar aquí ❤️",
    "Gracias por compartir lo que estás viviendo ❤️ Que encuentres mucha paz.",
    "Te acompañamos desde aquí 🙏 Mucha fuerza y serenidad.",
  ],
  NAMES_ONLY: [
    "Amén 🙏 Que todo encuentre su camino desde el amor y la paz ❤️",
    "Que así sea 🙏 Mucha paz y bendiciones ❤️",
  ],
  GENERIC: [
    "Gracias por tu comentario 🙏 Nos vemos en la próxima oración ❤️",
    "Gracias por acompañarnos ❤️ Seguimos juntos en oración.",
    "Qué lindo tenerte aquí 🙏 Nos encontramos en la próxima oración.",
    "Gracias por ser parte de Amor Amor ❤️ Bendiciones.",
    "Muchas gracias por acompañar el canal 🙏❤️",
  ],
};

/** Per-channel last reply text to avoid consecutive repeats. */
const lastReplyByChannel = new Map<string, string>();

export function pickReplyText(args: {
  channelId: string;
  category: CommentCategory;
  customSets?: Partial<Record<CommentCategory, string[]>>;
  vary?: boolean;
}): string | null {
  if (args.category === "REVIEW_REQUIRED" || args.category === "NO_REPLY") return null;
  const bank =
    args.customSets?.[args.category]?.length
      ? args.customSets[args.category]!
      : AMOR_AMOR_REPLY_BANK[args.category];
  if (!bank?.length) return null;

  if (!args.vary || bank.length === 1) {
    const text = bank[Math.floor(Math.random() * bank.length)]!;
    lastReplyByChannel.set(args.channelId, text);
    return text;
  }

  const last = lastReplyByChannel.get(args.channelId);
  const pool = last ? bank.filter((t) => t !== last) : bank;
  const text = (pool.length ? pool : bank)[Math.floor(Math.random() * (pool.length || bank.length))!]!;
  lastReplyByChannel.set(args.channelId, text);
  return text;
}

export function youtubeCommentUrl(videoId: string, commentId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&lc=${encodeURIComponent(commentId)}`;
}
