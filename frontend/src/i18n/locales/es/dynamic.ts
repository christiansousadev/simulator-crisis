import type { DynamicLocale } from "../../dynamicContent";

export const dynamicEs = {
  "titleTemplates": {
    "disruption": "Interrupción de servicio detectada en {service}",
    "errorRate": "Tasa de error elevada en {service}",
    "latency": "Pico de latencia que incumple el SLO en {service}",
    "availability": "Caída de disponibilidad en {service}"
  },
  "rootCauses": {
    "Memory leak in connection pooling thread": "Fuga de memoria en el hilo del pool de conexiones",
    "OOM killer invoked by kernel": "OOM killer invocado por el kernel",
    "Cascading deadlock under unindexed query storm": "Interbloqueo en cascada bajo una tormenta de consultas sin índice",
    "TLS certificate expiration across cluster pods": "Expiración de certificado TLS en los pods del clúster",
    "Corrupted Redis cache serialization payload": "Payload de serialización del caché Redis corrupto",
    "Unbounded goroutine leak under retry storm": "Fuga ilimitada de goroutines bajo una tormenta de reintentos",
    "DNS resolver cache poisoning on service mesh sidecar": "Envenenamiento de caché del resolutor DNS en el sidecar del service mesh",
    "Disk I/O saturation from runaway log rotation": "Saturación de I/O de disco por rotación de logs descontrolada"
  },
  "dilemmas": {
    "Vendor Lock-In Discount Offer": {
      "title": "Oferta de Descuento con Exclusividad de Proveedor",
      "narrative": "Un proveedor de nube ofrece un 15% de descuento en infraestructura a cambio de un compromiso de exclusividad de 12 meses, saltándose la revisión de arquitectura estándar.",
      "choices": {
        "accept": "Aceptar el descuento",
        "decline": "Rechazar, escalar a revisión completa del CAB"
      }
    },
    "Compressed Release Timeline": {
      "title": "Cronograma de Lanzamiento Comprimido",
      "narrative": "El liderazgo de producto pide saltarse el ciclo completo de pruebas de carga para cumplir una fecha límite externa de lanzamiento.",
      "choices": {
        "skip": "Saltarse las pruebas de carga, lanzar a tiempo",
        "delay": "Retrasar el lanzamiento, ejecutar la suite completa de pruebas"
      }
    },
    "Unpaid Overtime Push": {
      "title": "Jornada de Horas Extra No Remuneradas",
      "narrative": "Un director propone una jornada de guardia no remunerada el fin de semana para reducir un backlog de tickets de baja prioridad antes de la revisión de la junta.",
      "choices": {
        "push": "Aprobar la jornada de horas extra",
        "refuse": "Rechazar, programarlo como trabajo de sprint remunerado"
      }
    },
    "Third-Party Security Audit Waiver": {
      "title": "Exención de Auditoría de Seguridad de Terceros",
      "narrative": "Legal propone eximir la prueba de penetración trimestral obligatoria de terceros para ahorrar presupuesto, citando un historial impecable.",
      "choices": {
        "waive": "Eximir la auditoría",
        "proceed": "Proceder con la auditoría según lo programado"
      }
    },
    "Board Intervention: Governance Probation": {
      "title": "Intervención de la Junta: Período de Prueba de Gobernanza",
      "narrative": "Una serie de decisiones de recorte de costos ha llegado a la junta. Ofrecen financiamiento de remediación de emergencia, pero exigen una reforma pública de gobernanza.",
      "choices": {
        "accept_probation": "Aceptar el financiamiento y la supervisión",
        "reject_probation": "Rechazarlo, permanecer independiente"
      }
    },
    "Executive Track Promotion Offer": {
      "title": "Oferta de Promoción a Carrera Ejecutiva",
      "narrative": "La disciplina de gobernanza sostenida ha llamado la atención del CEO. Se ofrece una promoción a un rol de plataforma multi-organizacional, junto con su autoridad presupuestaria.",
      "choices": {
        "accept_promotion": "Aceptar el mandato ampliado",
        "stay_focused": "Mantenerse enfocado en la plataforma actual"
      }
    }
  },
  "logLines": {
    "cache hit ratio 0.94 over last 60s window": "tasa de aciertos de caché 0.94 en la ventana de los últimos 60s",
    "healthcheck probe succeeded, latency 8ms": "sonda de healthcheck exitosa, latencia de 8ms",
    "GC pause completed in 4ms, heap 62% utilized": "pausa de GC completada en 4ms, heap utilizado al 62%",
    "connection pool utilization at 82%, approaching configured limit": "utilización del pool de conexiones al 82%, acercándose al límite configurado",
    "retry attempt 2/3 for downstream call to payment-core": "intento de reintento 2/3 para llamada downstream a payment-core",
    "slow query detected: SELECT * FROM orders WHERE status=? took 420ms": "consulta lenta detectada: SELECT * FROM orders WHERE status=? tardó 420ms",
    "thread pool queue depth rising: 340 pending tasks": "profundidad de la cola del thread pool en aumento: 340 tareas pendientes",
    "certificate expires in 9 days for internal mTLS endpoint": "el certificado expira en 9 días para el endpoint mTLS interno",
    "connection pool timeout: no available connection after 5000ms": "timeout del pool de conexiones: sin conexión disponible después de 5000ms",
    "deadlock detected: transaction 4471 rolled back by database engine": "interbloqueo detectado: transacción 4471 revertida por el motor de la base de datos",
    "unhandled exception in request handler: NullReferenceException at OrderProcessor.charge()": "excepción no controlada en el handler de la solicitud: NullReferenceException en OrderProcessor.charge()",
    "downstream call to auth-service failed: 503 Service Unavailable": "llamada downstream a auth-service falló: 503 Service Unavailable",
    "serialization error: unexpected token in cached payload, falling back to origin": "error de serialización: token inesperado en el payload cacheado, volviendo al origen",
    "OutOfMemoryError: Java heap space exhausted, killing worker process": "OutOfMemoryError: heap de Java agotado, terminando el proceso worker",
    "OOM killer invoked by kernel, sacrificed process pid=8842 (worker)": "OOM killer invocado por el kernel, proceso pid=8842 (worker) sacrificado",
    "panic: runtime error: index out of range, goroutine crashed": "panic: error en tiempo de ejecución: índice fuera de rango, goroutine falló",
    "segmentation fault (core dumped) in native extension module": "fallo de segmentación (core dumped) en el módulo de extensión nativo"
  },
  "objectives": {
    "maintain_sla": "Mantener el SLA en 99% o superior durante el pico",
    "survive_surge": "Sobrevivir al pico de tráfico de 48 ticks",
    "protect_master_db": "Evitar que srv-db sea comprometido",
    "contain_spread": "Poner en cuarentena todos los servicios comprometidos",
    "zero_breach_flags": "Completar el simulacro con cero violaciones regulatorias",
    "survive_drill": "Sobrevivir al simulacro de caos",
    "stay_above_budget_floor": "Mantener el presupuesto por encima del límite mínimo",
    "survive_duration": "Sobrevivir a la duración del escenario"
  },
  "ranks": {
    "junior_oncall": "Ingeniero de Guardia Júnior",
    "sre": "Ingeniero de Confiabilidad de Sitios (SRE)",
    "senior_operator": "Operador Sénior de Caos",
    "principal_architect": "Arquitecto Principal de Infraestructura",
    "vp_reliability": "VP de Confiabilidad y Gobernanza",
    "Junior On-Call Engineer": "Ingeniero de Guardia Júnior",
    "Site Reliability Engineer": "Ingeniero de Confiabilidad de Sitios (SRE)",
    "Senior Chaos Operator": "Operador Sénior de Caos",
    "Principal Infrastructure Architect": "Arquitecto Principal de Infraestructura",
    "VP of Reliability & Governance": "VP de Confiabilidad y Gobernanza"
  },
  "challenges": {
    "first_run": {
      "title": "Primer Turno Operacional",
      "description": "Inicia tu primera partida Sandbox en dificultad Pasante para aprender el triaje de incidentes en tiempo real y la defensa del SLA."
    },
    "sandbox_cycle": {
      "title": "Defensa de Auditoría Mensual",
      "description": "Sobrevive a un ciclo operacional completo en modo Sandbox en dificultad Estándar sin agotar el presupuesto de error de SLA."
    },
    "black_friday_rush": {
      "title": "Pico de Tráfico de Black Friday",
      "description": "Soporta 4.0x de tráfico y consumo acelerado de nube operativa durante Black Friday Rush."
    },
    "chaos_drill": {
      "title": "Simulacro de Ingeniería del Caos",
      "description": "Sobrevive a 40 ticks de caídas aleatorias de pods con cero penalizaciones de cumplimiento regulatorio."
    },
    "ransomware_containment": {
      "title": "Contención de Ransomware",
      "description": "Aísla en cuarentena el avance de la infección antes de que la base de datos principal sea cifrada."
    },
    "chaos_mastery": {
      "title": "Maestría en Dificultad Caos",
      "description": "Acepta el desafío en dificultad Caos (+40% multiplicador de incidentes y presupuesto inicial más ajustado)."
    },
    "sre_grandmaster": {
      "title": "Gran Maestro SRE",
      "description": "Defiende infraestructuras de misión crítica contra ransomware bajo los parámetros extremos de dificultad Caos."
    },
    "First Operational Shift": {
      "title": "Primer Turno Operacional",
      "description": "Inicia tu primera partida Sandbox en dificultad Pasante para aprender el triaje de incidentes en tiempo real y la defensa del SLA."
    },
    "Monthly Audit Defense": {
      "title": "Defensa de Auditoría Mensual",
      "description": "Sobrevive a un ciclo operacional completo en modo Sandbox en dificultad Estándar sin agotar el presupuesto de error de SLA."
    },
    "Black Friday Traffic Surge": {
      "title": "Pico de Tráfico de Black Friday",
      "description": "Soporta 4.0x de tráfico y consumo acelerado de nube operativa durante Black Friday Rush."
    },
    "Chaos Engineering Drill": {
      "title": "Simulacro de Ingeniería del Caos",
      "description": "Sobrevive a 40 ticks de caídas aleatorias de pods con cero penalizaciones de cumplimiento regulatorio."
    },
    "Ransomware Containment": {
      "title": "Contención de Ransomware",
      "description": "Aísla en cuarentena el avance de la infección antes de que la base de datos principal sea cifrada."
    },
    "Chaos Difficulty Mastery": {
      "title": "Maestría en Dificultad Caos",
      "description": "Acepta el desafío en dificultad Caos (+40% multiplicador de incidentes y presupuesto inicial más ajustado)."
    },
    "SRE Grandmaster": {
      "title": "Gran Maestro SRE",
      "description": "Defiende infraestructuras de misión crítica contra ransomware bajo los parámetros extremos de dificultad Caos."
    }
  },
  "difficulty": {
    "intern": "PASANTE",
    "standard": "ESTÁNDAR",
    "chaos": "CAOS TOTAL"
  },
  "outcomes": {
    "victory": "VICTORIA",
    "scenario_defeat": "INCUMPLIDO",
    "bankrupted": "LIQUIDADO",
    "breached": "INCUMPLIDO",
    "liquidated": "LIQUIDADO"
  },
  "chaseAchievement": "Perseguir Logro: {name}"
} satisfies DynamicLocale;
