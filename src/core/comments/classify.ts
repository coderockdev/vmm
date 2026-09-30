import type { CommentCategory } from "./types";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const SAFETY_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\b(mat(ar|o|arte)|suicid|autoles|me quiero morir|cortarme)\b/i, reason: "self_harm" },
  { re: /\b(idiota|imbecil|estupido|pendejo|hijo de puta|mierda|carajo|put[ao]|basura humana)\b/i, reason: "insult" },
  { re: /\b(amenaza|te voy a|te mato|denuncia|estafa|ladron)\b/i, reason: "threat_accusation" },
  { re: /https?:\/\/|www\.|\bbit\.ly\b|\bt\.co\b/i, reason: "link" },
  { re: /\b(paypal|western union|bitcoin|crypto|transferi|envia dinero|prestamo|inversion)\b/i, reason: "money" },
  { re: /\b(medico|diagnostico|pastilla|medicamento|cirugia|tratamiento|doctor)\b/i, reason: "medical" },
  { re: /\b(sexo|porno|nude|nudes|xxx|onlyfans)\b/i, reason: "sexual" },
  { re: /\b(niñ[oa]|menor de edad|mi hija tiene \d|mi hijo tiene \d)\b/i, reason: "minor_sensitive" },
];

const CATEGORY_RULES: Array<{ category: CommentCategory; patterns: RegExp[] }> = [
  {
    category: "AMEN",
    patterns: [/\bamen\b/, /\basi sea\b/, /\basí sea\b/, /🙏/],
  },
  {
    category: "THANKS",
    patterns: [/\bgracias\b/, /\bmuchas gracias\b/, /\bgracias por\b/],
  },
  {
    category: "BLESSINGS",
    patterns: [/\bbendicion(es)?\b/, /\bdios (los|te|nos) bendiga\b/, /\bbendiciones\b/],
  },
  {
    category: "TESTIMONIAL",
    patterns: [
      /\bvolvi[oó]\b/,
      /\bme escribi[oó]\b/,
      /\bme llam[oó]\b/,
      /\bfuncion[oó]\b/,
      /\bregres[oó]\b/,
      /\bvolvimos\b/,
      /\bme busc[oó]\b/,
    ],
  },
  {
    category: "PRAYER_REQUEST",
    patterns: [
      /\boren por\b/,
      /\bore por\b/,
      /\breza(n)? por\b/,
      /\bpido oracion\b/,
      /\bpido oración\b/,
      /\bayudame con\b/,
      /\bayúdame con\b/,
      /\bnecesito oracion\b/,
    ],
  },
  {
    category: "SAD_WAITING",
    patterns: [
      /\bestoy esperando\b/,
      /\bno me habla\b/,
      /\bestoy triste\b/,
      /\blo extra[nñ]o\b/,
      /\bla extra[nñ]o\b/,
      /\bno vuelve\b/,
      /\bsin noticias\b/,
    ],
  },
];

/** Very short comments that look like names only (2–4 tokens, letters). */
function looksLikeNamesOnly(normalized: string, original: string): boolean {
  const cleaned = original.replace(/[🙏❤️✨💕🕊️🔥]+/g, "").trim();
  if (cleaned.length < 2 || cleaned.length > 40) return false;
  const words = normalized.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 4) return false;
  if (CATEGORY_RULES.some((r) => r.patterns.some((p) => p.test(normalized) || p.test(original)))) {
    return false;
  }
  // Mostly letters / spaces — no question marks, no long sentences
  if (/[?¿!]/.test(original)) return false;
  return /^[\p{L}\s.'-]+$/u.test(cleaned);
}

export type ClassifyResult = {
  category: CommentCategory;
  needsReview: boolean;
  reviewReason: string | null;
  confidence: "high" | "medium" | "low";
};

export function classifyComment(text: string): ClassifyResult {
  const original = text.trim();
  const normalized = normalize(original);

  if (!normalized) {
    return {
      category: "REVIEW_REQUIRED",
      needsReview: true,
      reviewReason: "empty",
      confidence: "low",
    };
  }

  if (original.length > 400) {
    return {
      category: "REVIEW_REQUIRED",
      needsReview: true,
      reviewReason: "too_long",
      confidence: "low",
    };
  }

  for (const s of SAFETY_PATTERNS) {
    if (s.re.test(original) || s.re.test(normalized)) {
      return {
        category: "REVIEW_REQUIRED",
        needsReview: true,
        reviewReason: s.reason,
        confidence: "high",
      };
    }
  }

  // Complex questions → review
  if (/[?¿]/.test(original) && original.length > 60) {
    return {
      category: "REVIEW_REQUIRED",
      needsReview: true,
      reviewReason: "complex_question",
      confidence: "medium",
    };
  }

  for (const rule of CATEGORY_RULES) {
    for (const p of rule.patterns) {
      if (p.test(normalized) || p.test(original)) {
        return {
          category: rule.category,
          needsReview: false,
          reviewReason: null,
          confidence: "high",
        };
      }
    }
  }

  if (looksLikeNamesOnly(normalized, original)) {
    return {
      category: "NAMES_ONLY",
      needsReview: false,
      reviewReason: null,
      confidence: "medium",
    };
  }

  // Short friendly / unclear → generic with medium confidence; very opaque → review
  if (normalized.length <= 8 && !/\b(amor|paz|fe|dios|oracion|oración)\b/.test(normalized)) {
    return {
      category: "REVIEW_REQUIRED",
      needsReview: true,
      reviewReason: "uncertain",
      confidence: "low",
    };
  }

  return {
    category: "GENERIC",
    needsReview: false,
    reviewReason: null,
    confidence: "medium",
  };
}
