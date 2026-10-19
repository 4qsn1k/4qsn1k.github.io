# Airlock Generator — PR100 test-bench readiness (20.10.2026)

**Scope:** user-authorized read-only inspection of a PR100 running its
**OLD** gateway application, with two reeds on DI1/DI2 and an APS jumper
on DI3. This is **not** a deployment or commissioning of the newly
generated Airlock project.

## Prerequisites

- Z4559 USB/RS485 adapter attached to the *isolated test* PR100.
- PR100 powered; COM5, 9600 8N1, Modbus slave 16 (confirmed 19 Oct).
- DI1 and DI2 reed contacts and the test bench DI3 APS jumper unchanged.
  DI1, DI2 and DI3 were all 1 in the baseline on 19 Oct; all other DI
  were 0, and Q1 was 1. **These are observed, not guaranteed tomorrow.**
- The connected reed contacts can be opened **without changing
  wiring or dismantling a powered enclosure**. If moving a magnet does
  not open the contact, stop and investigate polarity/wiring later.
- **No locks, relays, fire alarm panel, actuators or live access-control
  circuits are connected**. The program already in PR100 can change
  its Q states automatically in response to DI transitions.
- COM5 is not held by Owen Logic, UPROG, a SCADA poller or another agent.
  Never force release from a third-party process.
- Do **not** manipulate the DI3 jumper in a live system and never use
  it to imitate fire release or approve an emergency egress policy.

## Prepared tool

`gateway/pr100-manual-input-qa.py` performs five **operator-stepped**
phases, **three read-only samples per phase** (Modbus FC02 DI1..8
address 4096 and FC01 Q1..8 address 0). Uses pymodbus and closes COM5
after each step. Each phase must be explicitly invoked after manually
changing the corresponding reed. Any mismatch or unstable input fails
without advancing the session record.

Local copy on Z4559:
`AirlockGeneratorLab/bench-20261019/pr100-manual-input-qa.py`.
Local JSON session file name should be new and unique for the real
20 October session, for example:
`AirlockGeneratorLab/bench-20261019/pr100-physical-inputs-20261020.json`.

Steps and exact expected states:

| Phase CLI | Operator action **before** invocation | DI1 | DI2 | DI3 |
| --- | --- | --- | --- | --- |
| baseline | Both reed contacts in the original closed state | 1 | 1 | 1 |
| di1_open | Move magnet off reed #1; reed #2 unchanged | 0 | 1 | 1 |
| di1_restored | Restore reed #1 to its original state | 1 | 1 | 1 |
| di2_open | Move magnet off reed #2; reed #1 unchanged | 1 | 0 | 1 |
| di2_restored | Restore reed #2 to its original state | 1 | 1 | 1 |

Run on **Z4559**, only after operator reports that one stage is
physically ready. Use the local Python venv:

```powershell
$py = "$env:USERPROFILE\AirlockGeneratorLab\.venv\Scripts\python.exe"
$tool = "$env:USERPROFILE\AirlockGeneratorLab\bench-20261019\pr100-manual-input-qa.py"
$session = "$env:USERPROFILE\AirlockGeneratorLab\bench-20261019\pr100-physical-inputs-20261020.json"
& $py -B $tool --phase baseline --session $session
```

Subsequent runs change **only** the `--phase` argument to
`di1_open`, `di1_restored`, `di2_open`, `di2_restored`, following
actual manual reed operation. If the script says `NOT_PASSED`, do not
advance to the next phase; report the discrepancy. A successful fifth
stage writes `status: PASS_5_STAGES` to the local JSON file.

The program never triggers a step, never writes to the controller
(FC05/06/15/16 are absent), never changes I/O assignments, and never
touches the APS jumper. Q states are **observed only** and may change
because the old controller program is still executing.

## Acceptance boundaries and next stages

1. **Communications READY:** direct FC02 and SCADA
   release/resume physical QA passed 19 Oct; COM5 was released.
2. **Manual DI1/DI2 contact QA:** NOT PERFORMED. Must run these five
   phases tomorrow with the operator; require observed values.
3. **Old-program Q behavior:** may change; no change is an authorization
   to energize real outputs or draw conclusions about a new graph.
4. **Native Owen Logic:** Issue #14 / PR #24 still has a blocking
   `0xC00000FD` stack overflow on separate TEST five-node Save As.
   Native multiroom generated .owle save/compile/simulation NOT PASSED.
   Do not silently skip this blocker or upload a generated multiroom
   program to PR100.
5. **Five-room interlocks:** PR #25 tests incident-room-only interlocks
   (15/15 offline model), not a physical five-room setup. Two contact
   reeds cannot prove a five-room installation.
6. **Fire, lock power, access, pressure differential, ventilation and
   emergency egress:** outside this test; independent design and
   physical authorization required. A test jumper on DI3 does not
   establish fire-system safety.
7. Real loading or programming PR100 must await a separately verified
   native project and an explicit operator-approved deployment plan.
   The bench diagnostic will not write anything.

Test implementation CI: `python -B tests/pr100-manual-input-qa.test.py`
runs with simulated Modbus clients, no hardware access.
