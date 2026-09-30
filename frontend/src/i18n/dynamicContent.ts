// Translates the finite pools of dynamic, backend-generated flavor text (incident titles/root
// causes, CAB dilemma copy, synthetic log lines) into the selected language, without touching the
// backend contract or its economic/engine rules -- those pools are plain English strings coming
// straight off the wire (see backend/app/engine/event_generator.py, dilemmas.py, log_generator.py).
//
// Every lookup falls back to the original string when it doesn't recognize it (the backend pool
// changed, or a scenario introduces new content), so this can never crash or blank out real data.
// Established technical acronyms/identifiers inside a translated line (SLA, TLS, DNS, OOM, mTLS,
// HTTP verbs, SQL, stack traces, service ids) are intentionally left as-is.

import { Language } from "./language";
import { DilemmaOffer } from "../types/game";

interface LocalizedPair {
  "pt-BR": string;
  es: string;
}

function pick(pair: LocalizedPair | undefined, language: Language, fallback: string): string {
  if (!pair || language === "en") return fallback;
  return pair[language] ?? fallback;
}

// ---- incident root causes (event_generator.ROOT_CAUSE_POOL) ----
const ROOT_CAUSE_I18N: Record<string, LocalizedPair> = {
  "Memory leak in connection pooling thread": {
    "pt-BR": "Vazamento de memória na thread de pool de conexões",
    es: "Fuga de memoria en el hilo del pool de conexiones",
  },
  "OOM killer invoked by kernel": {
    "pt-BR": "OOM killer acionado pelo kernel",
    es: "OOM killer invocado por el kernel",
  },
  "Cascading deadlock under unindexed query storm": {
    "pt-BR": "Deadlock em cascata sob tempestade de consultas sem índice",
    es: "Interbloqueo en cascada bajo una tormenta de consultas sin índice",
  },
  "TLS certificate expiration across cluster pods": {
    "pt-BR": "Expiração de certificado TLS nos pods do cluster",
    es: "Expiración de certificado TLS en los pods del clúster",
  },
  "Corrupted Redis cache serialization payload": {
    "pt-BR": "Payload de serialização do cache Redis corrompido",
    es: "Payload de serialización del caché Redis corrupto",
  },
  "Unbounded goroutine leak under retry storm": {
    "pt-BR": "Vazamento ilimitado de goroutines sob tempestade de retries",
    es: "Fuga ilimitada de goroutines bajo una tormenta de reintentos",
  },
  "DNS resolver cache poisoning on service mesh sidecar": {
    "pt-BR": "Envenenamento do cache do resolvedor DNS no sidecar do service mesh",
    es: "Envenenamiento de caché del resolutor DNS en el sidecar del service mesh",
  },
  "Disk I/O saturation from runaway log rotation": {
    "pt-BR": "Saturação de I/O de disco por rotação de logs descontrolada",
    es: "Saturación de I/O de disco por rotación de logs descontrolada",
  },
};

// ---- incident title templates (event_generator.INCIDENT_TITLE_TEMPLATES) ----
// {service} keeps the original, untranslated service_name substituted back in
const INCIDENT_TITLE_TEMPLATE_I18N: { pattern: RegExp; "pt-BR": string; es: string }[] = [
  {
    pattern: /^Service disruption detected on (.+)$/,
    "pt-BR": "Interrupção de serviço detectada em {service}",
    es: "Interrupción de servicio detectada en {service}",
  },
  {
    pattern: /^Elevated error rate on (.+)$/,
    "pt-BR": "Taxa de erro elevada em {service}",
    es: "Tasa de error elevada en {service}",
  },
  {
    pattern: /^Latency spike breaching SLO on (.+)$/,
    "pt-BR": "Pico de latência violando o SLO em {service}",
    es: "Pico de latencia que incumple el SLO en {service}",
  },
  {
    pattern: /^Availability drop on (.+)$/,
    "pt-BR": "Queda de disponibilidade em {service}",
    es: "Caída de disponibilidad en {service}",
  },
];

