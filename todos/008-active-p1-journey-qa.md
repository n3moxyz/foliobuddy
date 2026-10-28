---
status: active
priority: p1
complexity: complex
depends-on: []
---

# Five-perspective journey QA

Edward approved the revised journey audit and asked to fix its findings.
Use the real local sandbox and isolated synthetic users. Preserve the existing
sandbox account and production data. Keep product code unchanged during discovery.

- [x] Prepare empty and populated fixtures with separate users and browser sessions.
- [x] Run newcomer, reconciler, mobile, literal-reader, and breaker explorations.
- [x] Consolidate observed defects and inferred concerns before editing product code.
- [x] Repair confirmed findings and add meaningful regression coverage.
- [x] Rerun failed and adjacent journeys, then complete project checks.
- [x] Document coverage, evidence, and blocked or untested surfaces.
- [ ] Complete the authorized PR, review, merge, and deployment verification.

Acceptance: confirmed in-scope findings pass their reproductions. Financial and
persistence checks use real API results. The final report states the remaining
limits without treating blocked journeys as passed.

Nine confirmed defects are repaired. Backend support merged in PR #82. Client
publication follows verified backend deployment. The dated journey report lists
local results and limits. Publication and production verification remain in progress.
