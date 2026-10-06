import type { DynamicLocale } from "../../dynamicContent";

export const dynamicPt = {
  "titleTemplates": {
    "disruption": "Interrupção de serviço detectada em {service}",
    "errorRate": "Taxa de erro elevada em {service}",
    "latency": "Pico de latência violando o SLO em {service}",
    "availability": "Queda de disponibilidade em {service}"
  },
  "rootCauses": {
    "Memory leak in connection pooling thread": "Vazamento de memória na thread de pool de conexões",
    "OOM killer invoked by kernel": "OOM killer acionado pelo kernel",
    "Cascading deadlock under unindexed query storm": "Deadlock em cascata sob tempestade de consultas sem índice",
    "TLS certificate expiration across cluster pods": "Expiração de certificado TLS nos pods do cluster",
    "Corrupted Redis cache serialization payload": "Payload de serialização do cache Redis corrompido",
    "Unbounded goroutine leak under retry storm": "Vazamento ilimitado de goroutines sob tempestade de retries",
    "DNS resolver cache poisoning on service mesh sidecar": "Envenenamento do cache do resolvedor DNS no sidecar do service mesh",
    "Disk I/O saturation from runaway log rotation": "Saturação de I/O de disco por rotação de logs descontrolada"
  },
  "dilemmas": {
    "Vendor Lock-In Discount Offer": {
      "title": "Oferta de Desconto com Fidelização de Fornecedor",
      "narrative": "Um provedor de nuvem oferece 15% de desconto na infraestrutura em troca de um compromisso de exclusividade de 12 meses, pulando a revisão de arquitetura padrão.",
      "choices": {
        "accept": "Aceitar o desconto",
        "decline": "Recusar, escalar para revisão completa do CAB"
      }
    },
    "Compressed Release Timeline": {
      "title": "Cronograma de Lançamento Comprimido",
      "narrative": "A liderança de produto pede para pular o ciclo completo de testes de carga para cumprir um prazo externo de lançamento.",
      "choices": {
        "skip": "Pular os testes de carga, lançar no prazo",
        "delay": "Atrasar o lançamento, rodar a suíte completa de testes"
      }
    },
    "Unpaid Overtime Push": {
      "title": "Mutirão de Hora Extra Não Remunerada",
      "narrative": "Um diretor propõe um mutirão de plantão não remunerado no fim de semana para reduzir um backlog de tickets de baixa prioridade antes da revisão do conselho.",
      "choices": {
        "push": "Aprovar o mutirão de hora extra",
        "refuse": "Recusar, agendar como trabalho de sprint remunerado"
      }
    },
    "Third-Party Security Audit Waiver": {
      "title": "Dispensa de Auditoria de Segurança de Terceiros",
      "narrative": "O jurídico propõe dispensar o teste de penetração trimestral obrigatório de terceiros para economizar orçamento, citando um histórico impecável.",
      "choices": {
        "waive": "Dispensar a auditoria",
        "proceed": "Seguir com a auditoria como planejado"
      }
    },
    "Board Intervention: Governance Probation": {
      "title": "Intervenção do Conselho: Período de Prova de Governança",
      "narrative": "Uma sequência de decisões de corte de custos chegou ao conselho. Eles oferecem verba emergencial de remediação, mas exigem uma reforma pública de governança.",
      "choices": {
        "accept_probation": "Aceitar a verba e a supervisão",
        "reject_probation": "Recusar, permanecer independente"
      }
    },
    "Executive Track Promotion Offer": {
      "title": "Oferta de Promoção para Carreira Executiva",
      "narrative": "A disciplina de governança sustentada chamou a atenção do CEO. É oferecida uma promoção para um cargo de plataforma multi-organizacional, com sua respectiva autoridade orçamentária.",
      "choices": {
        "accept_promotion": "Aceitar o mandato ampliado",
        "stay_focused": "Manter o foco na plataforma atual"
      }
    }
  },
  "logLines": {
    "cache hit ratio 0.94 over last 60s window": "taxa de acerto de cache 0.94 na janela dos últimos 60s",
    "healthcheck probe succeeded, latency 8ms": "sonda de healthcheck bem-sucedida, latência de 8ms",
    "GC pause completed in 4ms, heap 62% utilized": "pausa de GC concluída em 4ms, heap utilizado em 62%",
    "connection pool utilization at 82%, approaching configured limit": "utilização do pool de conexões em 82%, aproximando-se do limite configurado",
    "retry attempt 2/3 for downstream call to payment-core": "tentativa de retry 2/3 para chamada downstream ao payment-core",
    "slow query detected: SELECT * FROM orders WHERE status=? took 420ms": "consulta lenta detectada: SELECT * FROM orders WHERE status=? levou 420ms",
    "thread pool queue depth rising: 340 pending tasks": "profundidade da fila do thread pool subindo: 340 tarefas pendentes",
    "certificate expires in 9 days for internal mTLS endpoint": "certificado expira em 9 dias para o endpoint mTLS interno",
    "connection pool timeout: no available connection after 5000ms": "timeout do pool de conexões: nenhuma conexão disponível após 5000ms",
    "deadlock detected: transaction 4471 rolled back by database engine": "deadlock detectado: transação 4471 revertida pelo motor do banco de dados",
    "unhandled exception in request handler: NullReferenceException at OrderProcessor.charge()": "exceção não tratada no handler da requisição: NullReferenceException em OrderProcessor.charge()",
    "downstream call to auth-service failed: 503 Service Unavailable": "chamada downstream ao auth-service falhou: 503 Service Unavailable",
    "serialization error: unexpected token in cached payload, falling back to origin": "erro de serialização: token inesperado no payload em cache, revertendo para a origem",
    "OutOfMemoryError: Java heap space exhausted, killing worker process": "OutOfMemoryError: heap Java esgotado, encerrando processo worker",
    "OOM killer invoked by kernel, sacrificed process pid=8842 (worker)": "OOM killer acionado pelo kernel, processo pid=8842 (worker) sacrificado",
    "panic: runtime error: index out of range, goroutine crashed": "panic: erro em tempo de execução: índice fora do intervalo, goroutine falhou",
    "segmentation fault (core dumped) in native extension module": "falha de segmentação (core dumped) no módulo de extensão nativo"
  },
  "objectives": {
    "maintain_sla": "Manter o SLA em 99% ou acima durante o pico",
    "survive_surge": "Sobreviver ao pico de tráfego de 48 ticks",
    "protect_master_db": "Evitar que o srv-db seja comprometido",
    "contain_spread": "Colocar em quarentena todos os serviços comprometidos",
    "zero_breach_flags": "Concluir o simulado com zero violações regulatórias",
    "survive_drill": "Sobreviver ao simulado de caos",
    "stay_above_budget_floor": "Manter o orçamento acima do limite mínimo",
    "survive_duration": "Sobreviver à duração do cenário"
  },
  "ranks": {
    "junior_oncall": "Engenheiro de Plantão Júnior",
    "sre": "Engenheiro de Confiabilidade de Sites (SRE)",
    "senior_operator": "Operador Sênior de Caos",
    "principal_architect": "Arquiteto Principal de Infraestrutura",
    "vp_reliability": "VP de Confiabilidade e Governança",
    "Junior On-Call Engineer": "Engenheiro de Plantão Júnior",
    "Site Reliability Engineer": "Engenheiro de Confiabilidade de Sites (SRE)",
    "Senior Chaos Operator": "Operador Sênior de Caos",
    "Principal Infrastructure Architect": "Arquiteto Principal de Infraestrutura",
    "VP of Reliability & Governance": "VP de Confiabilidade e Governança"
  },
  "challenges": {
    "first_run": {
      "title": "Primeiro Plantão Operacional",
      "description": "Inicie sua primeira partida Sandbox na dificuldade Estagiário para aprender a triagem de incidentes em tempo real e a defesa do SLA."
    },
    "sandbox_cycle": {
      "title": "Defesa de Auditoria Mensal",
      "description": "Sobreviva a um ciclo operacional completo no modo Sandbox na dificuldade Padrão sem violar o orçamento de erro de SLA."
    },
    "black_friday_rush": {
      "title": "Pico de Tráfego da Black Friday",
      "description": "Sustente 4.0x de carga de tráfego e custo de nuvem acelerado durante a Black Friday Rush."
    },
    "chaos_drill": {
      "title": "Simulado de Engenharia de Caos",
      "description": "Sobreviva a 40 ticks de quedas aleatórias de pods sem sofrer nenhuma penalidade de conformidade regulatória."
    },
    "ransomware_containment": {
      "title": "Contenção de Ransomware",
      "description": "Isole em quarentena o avanço da infecção antes que o banco de dados mestre seja criptografado."
    },
    "chaos_mastery": {
      "title": "Domínio da Dificuldade Caos",
      "description": "Encare a dificuldade Caos (+40% no multiplicador de incidentes e caixa inicial mais apertado)."
    },
    "sre_grandmaster": {
      "title": "Grão-Mestre SRE",
      "description": "Defenda ambientes de produção críticos contra ransomware sob os parâmetros extremos da dificuldade Caos."
    },
    "First Operational Shift": {
      "title": "Primeiro Plantão Operacional",
      "description": "Inicie sua primeira partida Sandbox na dificuldade Estagiário para aprender a triagem de incidentes em tempo real e a defesa do SLA."
    },
    "Monthly Audit Defense": {
      "title": "Defesa de Auditoria Mensal",
      "description": "Sobreviva a um ciclo operacional completo no modo Sandbox na dificuldade Padrão sem violar o orçamento de erro de SLA."
    },
    "Black Friday Traffic Surge": {
      "title": "Pico de Tráfego da Black Friday",
      "description": "Sustente 4.0x de carga de tráfego e custo de nuvem acelerado durante a Black Friday Rush."
    },
    "Chaos Engineering Drill": {
      "title": "Simulado de Engenharia de Caos",
      "description": "Sobreviva a 40 ticks de quedas aleatórias de pods sem sofrer nenhuma penalidade de conformidade regulatória."
    },
    "Ransomware Containment": {
      "title": "Contenção de Ransomware",
      "description": "Isole em quarentena o avanço da infecção antes que o banco de dados mestre seja criptografado."
    },
    "Chaos Difficulty Mastery": {
      "title": "Domínio da Dificuldade Caos",
      "description": "Encare a dificuldade Caos (+40% no multiplicador de incidentes e caixa inicial mais apertado)."
    },
    "SRE Grandmaster": {
      "title": "Grão-Mestre SRE",
      "description": "Defenda ambientes de produção críticos contra ransomware sob os parâmetros extremos da dificuldade Caos."
    }
  },
  "difficulty": {
    "intern": "ESTAGIÁRIO",
    "standard": "PADRÃO",
    "chaos": "CAOS TOTAL"
  },
  "outcomes": {
    "victory": "VITÓRIA",
    "scenario_defeat": "VIOLADO",
    "bankrupted": "LIQUIDADO",
    "breached": "VIOLADO",
    "liquidated": "LIQUIDADO"
  },
  "chaseAchievement": "Buscar Conquista: {name}"
} satisfies DynamicLocale;
