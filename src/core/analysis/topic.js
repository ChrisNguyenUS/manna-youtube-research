// "Is this video actually about the keyword?" — accent-, case- and space-insensitive substring match.
/** @param {string} s */
export const foldForMatch = (s) =>
  String(s || '').replace(/đ/gi, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** @param {string} text @param {string[]} keywords */
export function keywordInText(text, keywords) {
  const hay = foldForMatch(text);
  return keywords.some((k) => {
    const needle = foldForMatch(k);
    return needle !== '' && hay.includes(needle);
  });
}
