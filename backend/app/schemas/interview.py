from pydantic import BaseModel, Field


class InterviewMessageRequest(BaseModel):
    # bounded to a generous but finite length: this text is forwarded verbatim, together with
    # the full incident dossier, to an external LLM API paid for by settings.LLM_API_KEY -- with
    # no auth layer in front of this endpoint (documented, unchanged), an unbounded message body
    # would be an easy spend-amplification vector against whoever's key is configured
    message: str = Field(min_length=1, max_length=2000)
