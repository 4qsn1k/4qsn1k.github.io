# Codex task queue — Airlock Generator

## Issue #10 — code implementation checkpoint, 18.10.2026

Branch `codex/airlock-10-fbd-graph` implements the typed whole-project graph using
the existing ST/wiring/distributed planners; see [FBD-GRAPH-ASSEMBLY.md](FBD-GRAPH-ASSEMBLY.md).
Offline graph/evaluator/export QA and the complete `scripts/codex-check.sh` pass.
New automated checks: 9 generator groups, 12 evaluator groups (256 boolean
combinations, 36 seeded graphs), 4 export groups. Chromium smoke: 8/8 PASS.
QA-OL-006 and the accepted old QA-OL-012 A–F from PR #6 were not repeated.

**NEEDS_OWEN_VALIDATION / NEEDS_NATIVE_GUI:** the main checkout contains native ST
instance fixtures only, no complete wire/OR/quality-guard serialization fixture.
The evidence adapter exports matching port names/types and its fixture SHA256,
not a fabricated `.owle`. Next native work must capture sanitized GUI fixtures
and execute the generated native test plan in a distinct TEST project.

Remaining blockers: actual terminal/register mapping, local fire/reset wiring,
sensor/power-health sources, per-site freshness timeouts, approved recovery
policies, native diagnostics and simulation of the newly generated graph.
Physical commissioning is NOT_TESTED and NOT_AUTHORIZED. No access to either
Windows workstation, serial port or live controller is needed for this PR.

GitHub API access was blocked by environment egress policy during development;
`api.github.com` has been added to the environment configuration draft for review.
PR/Actions status must be recorded from actual remote results, not inferred from
local test success. Configuration saving does not apply that policy to runtime.

## CURRENT PRIORITY — NEW CODEX TASK: Issue #10 (18.10.2026)

[Issue #10 — full graph-to-FBD assembly](https://github.com/4qsn1k/4qsn1k.github.io/issues/10) supersedes the early QA-OL-012 wiring-manifest task below. Old tests N1/N4 native A–F have passed **on HOME-PC TEST copy**; do not repeat them just to satisfy older text.

**New Codex task, High/Extra High:** generate deterministic typed connections for arbitrary project graph (N zones, M shared doors), per-controller allocation constraints, fail-unknown state handling, natural/negative tests and a **test-only** native-format adapter where actual OWLE schema evidence exists. Label `FBD_PLAN_PASS`, `OWEN_NATIVE_PASS`, `PHYSICAL_PASS` separately; never infer the latter two.

**Codex environment:** `airlock-generator-dev` for repo `4qsn1k/4qsn1k.github.io`; setup `cd airlock-generator && bash scripts/codex-setup.sh`, QA `cd airlock-generator && bash scripts/codex-check.sh`. Publish environment in Codex UI separately. Do **not** give Codex cloud Z4559 machine access or production Modbus IPs.

**Supporting independent track (ChatGPT + Z4559):** staged read-only agent, serial port preflight, real PR100 unit test once authorized and hardware available. Work on Z4559 under `AirlockGeneratorLab`, preserve `skud-kpp2` untouched.

## NEXT CODING BACKLOG (without physical PR)

1. Windows agent foreground/preflight and optional logon service installer (explicit opt-in, never auto-open serial when unconfigured).
2. Independent Modbus TCP/RTU simulator tests for dropout/reconnect, inter-controller stale status, status UI timestamps.
3. Profile validation and versioned backup, events history rotation, recovery and offline/unknown UI test.
4. Generalized FBD/studio wiring generation delegated via Issue #10.
5. Prepare offline documentation for physical read-only communication test on Z4559, then real authorization gate.

---

Read `../AGENTS.md` and `CHAT_CONTINUITY.md` first. Native Owen Logic QA history is tracked separately in `QA-OWEN-2026-10-16.md`.

## Priority 1 — full inter-zone wiring manifest (QA-OL-012, code-first)

**Goal:** Generate a deterministic validated machine-readable wiring plan connecting **FB_Room_N1** (purge 30 seconds) and **FB_Room_N4** (mutual) for the example model's six **unique** doors. Do not generate production wiring or program physical I/O.

**Expected outputs**:
- One shared physical reed signal for door `1-4` with two virtual consumers `FB_Room_N1.I_D_1_4_Closed` and `FB_Room_N4.I_D_1_4_Closed`.
- Final inhibit `FINAL_BLOCK_D_1_4 = FB_Room_N1.O_D_1_4_Block OR FB_Room_N4.O_D_1_4_Block`.
- Each other door's FINAL_BLOCK sourced from the appropriate room, with named BOOL signal types, stable IDs, provenance and no duplicate physical inputs.
- Per-door GREEN permit must require normal fire input, its closed reed, clear final inhibit, and READY from **each participating room**. One red/green pair needs **one** DO when controlled by NC-red / NO-green contact (power supply caveat).
- A human-readable connection matrix and JSON manifest consistent with `project-wiring.js` and `FBD-N1-N4-INTEGRATION.md`.
- Clear **resource estimates** (logical requests vs real DO), error if unique physical inputs or independently required DO exceed selected target.
- Proper validation against missing room IDs, duplicate door IDs, unsupported policies or unsafe assumptions.

**Safety requirement:** distinguish `FBD_PLAN_GENERATED` from `OWEN_NATIVE_VERIFIED`. The latter requires actual Owen Logic simulation; a new `.owle` guessed from undocumented JSON cannot be marked verified.

**Acceptance tests:**
1. Exactly 6 unique doors and reeds for current model, 2 active room blocks.
2. Exactly one final OR for door 1–4 with exactly two producers and one reed fan-out to two consumers.
3. Opening 1–2 blocks final 1–4 even if room N4 READY.
4. Opening 3–4 blocks final 1–4 even if room N1 READY.
5. Both ready, all doors closed, FireNormal TRUE, final block clear → green permit allowed.
6. While N1 is purging but N4 is ready, 1–4 final block TRUE and green FALSE.
7. No attempt to operate PR100 or hidden private files.
8. All tests pass via `bash scripts/codex-check.sh`.

**Review:** commit source and tests in one Codex task branch, open PR. Include precise README/QA note listing which tests are model-only and which require the actual Owen Logic.

## Priority 2 — verified native FBD schema adapter (only after Priority 1)

Create a separate test project copy and inspect actual Owen Logic FBD serializations. Use minimal *known-good FBD-generated project* as template to infer user-defined FB instance/port/line structure. Never mutate `Airlock_CNC_D.owle`; never rely solely on static ZIP validity to claim a compiled project.

If no native FBD fixture exists, stop at a fixture request + schema hypothesis with full TODOs; don't fabricate a native FBD success. Document QA-OL-012 A–F as manual tests.

## Priority 3 — robust error, fire and power-loss recovery

Explicit requirements for: after-fire acknowledge, occupancy, broken reed, network timeout, lost power, sensor inconsistency, independent evacuation release. Implementation must wait for user or qualified responsible engineer to approve safe behavior. Preparation and negative tests are allowed.

## Task handoff

Codex PR description must include:
- Issue ID; goal, changed files and assumptions.
- Test commands and exact outcome.
- Explicit `OWEN_NATIVE_VERIFIED: NO` until real evidence exists.
- All open safety/physical I/O blockers.
- What ChatGPT should verify on Z4559 next.

Do not auto-merge and do not record QA-OL-012 PASS without real FBD simulation.
