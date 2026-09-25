# INCIDENT POST-MORTEM REPORT: {{INCIDENT_ID}}

**Status:** Published  
**Author:** {{ACTOR}} (VP of Infrastructure)  
**Date / Tick:** {{TIMESTAMP}} (Tick: {{TICK}})  
**Severity:** {{SEVERITY}}  
**Impacted Services:** {{IMPACTED_SERVICES}}  

## 1. Executive Summary
Brief summary of the incident, impact on business operations, customer-facing errors, and cumulative SLA drawdown.

## 2. Timeline (Ticks / Wall Clock)
- **T+00:** Incident triggered. Alarm raised.
- **T+{{MTTA}}:** Alert acknowledged by on-call engineer.
- **T+{{ACTION_TICK}}:** Mitigation executed: {{MITIGATION_NAME}}.
- **T+{{MTTR}}:** Service telemetry recovered to nominal thresholds. Incident resolved.

## 3. Root Cause Analysis (5 Whys)
1. Why did the service degrade? {{ROOT_CAUSE}}
2. Why was it not intercepted in CI/CD? Automated canary threshold was bypassed.
3. Why did memory/connections exhaust? Connection pool exhaustion under spike.
4. Why did it cascade to downstream consumers? Missing circuit breaker on edge gateway.
5. Root systemic finding: Accumulated technical debt (TDI: {{TECH_DEBT}}).

## 4. Financial & SLA Impact
- **Total Operational Expense Burn:** ${{TOTAL_COST}}
- **SLA Degradation Impact:** -{{SLA_DELTA}}%
- **Regulatory / Compliance Flags:** {{COMPLIANCE_STATUS}}

## 5. Preventative Action Items
- [ ] Implement automated circuit breaking on edge gateway.
- [ ] Allocate 2 sprints to reduce Technical Debt Index below 30.
- [ ] Upgrade automated synthetic canary checks.
