import { describe, expect, it } from "vitest";
import { evolutionEn } from "../../i18n/evolution";
import { evolutionPt } from "../../i18n/locales/pt-BR/evolution";
import { filterGlossary } from "./glossaryFilter";

const terms = [
  { id: "a", name: "Orçamento de Erro", body: "Indisponibilidade permitida pelo SLO" },
  { id: "b", name: "Circuit Breaker", body: "Para de chamar uma dependência com falha" },
  { id: "c", name: "SLA", body: "Promessa de disponibilidade; o orçamento depende do SLO" },
];

describe("filterGlossary", () => {
  it("returns everything for an empty query", () => {
    expect(filterGlossary(terms, "  ")).toHaveLength(3);
  });

  it("ignores accents and case, and matches every word", () => {
    expect(filterGlossary(terms, "ORCAMENTO").map((t) => t.id)).toEqual(["a", "c"]);
    expect(filterGlossary(terms, "dependencia falha").map((t) => t.id)).toEqual(["b"]);
    expect(filterGlossary(terms, "zzz")).toEqual([]);
  });

  it("ranks name matches before body matches", () => {
    expect(filterGlossary(terms, "orcamento")[0].id).toBe("a");
  });
});

describe("glossary copy", () => {
  it("defines the same terms, in the same order, in every locale", () => {
    expect(evolutionPt.glossary.terms.map((t) => t.id)).toEqual(evolutionEn.glossary.terms.map((t) => t.id));
  });

  it("covers the terms the brief asks for", () => {
    const ids = evolutionEn.glossary.terms.map((t) => t.id);
    for (const id of ["mtta", "mttr", "sla", "slo", "errorBudget", "circuitBreaker", "blueGreen", "rateLimiting", "sox"]) {
      expect(ids).toContain(id);
    }
  });
});
