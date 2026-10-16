export interface GlossaryTerm {
  id: string;
  name: string;
  body: string;
}

// lowercase and strip accents so "orcamento" finds "Orçamento" and "dependencia" finds "dependência"
function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// TERMS MATCHING EVERY WORD OF THE QUERY (name or body, accent- and case-insensitive); name hits first
export function filterGlossary<T extends GlossaryTerm>(terms: readonly T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...terms];
  const scored: Array<{ term: T; inName: boolean }> = [];
  for (const term of terms) {
    const name = fold(term.name);
    const haystack = `${name} ${fold(term.body)}`;
    if (words.every((w) => haystack.includes(w))) scored.push({ term, inName: words.every((w) => name.includes(w)) });
  }
  return scored.sort((a, b) => Number(b.inName) - Number(a.inName)).map((s) => s.term);
}
