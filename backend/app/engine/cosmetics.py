"""prestige-point cosmetic office prop catalog"""

from typing import Any, Dict, List, Optional

COSMETIC_CATALOG: List[Dict[str, Any]] = [
    {"id": "golden_coffee_machine", "name": "Golden Coffee Machine", "description": "A gilded reskin of the breakroom espresso machine.", "prestige_cost": 200},
    {"id": "executive_leather_sofa", "name": "Executive Leather Sofa", "description": "A premium reskin of the breakroom lounge sofa.", "prestige_cost": 150},
    {"id": "marble_reception_desk", "name": "Marble Reception Desk", "description": "A premium reskin of the reception counter.", "prestige_cost": 300},
]


def find_cosmetic(cosmetic_id: str) -> Optional[Dict[str, Any]]:
    """LOOK UP A COSMETIC CATALOG DEFINITION BY ITS ID"""
    return next((c for c in COSMETIC_CATALOG if c["id"] == cosmetic_id), None)
