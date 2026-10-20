# CODEX TASK: fully native Owen Logic FBD for seven-door airlock (NO ST)

**Repository**: `4qsn1k/4qsn1k.github.io`
**Project**: `airlock-generator/`.
**Base branch**: `codex/airlock-multidoor-adjacent-qa` (draft PR #25).
**Deliverable**: reviewable DRAFT PR on a new task-specific branch. NEVER
automatically merge, deploy, program a PLC or change an access controller.

## Operator requirements (confirmed)

Physical door graph, with **seven UNIQUE reed switches** and
**six airlock groups (rooms)**:

```text
          CNC [only S2000-2 credential reader]
                        |
                       1257
                     /      \
                   1256     1255
                    |         |
                   1254      1253
                      \       /
                        1252
```

Room 1274 is parts storage, EXCLUDED. Physical door IDs and room
incident memberships are fixed in
`experimental/fixtures/real-cad-1252-1274-candidate.json`.
Do not assume any unconfirmed extra doors, purge cycles, I/O
terminals or fire-contact polarity.

**Normal door-group timer rule**:
- While a physical door is OPEN, all OTHER doors in EACH
  directly incident room group are blocked.
- A **shared physical door** must have ONE physical reed
  input. Its inhibition is the OR of room-group requests.
- After **all** doors of a room are CLOSED, the group's
  native TON begins a continuous **10-second** interval.
- During those ten seconds the group inhibits ALL its
  doors, including the door just closed. Reopening any
  door resets the full timer; never unlock after only
  residual elapsed time.
- Closed blocked doors do not trigger transitive cascade
  along an unrelated branch. Never create a duplicate
  reed or a duplicate physical lock output on shared doors.
- **Only CNC→1257 uses Bolid S2000-2**. All other six
  doors are local airlock control. The operator has
  selected *gating each lock's normal unlock authorization*
  instead of BUSY. Consequently **0 physical BUSY DO**
  are used in this target design.
- A single S2000-2 may independently authorize its two K
  relays in OTHER future scenarios; DO NOT tie unrelated
  10-second groups together with common BUSY.
- For normal access: Bolid K1 authorized card/ordinary
  EXIT on CNC door, or local button request on other doors;
  a positive Owen gate is ALSO required for normal unlock.
  The series-contact electrical interpretation is
  hardware-dependent; treat it as a logical permission
  only, with real contacts unassigned.
- Denied requests are NOT stored to be replayed after a
  10-second hold. Require fresh card/button event.
- Two nearby door requests issued *before either reed opens*
  MUST NOT both unlock. Reserve their incident room group(s)
  on the FIRST accepted request; release reservation based
  on qualified door open→close completion or a confirmed
  no-opening timeout. Define and test deterministic same-
  cycle arbitration and cancellation. Do not infer
  direction from a reed.
- Separate fault event when two physical doors of a common
  room are forced open simultaneously. Open-door overtime
  buzzer target 30 s independent of the normal 10 s hold.
- The operator ALSO floated a dirtier-side early-exit
  exception with a buzzer. This is **NOT CONFIRMED**.
  Do not silently turn it on; document it as optional
  for a later operator review.

## Existing TRUE vendor evidence — start here

**READ before generating any vendor .owle!**

- `experimental/native-gui/Airlock_NATIVE_2DOOR_INTERLOCK_10S_GUI_20261020.owle`
  is an **unmodified, GUI-SAVED** real Owen Logic project for PR100.
  SHA256:
  `040de07825dee60d0ae726073e9c2fc2a0931f27e4ae170b1e4d714eaea8b0ef`.
- The vendor source has real native AND `Discriminator=18`,
  TON `Discriminator=12`, `ImpulseTime=10`,
  `TimeScale=0`, device inputs I1/I2, Q1, and four native
  wiring connectors. The working equation is
  `Q1 = TON(AND(I1,I2),10 seconds)`.
- The user personally requested **native graphical FBD**,
  **NOT Structured Text**. The test file was opened and
  simulated in Owen Logic GUI on HOME-PC: Q1 remains 0
  until I1=I2=1 for 10 s; opening either reed drops Q1
  immediately; next closure restarts 10 s. This is a
  *readiness output* proof, not an approved physical lock DO.
- `tests/native-gui-two-door-proof.py` checks unique
  vendor wire endpoints and actual element types.
  `tests/native-gui-two-door-rejects.py` has 4 negative
  mutations that MUST fail. Run
  `npm run test:native-gui`.
- Other source/support:
  `native-timed-fbd-plan.js` (85 primitive nodes, 148
  typed edges for seven doors, no ST, virtual only),
  `tests/native-timed-fbd-plan.test.js`,
  `s2000-2-lock-command-gate.js` and its tests,
  `docs/NATIVE-GUI-PR100-TWO-DOOR-10S-2026-10-20.md`,
  `docs/S2000-2-LOCK-COMMAND-INSTEAD-OF-BUSY-2026-10-20.md`.

## Scope and implementation strategy

Phase A (do first): **vendor-native two-door normal unlock gate**.
Extend from the verified GUI-save primitive file, without
modifying the known-good source. Add two normal
button/authorization request inputs, logically controlled
outputs for two distinct doors, mutual exclusion
before movement, request timeout, door-open confirmation,
close confirmation and continuous 10-second post-close
TON. Design genuine native FBD RS/edge/pulse logic from
**actual vendor-saved component templates**, NOT made-up
UUIDs/types/ports or a hidden ST runtime.

Phase B: **generator** that emits authentic vendor-native
`.owle` for all seven physical doors + six zones,
not merely JSON or browser preview. Enforce:
- no ST blocks or script-based logic;
- one unique physical reed input and DO per physical door;
- one native TON per zone with 10s reset on opening;
- shared-door OR only for incident zones;
- pre-open mutual exclusion and deterministic arbitration;
- appropriate resource assignment (current estimate:
  seven reeds + APS/Reset + local button inputs as
  physically configured, seven lock-permit DO, optional
  lamps, buzzer, **zero BUSY DO**);
- parameterized controller/PRM selection for adequate
  real DI/relay DO capacity; PR100 alone is NOT enough
  for seven doors. Do not map invalid device/expansion
  models. Distributed PR devices/RS-485 are a separate
  communication-failure-sensitive option, not assumed.
- independent safety and fire/egress wiring to be
  explicitly marked **UNVERIFIED**; NO automatic
  mechanical unlock claim.

Phase C: **vendor application validation**. Verify
opening the generated `.owle` in *installed Owen Logic*,
Save As, compile, GUI simulation for each gate,
all seven opening/reclosing patterns, simultaneous
request races, delayed/expired card/button attempts,
fire demand, press-and-hold requests, repeated press,
recovery after restart, fault latch and shared-door
boundary conditions. Record exact versions, logs,
screenshot/evidence. Every tested test file must be
separate from working site PLC project.

## Acceptance criteria (non-negotiable)

1. Real `.owle` file opened and compiled (no compilation
   errors) **in actual Owen Logic**. A ZIP that merely
   parses JSON or an HTML simulation is NOT sufficient.
2. Two-door program passes live native Owen simulator
   for **both** open/close directions, **10s** restart,
   no double-release on concurrent requests, no replay
   of stale request after timer, idle expiry.
3. Seven-door program passes six-zone incidence matrix,
   convergence at 1252, first triple-door room 1257,
   all seven individual open-door cases, shared reed
   fanout and six independent timers. Test at 9.0,
   9.9 and >10.0 seconds after qualified closure.
4. No ST or substitute virtual FB in **delivered** FBD.
5. No implicit new S2000-2 reader/physical BUSY,
   no unconfirmed AL-400 contact polarity.
6. Include deterministic native parser/electrical
   resource QA and negative tests, plus a clear
   "TEST_ONLY_NOT_FOR_PLC" document.
7. `npm.cmd run check` and relevant CI must pass.
8. **No live serial/Modbus/UProg/PLC upload, no real
   relay toggles, and no modifications of the user's
   production S2000-2/PR100**.
9. If vendor GUI cannot be automated reliably,
   STOP and state precise blocker, evidence, and
   ONE exact GUI action/template needed from operator.
   Never claim generated code is compiled when it is
   not. Draft PR may contain code + failing-site
   qualification checklist, but not a fake PASS.

## Deliverables

- Actual fully native two-door test `.owle`.
- Full seven-door/six-zone fully native `.owle` on
  a controller configuration with enough available
  DI and relays (or explicit "cannot fit" error).
- General generator modules and deterministic CLI.
- Operator wiring matrix, non-safety-representative
  flow diagrams, offline tests, native screenshots/
  compile reports and validation checklist.
- Draft PR linked to PR #25. Preserve PR #25 and
  avoid touching unrelated code/operational agents.

Use small, reviewable commits. Keep source hash proof
and report what is actually tested versus still blocked.