// ---- CAB dilemmas (dilemmas.DILEMMA_POOL) ----
// keyed by the (stable, unique) English title -- the wire payload has no stable dilemma_key
interface DilemmaCopy {
  title: LocalizedPair;
  narrative: LocalizedPair;
  choices: Record<string, LocalizedPair>;
}

const DILEMMA_I18N: Record<string, DilemmaCopy> = {
  "Vendor Lock-In Discount Offer": {
    title: {
      "pt-BR": "Oferta de Desconto com Fidelização de Fornecedor",
      es: "Oferta de Descuento con Exclusividad de Proveedor",
    },
    narrative: {
      "pt-BR":
        "Um provedor de nuvem oferece 15% de desconto na infraestrutura em troca de um compromisso de exclusividade de 12 meses, pulando a revisão de arquitetura padrão.",
      es: "Un proveedor de nube ofrece un 15% de descuento en infraestructura a cambio de un compromiso de exclusividad de 12 meses, saltándose la revisión de arquitectura estándar.",
    },
    choices: {
      accept: { "pt-BR": "Aceitar o desconto", es: "Aceptar el descuento" },
      decline: { "pt-BR": "Recusar, escalar para revisão completa do CAB", es: "Rechazar, escalar a revisión completa del CAB" },
    },
  },
  "Compressed Release Timeline": {
    title: { "pt-BR": "Cronograma de Lançamento Comprimido", es: "Cronograma de Lanzamiento Comprimido" },
    narrative: {
      "pt-BR":
        "A liderança de produto pede para pular o ciclo completo de testes de carga para cumprir um prazo externo de lançamento.",
      es: "El liderazgo de producto pide saltarse el ciclo completo de pruebas de carga para cumplir una fecha límite externa de lanzamiento.",
    },
    choices: {
      skip: { "pt-BR": "Pular os testes de carga, lançar no prazo", es: "Saltarse las pruebas de carga, lanzar a tiempo" },
      delay: {
        "pt-BR": "Atrasar o lançamento, rodar a suíte completa de testes",
        es: "Retrasar el lanzamiento, ejecutar la suite completa de pruebas",
      },
    },
  },
  "Unpaid Overtime Push": {
    title: { "pt-BR": "Mutirão de Hora Extra Não Remunerada", es: "Jornada de Horas Extra No Remuneradas" },
    narrative: {
      "pt-BR":
        "Um diretor propõe um mutirão de plantão não remunerado no fim de semana para reduzir um backlog de tickets de baixa prioridade antes da revisão do conselho.",
      es: "Un director propone una jornada de guardia no remunerada el fin de semana para reducir un backlog de tickets de baja prioridad antes de la revisión de la junta.",
    },
    choices: {
      push: { "pt-BR": "Aprovar o mutirão de hora extra", es: "Aprobar la jornada de horas extra" },
      refuse: {
        "pt-BR": "Recusar, agendar como trabalho de sprint remunerado",
        es: "Rechazar, programarlo como trabajo de sprint remunerado",
      },
    },
  },
  "Third-Party Security Audit Waiver": {
    title: { "pt-BR": "Dispensa de Auditoria de Segurança de Terceiros", es: "Exención de Auditoría de Seguridad de Terceros" },
    narrative: {
      "pt-BR":
        "O jurídico propõe dispensar o teste de penetração trimestral obrigatório de terceiros para economizar orçamento, citando um histórico impecável.",
      es: "Legal propone eximir la prueba de penetración trimestral obligatoria de terceros para ahorrar presupuesto, citando un historial impecable.",
    },
    choices: {
      waive: { "pt-BR": "Dispensar a auditoria", es: "Eximir la auditoría" },
      proceed: { "pt-BR": "Seguir com a auditoria como planejado", es: "Proceder con la auditoría según lo programado" },
    },
  },
  "Board Intervention: Governance Probation": {
    title: {
      "pt-BR": "Intervenção do Conselho: Período de Prova de Governança",
      es: "Intervención de la Junta: Período de Prueba de Gobernanza",
    },
    narrative: {
      "pt-BR":
        "Uma sequência de decisões de corte de custos chegou ao conselho. Eles oferecem verba emergencial de remediação, mas exigem uma reforma pública de governança.",
      es: "Una serie de decisiones de recorte de costos ha llegado a la junta. Ofrecen financiamiento de remediación de emergencia, pero exigen una reforma pública de gobernanza.",
    },
    choices: {
      accept_probation: { "pt-BR": "Aceitar a verba e a supervisão", es: "Aceptar el financiamiento y la supervisión" },
      reject_probation: { "pt-BR": "Recusar, permanecer independente", es: "Rechazarlo, permanecer independiente" },
    },
  },
  "Executive Track Promotion Offer": {
    title: { "pt-BR": "Oferta de Promoção para Carreira Executiva", es: "Oferta de Promoción a Carrera Ejecutiva" },
    narrative: {
      "pt-BR":
        "A disciplina de governança sustentada chamou a atenção do CEO. É oferecida uma promoção para um cargo de plataforma multi-organizacional, com sua respectiva autoridade orçamentária.",
      es: "La disciplina de gobernanza sostenida ha llamado la atención del CEO. Se ofrece una promoción a un rol de plataforma multi-organizacional, junto con su autoridad presupuestaria.",
    },
    choices: {
      accept_promotion: { "pt-BR": "Aceitar o mandato ampliado", es: "Aceptar el mandato ampliado" },
      stay_focused: { "pt-BR": "Manter o foco na plataforma atual", es: "Mantenerse enfocado en la plataforma actual" },
    },
  },
};

