# Codex task queue — Airlock Generator

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
