// Translates the finite pools of dynamic, backend-generated flavor text (incident titles/root
// causes, CAB dilemma copy, synthetic log lines) into the selected language, without touching the
// backend contract or its economic/engine rules -- those pools are plain English strings coming
// straight off the wire (see backend/app/engine/event_generator.py, dilemmas.py, log_generator.py).
//
// Every lookup falls back to the original string when it doesn't recognize it (the backend pool
// changed, or a scenario introduces new content, or the language's table is not loaded), so this can
// never crash or blank out real data. Established technical acronyms/identifiers inside a translated
// line (SLA, TLS, DNS, OOM, mTLS, HTTP verbs, SQL, stack traces, service ids) are intentionally left
// as-is; pure HTTP-log lines ("GET /api/v1/health 200 12ms") have no prose and are not in any table.
//
// English is the wire language, so it needs no table: the pt-BR and es tables live in their own lazy
// modules (locales/<lang>/dynamic.ts) and are registered by loadLanguage.

import { Language } from "./language";
import { DilemmaOffer } from "../types/game";

// matched against the raw english title; the captured service name is substituted back into the
// translated template ({service}). Order matters only for readability: the patterns are disjoint.
export type TitleTemplateKey = "disruption" | "errorRate" | "latency" | "availability";

const TITLE_PATTERNS: { key: TitleTemplateKey; pattern: RegExp }[] = [
  { key: "disruption", pattern: /^Service disruption detected on (.+)$/ },
  { key: "errorRate", pattern: /^Elevated error rate on (.+)$/ },
  { key: "latency", pattern: /^Latency spike breaching SLO on (.+)$/ },
  { key: "availability", pattern: /^Availability drop on (.+)$/ },
];

// one non-english language worth of dynamic copy; every table is keyed by the english wire string
// (or the stable backend id where the wire has one)
export interface DynamicLocale {
  titleTemplates: Record<TitleTemplateKey, string>;
  // event_generator.ROOT_CAUSE_POOL
  rootCauses: Record<string, string>;
  // dilemmas.DILEMMA_POOL, keyed by the stable english title (the payload has no dilemma_key)
  dilemmas: Record<string, { title: string; narrative: string; choices: Record<string, string> }>;
  // log_generator lines
  logLines: Record<string, string>;
  // scenario objectives by stable backend id
  objectives: Record<string, string>;
  // operator ranks by rank_key or raw english name
  ranks: Record<string, string>;
  // recommended next challenges by challenge_key or english title
  challenges: Record<string, { title: string; description: string }>;
  difficulty: Record<string, string>;
  outcomes: Record<string, string>;
  // title for an achievement-type challenge with no curated copy; {name} is the achievement name
  chaseAchievement: string;
}

const registry: Partial<Record<Language, DynamicLocale>> = {};

export function registerDynamicLocale(language: Language, data: DynamicLocale): void {
  registry[language] = data;
}

// the table for a non-english language, or undefined (english, or not loaded yet)
function tableFor(language: Language): DynamicLocale | undefined {
  return language === "en" ? undefined : registry[language];
}

export function translateIncidentTitle(rawTitle: string, language: Language): string {
  const table = tableFor(language);
  if (!table) return rawTitle;
  for (const tpl of TITLE_PATTERNS) {
    const match = rawTitle.match(tpl.pattern);
    if (match) return table.titleTemplates[tpl.key].replace("{service}", match[1]);
  }
  return rawTitle;
}

export function translateRootCause(rawText: string, language: Language): string {
  return tableFor(language)?.rootCauses[rawText] ?? rawText;
}

export function translateLogLine(message: string, language: Language): string {
  return tableFor(language)?.logLines[message] ?? message;
}

export function translateDilemma(dilemma: DilemmaOffer, language: Language): DilemmaOffer {
  const copy = tableFor(language)?.dilemmas[dilemma.title];
  if (!copy) return dilemma;
  return {
    ...dilemma,
    title: copy.title,
    narrative: copy.narrative,
    choices: dilemma.choices.map((choice) => ({
      ...choice,
      label: copy.choices[choice.id] ?? choice.label,
    })),
  };
}

export function translateObjective(id: string, fallbackDesc: string, language: Language): string {
  return tableFor(language)?.objectives[id] ?? fallbackDesc;
}

export function translateOperatorRank(
  rankKey: string | undefined,
  rawRank: string | undefined,
  language: Language
): string {
  const fallback = rawRank || "Junior On-Call Engineer";
  const ranks = tableFor(language)?.ranks;
  if (!ranks) return fallback;
  const key = rankKey || rawRank || "";
  return ranks[key] ?? (rawRank ? ranks[rawRank] : undefined) ?? fallback;
}

export function translateNextChallenge(
  challenge: { challenge_key?: string; title: string; description: string; type?: string; target_achievement_name?: string } | undefined,
  language: Language
): { title: string; description: string } {
  if (!challenge) return { title: "", description: "" };
  const table = tableFor(language);
  if (!table) return { title: challenge.title, description: challenge.description };

  const key = challenge.challenge_key || challenge.title;
  const match = table.challenges[key] ?? table.challenges[challenge.title];
  if (match) return { title: match.title, description: match.description };

  if (challenge.type === "achievement" && challenge.target_achievement_name) {
    return {
      title: table.chaseAchievement.replace("{name}", challenge.target_achievement_name),
      description: challenge.description,
    };
  }

  return { title: challenge.title, description: challenge.description };
}

export function translateDifficulty(difficulty: string, language: Language): string {
  return tableFor(language)?.difficulty[difficulty.toLowerCase()] ?? difficulty.toUpperCase();
}

export function translateOutcome(outcome: string, language: Language): string {
  return tableFor(language)?.outcomes[outcome.toLowerCase()] ?? outcome.toUpperCase();
}
