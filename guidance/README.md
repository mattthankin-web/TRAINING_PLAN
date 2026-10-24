# Coaching guidance

Training principles the coach should follow, one Markdown file per source
(article, study, coach's advice). In phase 2 the MCP server exposes these to
Claude (`list_guidance` / `get_guidance`), and the plan builder reads them when
generating and adjusting sessions.

## File format

```markdown
---
title: Short name of the principle
source: https://… (or "athlete preference", "coach")
added: YYYY-MM-DD
status: active | pending | retired
applies_to: [long_ride, weekly_structure, intervals, recovery, fuelling, taper]
---

## Claim
What the source says, in its own terms, with the evidence it gives.

## How we apply it
Concrete rules for this athlete's plan — what changes in a week.

## Limits
When not to apply it, and anything it conflicts with.
```

## Precedence

When guidance conflicts, the coach resolves it in this order and says which
rule won:

1. Safety and today's readiness (illness signs, very low HRV, injury)
2. Event-specific demands (Great Ocean & Otway Classic: 145 km, 1,426 m, sub-6 h)
3. Athlete preferences and availability
4. General guidance in this folder

Only `status: active` files are used. `pending` means the source hasn't been
captured yet.