// ---- synthetic log lines (log_generator INFO/WARN/ERROR/FATAL pools) ----
const LOG_LINE_I18N: Record<string, LocalizedPair> = {
  "cache hit ratio 0.94 over last 60s window": {
    "pt-BR": "taxa de acerto de cache 0.94 na janela dos últimos 60s",
    es: "tasa de aciertos de caché 0.94 en la ventana de los últimos 60s",
  },
  "healthcheck probe succeeded, latency 8ms": {
    "pt-BR": "sonda de healthcheck bem-sucedida, latência de 8ms",
    es: "sonda de healthcheck exitosa, latencia de 8ms",
  },
  "GC pause completed in 4ms, heap 62% utilized": {
    "pt-BR": "pausa de GC concluída em 4ms, heap utilizado em 62%",
    es: "pausa de GC completada en 4ms, heap utilizado al 62%",
  },
  "connection pool utilization at 82%, approaching configured limit": {
    "pt-BR": "utilização do pool de conexões em 82%, aproximando-se do limite configurado",
    es: "utilización del pool de conexiones al 82%, acercándose al límite configurado",
  },
  "retry attempt 2/3 for downstream call to payment-core": {
    "pt-BR": "tentativa de retry 2/3 para chamada downstream ao payment-core",
    es: "intento de reintento 2/3 para llamada downstream a payment-core",
  },
  "slow query detected: SELECT * FROM orders WHERE status=? took 420ms": {
    "pt-BR": "consulta lenta detectada: SELECT * FROM orders WHERE status=? levou 420ms",
    es: "consulta lenta detectada: SELECT * FROM orders WHERE status=? tardó 420ms",
  },
  "thread pool queue depth rising: 340 pending tasks": {
    "pt-BR": "profundidade da fila do thread pool subindo: 340 tarefas pendentes",
    es: "profundidad de la cola del thread pool en aumento: 340 tareas pendientes",
  },
  "certificate expires in 9 days for internal mTLS endpoint": {
    "pt-BR": "certificado expira em 9 dias para o endpoint mTLS interno",
    es: "el certificado expira en 9 días para el endpoint mTLS interno",
  },
  "connection pool timeout: no available connection after 5000ms": {
    "pt-BR": "timeout do pool de conexões: nenhuma conexão disponível após 5000ms",
    es: "timeout del pool de conexiones: sin conexión disponible después de 5000ms",
  },
  "deadlock detected: transaction 4471 rolled back by database engine": {
    "pt-BR": "deadlock detectado: transação 4471 revertida pelo motor do banco de dados",
    es: "interbloqueo detectado: transacción 4471 revertida por el motor de la base de datos",
  },
  "unhandled exception in request handler: NullReferenceException at OrderProcessor.charge()": {
    "pt-BR": "exceção não tratada no handler da requisição: NullReferenceException em OrderProcessor.charge()",
    es: "excepción no controlada en el handler de la solicitud: NullReferenceException en OrderProcessor.charge()",
  },
  "downstream call to auth-service failed: 503 Service Unavailable": {
    "pt-BR": "chamada downstream ao auth-service falhou: 503 Service Unavailable",
    es: "llamada downstream a auth-service falló: 503 Service Unavailable",
  },
  "serialization error: unexpected token in cached payload, falling back to origin": {
    "pt-BR": "erro de serialização: token inesperado no payload em cache, revertendo para a origem",
    es: "error de serialización: token inesperado en el payload cacheado, volviendo al origen",
  },
  "OutOfMemoryError: Java heap space exhausted, killing worker process": {
    "pt-BR": "OutOfMemoryError: heap Java esgotado, encerrando processo worker",
    es: "OutOfMemoryError: heap de Java agotado, terminando el proceso worker",
  },
  "OOM killer invoked by kernel, sacrificed process pid=8842 (worker)": {
    "pt-BR": "OOM killer acionado pelo kernel, processo pid=8842 (worker) sacrificado",
    es: "OOM killer invocado por el kernel, proceso pid=8842 (worker) sacrificado",
  },
  "panic: runtime error: index out of range, goroutine crashed": {
    "pt-BR": "panic: erro em tempo de execução: índice fora do intervalo, goroutine falhou",
    es: "panic: error en tiempo de ejecución: índice fuera de rango, goroutine falló",
  },
  "segmentation fault (core dumped) in native extension module": {
    "pt-BR": "falha de segmentação (core dumped) no módulo de extensão nativo",
    es: "fallo de segmentación (core dumped) en el módulo de extensión nativo",
  },
  // "GET /api/v1/health 200 12ms" and "POST /api/v1/orders 201 84ms" are pure HTTP-log format
  // with no prose to translate -- intentionally omitted, they fall back to themselves unchanged.
};

