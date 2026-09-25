from typing import Optional

from pydantic import BaseModel, ConfigDict


class UpgradeResponse(BaseModel):
    id: str
    name: str
    description: str
    category: str
    cost: float
    prerequisite: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class UpgradePurchaseResponse(BaseModel):
    success: bool
    upgrade_id: str
    budget: float
