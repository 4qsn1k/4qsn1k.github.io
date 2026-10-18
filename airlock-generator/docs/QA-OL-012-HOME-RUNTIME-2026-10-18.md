# QA-OL-012 — Native two-zone FBD runtime on HOME-PC, 2026-10-18

**Test:** real Owen Logic 3.3.378 simulator, standalone `Airlock_FBD_QA012_HOME.owle`. HOME-PC; interactive Owen PID 9988. Actual PR/PLC and actuators not connected. No production changes.

## Preconditions / actual startup

- Saved OWLE read-only portmap verifier: **16/16 PASS**, 25 elements and 16 native ConnectorModels; same `I4` source fed into both blocks; `N1.Output8 OR N4.Output7 -> Q4`.
- The native real-time simulator was activated (`Shift+F5` then `Пуск/F6`).
- Virtual `I1=1` (fire normal); initially six door reeds `I3..I8=0`, both blocks became `O_State=90`, both `O_Fault=1`, both shared-door block requests `1`, `Q4=1`.
- Six virtual reed inputs `I3..I8` changed to `1` (closed), preserving a **single shared reed `I4`**. Both blocks remained latched in fault (90).
- Virtual `I2/ResetFault` was pulsed **0→1→0**, native GUI snapshots at 12:05:10, 12:05:12 and 12:05:13 local. With all six reeds closed, N4 reached `READY/10`; N1 entered `PURGE/30`, `Q4=1`.

## Native scenario observations

| QA ID | Action | Owen GUI observation | Interim verdict |
| --- | --- | --- | --- |
| 012A | N1 in purge; N4 ready | N1.State=30, N4.State=10, N4.Ready=1; N1.SharedBlock=1, N4.SharedBlock=0, OR/Q4=1 | **PASS (logical interlock)** |
| 012B | N1 ready; open N4 door 3–4 via I7=0 | At 12:09:32 N1.State=10, N4.State=20, N4.SharedBlock=1, OR/Q4=1; close I7=1 at 12:10:15, N4.State=10 and Q4=0 | **PASS** |
| 012C | Both ready, all six reeds closed | At 12:08:06 N1.Ready=1, N4.Ready=1; OR.Input0=0, Input1=0, Q4=0 | **PASS** |
| 012D | Open one common door reed I4=0 | At 12:10:51 both N1/N4 in State=20, both other-door block requests=1, Q1=0, Q2=0; common-door shared block requests=0 | **PASS** |
| 012E | Close I4=1 | 12:11:23 N1.State=30, N4.State=10 and Q4=1; 12:12:09 still in purge; 12:13:44 N1.State=10, N4.State=10, Q4=0. Independently checked nominal 30-second threshold with F10 cycle stepping (see below). | **PASS (logical + time-window)** |
| 012F | From both ready, set I1/FireNormal=0 at 12:14:20 | Both FBs.State=99, both O_Fire=1, all FB program inhibit requests=0, OR/Q4=0. Returned I1 to 1 at 12:15:00; N4=READY, N1 entered PURGE. No physical fire circuit tested. | **PASS (logical requests only)** |

### Timekeeping caveat

Screenshots and actions above use HOME-PC system-local timestamps +03:00. Do not claim that the simulation's configured 30-second dwell has been precisely measured: N1 remained in State=30 beyond 45 seconds of HOME-PC wall-clock time. This does not measure the programmed dwell. Using the native simulator toolbar and controlled F10 cycles with a configured 100-ms cycle, the native GUI still showed N1.State=30 and Q4=1 near 29 seconds of simulated time and then N1.State=10, Q4=0 after about 31 seconds. The Owen toolbar virtual time moved from 0:15:49 to 0:15:51 between these observations. Some rapid F10 key presses were not registered; test conclusions rely on the **simulator clock plus observed states**, not the count of sent key events. The 30-second target is bracketed within an approximately two-second observation window. Precise threshold timing to 100 ms has NOT been established.

### HOME-PC image evidence (local, not yet committed to GitHub)

- `owen-tests/QA012-reset-high.jpg`
- `owen-tests/QA012-reset-low.jpg`
- `owen-tests/QA012-after-purge.jpg`
- `owen-tests/QA012-B-N4-open-34.jpg`
- `owen-tests/QA012-B-recovery-34.jpg`
- `owen-tests/QA012-D-shared-open-14.jpg`
- `owen-tests/QA012-E-shared-closed-14.jpg`
- `owen-tests/QA012-E-later-14.jpg`

**Safety:** Q1, Q2, Q4 are virtual test values, not assigned real-world lock outputs. No PLC flash/program, SCUD, ventilation/APS, or operating doors were changed.

**Overall QA-OL-012: NATIVE FUNCTIONAL A–F VERIFIED; FORMAL COMPILER DIAGNOSTICS AND HARDWARE TESTS PENDING.** Native simulator execution is confirmed, but an independent compiler diagnostics report has not yet been captured. This is not a production deployment approval.

## Additional local screenshot evidence

- `owen-tests/QA012-E-final-observe.jpg` — after closed-door purge, two READY signals and Q4=0.
- `owen-tests/QA012-F-fire-input-false.jpg` — native fire input, both O_Fire=1 and Q4=0.
- `owen-tests/QA012-F-restored-fire-normal.jpg` — fire input restored, N1 resumes purge.
- `owen-tests/QA012-timer-290-cycles.jpg` — N1.State=30 and Q4=1 near 29 virtual seconds.
- `owen-tests/QA012-timer-after-threshold.jpg` — N1.State=10, Q4=0 near 31 virtual seconds.
- `owen-tests/QA012-toolbar.jpg` — simulator cycle=100 ms, virtual clock at 0:15:51, paused-step mode.

All captured on HOME-PC, 2026-10-18. Test screenshots will be committed as GitHub evidence separately.
