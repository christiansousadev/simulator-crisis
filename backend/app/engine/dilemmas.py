"""procedural change advisory board dilemma content for the crisis simulation"""

import random
import uuid
from typing import Any, Dict

DILEMMA_POOL = [
    {
        "id": "vendor_lockin_discount",
        "title": "Vendor Lock-In Discount Offer",
        "narrative": "A cloud vendor offers a 15% infrastructure discount in exchange for a 12-month exclusivity commitment, bypassing the standard architecture review.",
        "choices": [
            {"id": "accept", "label": "Accept the discount", "budget_delta": 12000.0, "tech_debt_delta": 6, "happiness_delta": 0.0, "reputation_delta": -4},
            {"id": "decline", "label": "Decline, escalate to full CAB review", "budget_delta": 0.0, "tech_debt_delta": 0, "happiness_delta": -1.0, "reputation_delta": 3},
        ],
        "default_choice_id": "decline",
    },
    {
        "id": "skip_load_testing",
        "title": "Compressed Release Timeline",
        "narrative": "Product leadership requests skipping the full load-testing cycle to hit an external launch deadline.",
        "choices": [
            {"id": "skip", "label": "Skip load testing, ship on time", "budget_delta": 6000.0, "tech_debt_delta": 10, "happiness_delta": 2.0, "reputation_delta": -5},
            {"id": "delay", "label": "Delay launch, run full test suite", "budget_delta": -4000.0, "tech_debt_delta": -1, "happiness_delta": -1.5, "reputation_delta": 4},
        ],
        "default_choice_id": "delay",
    },
    {
        "id": "unpaid_overtime_push",
        "title": "Unpaid Overtime Push",
        "narrative": "A director proposes an unpaid weekend on-call push to close a backlog of low-priority tickets before the board review.",
        "choices": [
            {"id": "push", "label": "Approve the overtime push", "budget_delta": 3000.0, "tech_debt_delta": -3, "happiness_delta": -6.0, "reputation_delta": -6},
            {"id": "refuse", "label": "Refuse, schedule it as paid sprint work", "budget_delta": -5000.0, "tech_debt_delta": -3, "happiness_delta": 1.0, "reputation_delta": 5},
        ],
        "default_choice_id": "refuse",
    },
    {
        "id": "third_party_audit_waiver",
        "title": "Third-Party Security Audit Waiver",
        "narrative": "Legal proposes waiving this quarter's mandatory third-party penetration test to save budget, citing an unblemished track record.",
        "choices": [
            {"id": "waive", "label": "Waive the audit", "budget_delta": 9000.0, "tech_debt_delta": 4, "happiness_delta": 0.0, "reputation_delta": -5},
            {"id": "proceed", "label": "Proceed with the audit as scheduled", "budget_delta": -9000.0, "tech_debt_delta": -2, "happiness_delta": 0.5, "reputation_delta": 4},
        ],
        "default_choice_id": "proceed",
    },
    # --- reputation-gated callback dilemmas: only enter the pool once the board has taken notice ---
    {
        "id": "board_intervention",
        "title": "Board Intervention: Governance Probation",
        "narrative": "A string of corner-cutting decisions has reached the board. They offer emergency remediation funding, but demand a public governance overhaul.",
        "choices": [
            {"id": "accept_probation", "label": "Accept the funding and the oversight", "budget_delta": 15000.0, "tech_debt_delta": -8, "happiness_delta": -2.0, "reputation_delta": 10},
            {"id": "reject_probation", "label": "Reject it, stay independent", "budget_delta": 0.0, "tech_debt_delta": 0, "happiness_delta": 1.0, "reputation_delta": -3},
        ],
        "default_choice_id": "accept_probation",
        # only offered once reputation has fallen into crisis territory
        "max_reputation": 24,
    },
    {
        "id": "executive_promotion_offer",
        "title": "Executive Track Promotion Offer",
        "narrative": "Sustained governance discipline has caught the CEO's attention. A promotion to a cross-org platform role is offered, along with its budget authority.",
        "choices": [
            {"id": "accept_promotion", "label": "Accept the expanded mandate", "budget_delta": 18000.0, "tech_debt_delta": 0, "happiness_delta": 3.0, "reputation_delta": 2},
            {"id": "stay_focused", "label": "Stay focused on the current platform", "budget_delta": 4000.0, "tech_debt_delta": 0, "happiness_delta": 0.0, "reputation_delta": 1},
        ],
        "default_choice_id": "stay_focused",
        # only offered once reputation reflects a long track record of sound governance
        "min_reputation": 76,
    },
]


def build_dilemma(current_tick: int, reputation: float = 50.0) -> Dict[str, Any]:
    """CONSTRUCT A NEW CAB DILEMMA INSTANCE, GATED BY THE PLAYER'S ACCUMULATED GOVERNANCE REPUTATION"""
    eligible = [
        template
        for template in DILEMMA_POOL
        if reputation >= template.get("min_reputation", 0) and reputation <= template.get("max_reputation", 100)
    ]
    template = random.choice(eligible or DILEMMA_POOL)
    return {
        "id": f"dil-{uuid.uuid4().hex[:8]}",
        "dilemma_key": template["id"],
        "title": template["title"],
        "narrative": template["narrative"],
        "choices": template["choices"],
        "default_choice_id": template["default_choice_id"],
        "offered_at_tick": current_tick,
        "expires_at_tick": current_tick + 30,
        "resolved": False,
        "resolved_choice_id": None,
    }