export function translateIncidentTitle(rawTitle: string, language: Language): string {
  if (language === "en") return rawTitle;
  for (const tpl of INCIDENT_TITLE_TEMPLATE_I18N) {
    const match = rawTitle.match(tpl.pattern);
    if (match) return tpl[language].replace("{service}", match[1]);
  }
  return rawTitle;
}

export function translateRootCause(rawText: string, language: Language): string {
  return pick(ROOT_CAUSE_I18N[rawText], language, rawText);
}

export function translateLogLine(message: string, language: Language): string {
  return pick(LOG_LINE_I18N[message], language, message);
}

export function translateDilemma(dilemma: DilemmaOffer, language: Language): DilemmaOffer {
  if (language === "en") return dilemma;
  const copy = DILEMMA_I18N[dilemma.title];
  if (!copy) return dilemma;
  return {
    ...dilemma,
    title: copy.title[language],
    narrative: copy.narrative[language],
    choices: dilemma.choices.map((choice) => ({
      ...choice,
      label: pick(copy.choices[choice.id], language, choice.label),
    })),
  };
}

// ---- scenario objectives by stable backend ID ----
const SCENARIO_OBJECTIVE_I18N: Record<string, LocalizedPair> = {
  maintain_sla: {
    "pt-BR": "Manter o SLA em 99% ou acima durante o pico",
    es: "Mantener el SLA en 99% o superior durante el pico",
  },
  survive_surge: {
    "pt-BR": "Sobreviver ao pico de tráfego de 48 ticks",
    es: "Sobrevivir al pico de tráfico de 48 ticks",
  },
  protect_master_db: {
    "pt-BR": "Evitar que o srv-db seja comprometido",
    es: "Evitar que srv-db sea comprometido",
  },
  contain_spread: {
    "pt-BR": "Colocar em quarentena todos os serviços comprometidos",
    es: "Poner en cuarentena todos los servicios comprometidos",
  },
  zero_breach_flags: {
    "pt-BR": "Concluir o simulado com zero violações regulatórias",
    es: "Completar el simulacro con cero violaciones regulatorias",
  },
  survive_drill: {
    "pt-BR": "Sobreviver ao simulado de caos",
    es: "Sobrevivir al simulacro de caos",
  },
  stay_above_budget_floor: {
    "pt-BR": "Manter o orçamento acima do limite mínimo",
    es: "Mantener el presupuesto por encima del límite mínimo",
  },
  survive_duration: {
    "pt-BR": "Sobreviver à duração do cenário",
    es: "Sobrevivir a la duración del escenario",
  },
};

