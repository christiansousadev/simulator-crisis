from pydantic import BaseModel


class InterviewMessageRequest(BaseModel):
    message: str
