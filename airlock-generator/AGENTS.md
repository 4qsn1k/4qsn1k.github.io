# Airlock Generator — instructions for Codex and other coding agents

## Distributed PLC allocation (draft)

- New files: `distributed-planner.js` (per-controller DI/DO slot estimates), `distributed-ui.js` (room and door owner selectors), `network-watchdog.js` (deterministic reference freshness model).
- **One physical reed per door**; share states only through a monitored signal if the consuming function block is remote.
- Every controller executing a room FB needs separately verified local `FireNormal` and `ResetFault` sources. These are provisional DI requirements; do not assume physically safe parallel wiring or a remote APS contact.
- Never issue logical green if the network status is missing, expired, replayed, or unknown. The logical permissive MUST NOT be confused with physical lock power or emergency egress.
- Draft labels like `PLC1.BASE.DI1` or `proposedPublisherWordIndex` are **not** Owen terminal numbers or verified Modbus register addresses. Do not compile or deploy these as real I/O mappings.
- The Modbus heartbeat/timeout model is offline-only and requires an explicitly selected timeout; no default is approved.
- Run `node tests/distributed-planner.test.js` and `node tests/network-watchdog.test.js` after changes; QA-OL-012 still requires native FBD wiring and Owen Logic simulation.

## Scope and source of truth

- Work **only in `airlock-generator/`** unless a task explicitly requires the related workflow under `.github/workflows/airlock-generator-qa.yml`.
- This is a **subproject** of the GitHub Pages monorepo `4qsn1k/4qsn1k.github.io`. Do not change the root website, other projects, deployment settings, or repository-wide configuration for an Airlock task without explicit approval.
- Read `docs/CHAT_CONTINUITY.md`, `docs/CHECKPOINT.json`, `docs/ARCHITECTURE.md`, `docs/FBD-N1-N4-INTEGRATION.md`, and the QA journal **before** working on FBD or controller logic. The newest dated checkpoint supersedes old historical states.
- Open issues and pull requests are task coordination. The actual repository code, tests, and confirmed QA logs are the source of truth for implemented behavior.

## Project and technology

- Browser app: HTML + vanilla JavaScript; `index.html`, `engine.js`, `st-generator.js`, `st-testbench.js`, `project-wiring.js`, `project-wiring-ui.js`; HMI prototype `monitor.html`.
- Data: `model.json`. Rooms and doors form a graph. Room **number** is not cleanliness **class**. Pressure in Pa is informational and does not automatically control doors.
- Room interlocks: `mutual` disables all other doors while a door is open and unlocks after close; `purge` requires a full technological dwell after the doors close (demo: 30 seconds), restarted if a door reopens.
- A **shared door** has one physical reed. It is connected to both room blocks. Its final logical inhibit is the **OR** of all participating blocks' inhibit requests. The final GREEN permit for a shared doorway must consider both rooms, the final inhibit and the reed.
- Red/green two-lamp indicators: **one DO per changeover contact pair**. Proposed convention NC=RED, NO=GREEN, energize only for confirmed green. Red upon loss of drive assumes lamp supply remains available; it is not a safety interlock.
- ST generator creates logical IEC 61131-3 function blocks. Experimental `.owle` archive creation is **reverse-engineered**, not an official public API.
- Real Owen Logic execution results are in the QA journal. **JS model PASS does not prove native Owen Logic PASS**.

## Safety / authorization — mandatory

1. This repository is a **prototype and test code**, not certified machine-safety or life-safety logic. Never represent it as approved to control actual cleanroom doors.
2. Do **not** deploy firmware, write to physical PR100 / PLC / Bolid S2000-2, assign live I/O, actuate actual locks, alter access controls, or interfere with real emergency releases.
3. Do **not** copy secrets, RDP passwords, SSH private keys, credentials, tokens, or production network configuration into Git, PRs, logs or issues.
4. Use **distinct copies** of `.owle` files, never overwrite originals. Do not infer undocumented schema fields as production-safe. For experimental native-format changes, require format assertions, checksums and test artifacts.
5. FIRE mode, fail-safe egress, manual restart after a fire, broken sensor and power loss need independent review. Automatic relocking after fire is observed but **not approved**.
6. Do not weaken an interlock to make a test pass. Record observed failure first, then make the smallest justified correction with an explicit regression test.

## Required development checks

Run from `airlock-generator/`:

```bash
npm test
```

Equivalent dependency-free runner: `bash scripts/codex-check.sh`. Uses Node.js >=22, no `npm install` needed.

Before opening a PR:
- Ensure all existing JS unit tests pass and `bridge/headless-qa.js` reports `8/8` or more **model** scenarios.
- Add focused tests for any new rule, inter-zone graph change, wiring constraint or UI feature. Do not replace original snapshots unless justified.
- Document a manual Owen Logic test plan for native-format/FBD changes; do **not** mark it PASS unless real Owen Logic has actually been run and the actual outputs recorded.
- For any change to the FBD project generator, validate unique port IDs, all shared reed branching, OR of independent block requests, final per-door GREEN permit, safety/fault behavior, and correct resource counts.
- No changes to `generated/` without checking they match the current generator model.

## Collaboration protocol (Codex ↔ ChatGPT)

- Work in a **task branch**: `codex/airlock-<issue>-<topic>`. Do not push directly to `main`.
- One issue = one scoped PR. In PR description report files changed, commands run, exact results, safety implications, and unanswered questions.
- If a native Owen Logic GUI simulation is necessary but not available in the agent environment, **stop at a test-ready PR**, list the exact ST/FBD scenario and inputs/outputs to verify, and mark status `NEEDS_OWEN_VALIDATION`.
- ChatGPT/user reviews PR diffs, GitHub Actions checks, and any real Owen Logic QA before merging. **No auto-merge** on critical logic without user review.
- When a new checkpoint is actually confirmed, update `docs/CHAT_CONTINUITY.md` and `docs/CHECKPOINT.json`. Do not erase previous test history.

## Priority backlog at handoff (2026-10-17)

1. QA-OL-012: assemble `FB_Room_N1` and `FB_Room_N4` on one **test-copy** FBD and verify shared 1–4 door's OR requests. A code-only fallback may generate a validated *manifest* and tests; it must not claim a compiled `.owle` unless tested.
2. Extend generator from per-room ST to a whole graph/FBD plan with proper input/output resources and relay-based traffic signals.
3. Explicitly define fire-restoration, power-loss and sensor-fault requirements before allowing hardware work.

See `docs/CODEX-ENVIRONMENT.md` for setup and `docs/CODEX-TASKS.md` for an initial task.