export function translateObjective(id: string, fallbackDesc: string, language: Language): string {
  return pick(SCENARIO_OBJECTIVE_I18N[id], language, fallbackDesc);
}

// ---- operational ranks (by rank_key or raw English name) ----
const OPERATOR_RANK_I18N: Record<string, LocalizedPair> = {
  junior_oncall: {
    "pt-BR": "Engenheiro de Plantão Júnior",
    es: "Ingeniero de Guardia Júnior",
  },
  sre: {
    "pt-BR": "Engenheiro de Confiabilidade de Sites (SRE)",
    es: "Ingeniero de Confiabilidad de Sitios (SRE)",
  },
  senior_operator: {
    "pt-BR": "Operador Sênior de Caos",
    es: "Operador Sénior de Caos",
  },
  principal_architect: {
    "pt-BR": "Arquiteto Principal de Infraestrutura",
    es: "Arquitecto Principal de Infraestructura",
  },
  vp_reliability: {
    "pt-BR": "VP de Confiabilidade e Governança",
    es: "VP de Confiabilidad y Gobernanza",
  },
  "Junior On-Call Engineer": {
    "pt-BR": "Engenheiro de Plantão Júnior",
    es: "Ingeniero de Guardia Júnior",
  },
  "Site Reliability Engineer": {
    "pt-BR": "Engenheiro de Confiabilidade de Sites (SRE)",
    es: "Ingeniero de Confiabilidad de Sitios (SRE)",
  },
  "Senior Chaos Operator": {
    "pt-BR": "Operador Sênior de Caos",
    es: "Operador Sénior de Caos",
  },
  "Principal Infrastructure Architect": {
    "pt-BR": "Arquiteto Principal de Infraestrutura",
    es: "Arquitecto Principal de Infraestructura",
  },
  "VP of Reliability & Governance": {
    "pt-BR": "VP de Confiabilidade e Governança",
    es: "VP de Confiabilidad y Gobernanza",
  },
};

export function translateOperatorRank(
  rankKey: string | undefined,
  rawRank: string | undefined,
  language: Language
): string {
  const key = rankKey || rawRank || "";
  const pair = OPERATOR_RANK_I18N[key] || (rawRank ? OPERATOR_RANK_I18N[rawRank] : undefined);
  return pick(pair, language, rawRank || "Junior On-Call Engineer");
}

// ---- recommended next challenges ----
interface ChallengeCopy {
  title: LocalizedPair;
  description: LocalizedPair;
}

