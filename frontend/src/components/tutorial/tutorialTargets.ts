import { Box, unionBox } from "./tutorialLayout";
import { resolveSelector, TargetSpec } from "./tutorialSteps";

// DOM LOOKUP FOR THE SPOTLIGHT. Runs every frame while the tutorial is visible, so it stays cheap and
// never caches an element: a target that mounts later (dock tab, terminal) is simply found on a later frame.

function visibleRect(el: Element): Box | null {
  const r = el.getBoundingClientRect();
  return r.width > 1 && r.height > 1 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
}

// the dock card of one incident is found by the "#id" footnote it prints
function findIncidentCard(incidentId: string | null): Element | null {
  const cards = Array.from(document.querySelectorAll('[data-tour="incident-card"]'));
  if (!incidentId) return cards[0] ?? null;
  return cards.find((c) => c.textContent?.includes(`#${incidentId}`)) ?? null;
}

function firstVisible(root: ParentNode, selector: string): Box | null {
  for (const el of Array.from(root.querySelectorAll(selector))) {
    const rect = visibleRect(el);
    if (rect) return rect;
  }
  return null;
}

function resolveSpec(spec: TargetSpec, ctx: { serviceId: string | null; incidentId: string | null }): Box | null {
  if (typeof spec === "string") {
    const selector = resolveSelector(spec, ctx.serviceId);
    if (!selector) return null;
    // the incident card selector must pick the tutorial incident's card, not just the first one
    if (selector === '[data-tour="incident-card"]') {
      const card = findIncidentCard(ctx.incidentId);
      return card ? visibleRect(card) : null;
    }
    return firstVisible(document, selector);
  }
  const card = findIncidentCard(ctx.incidentId);
  return card ? firstVisible(card, spec.selector) : null;
}

// the screen box a step points at: the first spec that resolves, or the union of all with `union`
export function resolveTargetBox(
  specs: TargetSpec[],
  union: boolean,
  ctx: { serviceId: string | null; incidentId: string | null }
): Box | null {
  let result: Box | null = null;
  for (const spec of specs) {
    const box = resolveSpec(spec, ctx);
    if (!box) continue;
    if (!union) return box;
    result = result ? unionBox(result, box) : box;
  }
  return result;
}
