/** Strip voice / performance tags like [softly], [pause] — never show on video. */
export function stripVoiceTags(text: string): string {
  return text
    .replace(/\[[^\]]{0,120}\]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