const NEXT_CHALLENGE_I18N: Record<string, ChallengeCopy> = {
  first_run: {
    title: {
      "pt-BR": "Primeiro Plantão Operacional",
      es: "Primer Turno Operacional",
    },
    description: {
      "pt-BR": "Inicie sua primeira partida Sandbox na dificuldade Estagiário para aprender a triagem de incidentes em tempo real e a defesa do SLA.",
      es: "Inicia tu primera partida Sandbox en dificultad Pasante para aprender el triaje de incidentes en tiempo real y la defensa del SLA.",
    },
  },
  sandbox_cycle: {
    title: {
      "pt-BR": "Defesa de Auditoria Mensal",
      es: "Defensa de Auditoría Mensual",
    },
    description: {
      "pt-BR": "Sobreviva a um ciclo operacional completo no modo Sandbox na dificuldade Padrão sem violar o orçamento de erro de SLA.",
      es: "Sobrevive a un ciclo operacional completo en modo Sandbox en dificultad Estándar sin agotar el presupuesto de error de SLA.",
    },
  },
  black_friday_rush: {
    title: {
      "pt-BR": "Pico de Tráfego da Black Friday",
      es: "Pico de Tráfico de Black Friday",
    },
    description: {
      "pt-BR": "Sustente 4.0x de carga de tráfego e custo de nuvem acelerado durante a Black Friday Rush.",
      es: "Soporta 4.0x de tráfico y consumo acelerado de nube operativa durante Black Friday Rush.",
    },
  },
  chaos_drill: {
    title: {
      "pt-BR": "Simulado de Engenharia de Caos",
      es: "Simulacro de Ingeniería del Caos",
    },
    description: {
      "pt-BR": "Sobreviva a 40 ticks de quedas aleatórias de pods sem sofrer nenhuma penalidade de conformidade regulatória.",
      es: "Sobrevive a 40 ticks de caídas aleatorias de pods con cero penalizaciones de cumplimiento regulatorio.",
    },
  },
  ransomware_containment: {
    title: {
      "pt-BR": "Contenção de Ransomware",
      es: "Contención de Ransomware",
    },
    description: {
      "pt-BR": "Isole em quarentena o avanço da infecção antes que o banco de dados mestre seja criptografado.",
      es: "Aísla en cuarentena el avance de la infección antes de que la base de datos principal sea cifrada.",
    },
  },
  chaos_mastery: {
    title: {
      "pt-BR": "Domínio da Dificuldade Caos",
      es: "Maestría en Dificultad Caos",
    },
    description: {
      "pt-BR": "Encare a dificuldade Caos (+40% no multiplicador de incidentes e caixa inicial mais apertado).",
      es: "Acepta el desafío en dificultad Caos (+40% multiplicador de incidentes y presupuesto inicial más ajustado).",
    },
  },
  sre_grandmaster: {
    title: {
      "pt-BR": "Grão-Mestre SRE",
      es: "Gran Maestro SRE",
    },
    description: {
      "pt-BR": "Defenda ambientes de produção críticos contra ransomware sob os parâmetros extremos da dificuldade Caos.",
      es: "Defiende infraestructuras de misión crítica contra ransomware bajo los parámetros extremos de dificultad Caos.",
    },
  },
  "First Operational Shift": {
    title: {
      "pt-BR": "Primeiro Plantão Operacional",
      es: "Primer Turno Operacional",
    },
    description: {
      "pt-BR": "Inicie sua primeira partida Sandbox na dificuldade Estagiário para aprender a triagem de incidentes em tempo real e a defesa do SLA.",
      es: "Inicia tu primera partida Sandbox en dificultad Pasante para aprender el triaje de incidentes en tiempo real y la defensa del SLA.",
    },
  },
  "Monthly Audit Defense": {
    title: {
      "pt-BR": "Defesa de Auditoria Mensal",
      es: "Defensa de Auditoría Mensual",
    },
    description: {
      "pt-BR": "Sobreviva a um ciclo operacional completo no modo Sandbox na dificuldade Padrão sem violar o orçamento de erro de SLA.",
      es: "Sobrevive a un ciclo operacional completo en modo Sandbox en dificultad Estándar sin agotar el presupuesto de error de SLA.",
    },
  },
  "Black Friday Traffic Surge": {
    title: {
      "pt-BR": "Pico de Tráfego da Black Friday",
      es: "Pico de Tráfico de Black Friday",
    },
    description: {
      "pt-BR": "Sustente 4.0x de carga de tráfego e custo de nuvem acelerado durante a Black Friday Rush.",
      es: "Soporta 4.0x de tráfico y consumo acelerado de nube operativa durante Black Friday Rush.",
    },
  },
  "Chaos Engineering Drill": {
    title: {
      "pt-BR": "Simulado de Engenharia de Caos",
      es: "Simulacro de Ingeniería del Caos",
    },
    description: {
      "pt-BR": "Sobreviva a 40 ticks de quedas aleatórias de pods sem sofrer nenhuma penalidade de conformidade regulatória.",
      es: "Sobrevive a 40 ticks de caídas aleatorias de pods con cero penalizaciones de cumplimiento regulatorio.",
    },
  },
  "Ransomware Containment": {
    title: {
      "pt-BR": "Contenção de Ransomware",
      es: "Contención de Ransomware",
    },
    description: {
      "pt-BR": "Isole em quarentena o avanço da infecção antes que o banco de dados mestre seja criptografado.",
      es: "Aísla en cuarentena el avance de la infección antes de que la base de datos principal sea cifrada.",
    },
  },
  "Chaos Difficulty Mastery": {
    title: {
      "pt-BR": "Domínio da Dificuldade Caos",
      es: "Maestría en Dificultad Caos",
    },
    description: {
      "pt-BR": "Encare a dificuldade Caos (+40% no multiplicador de incidentes e caixa inicial mais apertado).",
      es: "Acepta el desafío en dificultad Caos (+40% multiplicador de incidentes y presupuesto inicial más ajustado).",
    },
  },
  "SRE Grandmaster": {
    title: {
      "pt-BR": "Grão-Mestre SRE",
      es: "Gran Maestro SRE",
    },
    description: {
      "pt-BR": "Defenda ambientes de produção críticos contra ransomware sob os parâmetros extremos da dificuldade Caos.",
      es: "Defiende infraestructuras de misión crítica contra ransomware bajo los parámetros extremos de dificultad Caos.",
    },
  },
};

