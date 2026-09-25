from pydantic import BaseModel


class TriageSubmitRequest(BaseModel):
    line_id: str
