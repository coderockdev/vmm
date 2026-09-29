/**
 * Preferred production order for Júlio Verne audiobooks.
 * Titles matched loosely (case-insensitive, accents ignored).
 * Remaining works follow package number order.
 */
export const PREFERRED_PRODUCTION_TITLES: string[] = [
  "Viagem ao Centro da Terra",
  "Vinte Mil Léguas Submarinas",
  "A Volta ao Mundo em Oitenta Dias",
  "Da Terra à Lua",
  "À Roda da Lua",
  "Cinco Semanas de Balão",
  "A Ilha Misteriosa",
  "Miguel Strogoff",
  "Os Filhos do Capitão Grant",
];

function normalizeTitle(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Assign orderIndex (0-based) for each book title.
 * Preferred titles first (in listed order), then the rest by package number.
 */
export function assignProductionOrder(
  books: Array<{ title: string; number: number }>
): Map<string, number> {
  const preferredNorm = PREFERRED_PRODUCTION_TITLES.map(normalizeTitle);
  const preferredRank = new Map(preferredNorm.map((t, i) => [t, i]));

  const sorted = [...books].sort((a, b) => {
    const ra = preferredRank.get(normalizeTitle(a.title));
    const rb = preferredRank.get(normalizeTitle(b.title));
    const aPref = ra !== undefined;
    const bPref = rb !== undefined;
    if (aPref && bPref) return (ra as number) - (rb as number);
    if (aPref) return -1;
    if (bPref) return 1;
    return a.number - b.number;
  });

  const out = new Map<string, number>();
  sorted.forEach((b, i) => out.set(b.title, i));
  return out;
}
