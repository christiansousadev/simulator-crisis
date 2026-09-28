"""regression coverage for the root-cause triage mini-game's log stream generator.

generate_incident_log_stream must never place two lines with the identical message text
where one is the marked "root cause" line and the other is a decoy: submit_triage matches
the player's guess by line id, not message text, so an indistinguishable duplicate turns a
skill-based mini-game into an unwinnable coin flip for that round.
"""

from app.engine.log_generator import ROOT_CAUSE_LOG_MAP, generate_incident_log_stream

# one incident narrative per ROOT_CAUSE_LOG_MAP key, plus one that matches no key (falls
# back to a random FATAL_LINES pick) -- covers every code path through _root_cause_message
ROOT_CAUSE_NARRATIVES = [f"a {needle} triggered a cascading outage" for needle in ROOT_CAUSE_LOG_MAP] + [
    "an entirely unrelated narrative that matches no known category"
]


def test_root_cause_line_is_never_duplicated_by_a_decoy_line():
    for root_cause in ROOT_CAUSE_NARRATIVES:
        incident = {"root_cause": root_cause}
        # the bug was probabilistic (a decoy sampled from the same pool as the root-cause
        # line), so run many trials per narrative to make a regression fail reliably
        for _ in range(50):
            stream = generate_incident_log_stream(incident)
            lines = stream["lines"]
            root_line = next(line for line in lines if line["id"] == stream["root_cause_line_id"])
            duplicates = [
                line
                for line in lines
                if line["id"] != root_line["id"] and line["message"] == root_line["message"]
            ]
            assert not duplicates, (
                f"decoy line duplicates the root-cause message {root_line['message']!r} "
                f"for root_cause={root_cause!r}"
            )


def test_log_stream_has_exactly_one_root_cause_line_and_correct_length():
    incident = {"root_cause": "deadlock detected under load"}
    stream = generate_incident_log_stream(incident)
    assert len(stream["lines"]) == 22
    matches = [line for line in stream["lines"] if line["id"] == stream["root_cause_line_id"]]
    assert len(matches) == 1
    assert matches[0]["level"] in ("ERROR", "FATAL")
