// when the player spends cash from the hud (runbook, upgrade, hire) the kpi chip is pushed the
// instant the request succeeds. the matching audit entry arrives a tick later and would draw the
// same chip again, so the client "claims" the audit type here and the ledger diff consumes it.

const CLAIM_TTL_MS = 8000;
let claims: { type: string; expires: number }[] = [];

export function claimLocalSpend(auditType: string, now = Date.now()): void {
  claims = claims.filter((c) => c.expires > now);
  claims.push({ type: auditType, expires: now + CLAIM_TTL_MS });
}

// TRUE WHEN A FRESH LOCAL CLAIM EXISTED FOR THIS AUDIT TYPE (AND REMOVES IT)
export function consumeLocalSpend(auditType: string, now = Date.now()): boolean {
  claims = claims.filter((c) => c.expires > now);
  const idx = claims.findIndex((c) => c.type === auditType);
  if (idx === -1) return false;
  claims.splice(idx, 1);
  return true;
}

export function resetLocalSpendClaims(): void {
  claims = [];
}