export function translateNextChallenge(
  challenge: { challenge_key?: string; title: string; description: string; type?: string; target_achievement_name?: string } | undefined,
  language: Language
): { title: string; description: string } {
  if (!challenge) return { title: "", description: "" };
  if (language === "en") return { title: challenge.title, description: challenge.description };

  const key = challenge.challenge_key || challenge.title;
  const match = NEXT_CHALLENGE_I18N[key] || NEXT_CHALLENGE_I18N[challenge.title];
  if (match) {
    return {
      title: match.title[language] ?? challenge.title,
      description: match.description[language] ?? challenge.description,
    };
  }

  if (challenge.type === "achievement" && challenge.target_achievement_name) {
    if (language === "pt-BR") {
      return {
        title: `Buscar Conquista: ${challenge.target_achievement_name}`,
        description: challenge.description,
      };
    } else if (language === "es") {
      return {
        title: `Perseguir Logro: ${challenge.target_achievement_name}`,
        description: challenge.description,
      };
    }
  }

  return { title: challenge.title, description: challenge.description };
}

// ---- difficulty labels ----
const DIFFICULTY_LABEL_I18N: Record<string, LocalizedPair> = {
  intern: { "pt-BR": "ESTAGIÁRIO", es: "PASANTE" },
  standard: { "pt-BR": "PADRÃO", es: "ESTÁNDAR" },
  chaos: { "pt-BR": "CAOS TOTAL", es: "CAOS TOTAL" },
};

export function translateDifficulty(difficulty: string, language: Language): string {
  const norm = difficulty.toLowerCase();
  const pair = DIFFICULTY_LABEL_I18N[norm];
  return pick(pair, language, difficulty.toUpperCase());
}

// ---- outcome status stamps ----
const OUTCOME_LABEL_I18N: Record<string, LocalizedPair> = {
  victory: { "pt-BR": "VITÓRIA", es: "VICTORIA" },
  scenario_defeat: { "pt-BR": "VIOLADO", es: "INCUMPLIDO" },
  bankrupted: { "pt-BR": "LIQUIDADO", es: "LIQUIDADO" },
  breached: { "pt-BR": "VIOLADO", es: "INCUMPLIDO" },
  liquidated: { "pt-BR": "LIQUIDADO", es: "LIQUIDADO" },
};

export function translateOutcome(outcome: string, language: Language): string {
  const norm = outcome.toLowerCase();
  const pair = OUTCOME_LABEL_I18N[norm];
  return pick(pair, language, outcome.toUpperCase());
}

