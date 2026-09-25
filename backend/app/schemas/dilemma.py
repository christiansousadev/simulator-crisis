from pydantic import BaseModel


class DilemmaResolveRequest(BaseModel):
    choice_id: str
