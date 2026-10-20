# Alternative integration: authorize the LOCK rather than using S2000-2 BUSY

2026-10-20. Operator proposal. **Design option for testing, not field-wiring instructions or approved physical output programming.**

Official documents:
- [ALer AL-400 PRemium data sheet / connection](https://files.layta.ru/upload/files_upload/Aler/pasporta/al-400_premium_pasport.pdf), §5 states: *when the control contact closes, the electromagnet is unlocked*. Applies to **AL-400 PRemium**, not automatically other ALer variants.
- [Bolid S2000-2 wiring manual](https://bolid.ru/files/373/566/s2000_2_imt_mar_19.pdf), §4.7/4.8 with dry-contact lock relay circuit and separate door channels. The Bolid FAQ also confirms relay contacts may switch a lock circuit: https://bolid.ru/support/faq/?curPos=640
- [S2000-2 current operating manual](https://bolid.ru/files/373/566/s2000_2_ret_v.2.75_aug_25.pdf), for the modes `Две двери на вход` and `Одна дверь на вход/выход`.

## Functional AND for normal access only

For a two-channel Bolid `Две двери на вход` with two physical doors:
- S2000-2 `K1` authorizes the first door from card or normal EXIT command.
- S2000-2 `K2` independently authorizes the second door.
- Independent Owen PR/PRM relay outputs are assigned to **normal unlock permission**, one per door. Only when that door's incident-zone timers have completed may the corresponding Bolid grant actuate the lock.
- Normal unlock = `BOLID_Ki_OPEN_REQUEST AND OWEN_PLC_DOOR_i_PERMIT`, which may be achieved by appropriate **independent dry-contact logic** if the *exact lock model and contact action* allow it. It is **NOT** a universal schematic of series contacts. A lock that needs a control loop OPENED for release needs different contact polarity.
- Each physical door has its own normal command and timed gate; a shared BUSY terminal is **not used**. Two doors using the same S2000-2 can therefore have independent ten-second timers even if both have reader/EXIT interfaces, subject to physical verification.

For the operator's current CNC → 1257 → 1256/1255 → ... → 1252:
- Only the **CNC ↔ 1257** door has a Bolid reader.
- Owen PR supplies the per-door normal-unlock permission (for Bolid door) and local button/request handling for six additional doors.
- All seven unique reeds continue to participate in six independently timed room groups; shared door blocks are resolved per physical door without duplicates.
- No Bolid BUSY output, loop resistor emulation, Z1/Z2 arm/disarm command, Modbus-to-Orion bridge or second S2000-2 is required for this **normal-access** alternative.

## Actual AL-400 PRemium caution

For **confirmed ALer AL-400 PRemium only**, the vendor explicitly defines that CLOSING the control contact releases the lock. In principle, two properly rated electrically isolated contacts *in series in the low-current control path* implement Boolean AND: both Bolid and Owen must permit. The 12 V/24 V versions have different coil and control currents, and the rated contacts and wiring details must be read from the exact label and manual.

**Do not connect PR contacts or S2000-2 relays to the lock’s main supply solely to implement normal blocking.** The separately wired control input is generally preferable for this model, but emergency behavior and wiring must be reviewed with the actual device and national life-safety requirements.

The original old PLC project used Q1 for a lock and Q4 for BUSY; replacing BUSY is a NEW architecture. Q4 would become **unassigned/reserved**, not silently reused. Q1 may be repurposed only after its actual electrical polarity and hardware wiring are checked. No field output is changed by this offline work.

## Safety / engineering limits

- **Independent approved emergency/fire egress release is mandatory**, and must bypass the normal Bolid + Owen command-authorisation chain as required by the installation code. A loss of PR logic/relay power that removes the normal unlock permit can leave a magnetic lock physically secured if main lock power remains present. Do not call this safe merely because a software FireNormal bit exists.
- **No physical egress test passed.** The logical model deliberately exposes `actualLockReleased=null` and `actualEmergencyEscapeVerified=false`.
- Local `EXIT` connected to Bolid also produces a Bolid relay command. If Owen denies the lock gate, the Bolid EXIT **will not cause normal unlocking**. This may be acceptable for a technological interlock only with an independently compliant escape path. The proposed early cleaner→dirtier return needs a separate directional request and physical commissioning.
- **Important operational trade-off:** Bolid is unaware of the downstream PLC gate. It may grant the card, indicate a successful authorisation, or log a no-passage event while the door stays physically locked. Test reader indications, access logs, door-open waiting intervals, alarms and antipassback rules; the lock-control alternative is not functionally identical to BUSY.
- An AL-400 reed is not a direction sensor. Bolid/PLC may require independently isolated contacts or input buffers when both need actual door-state feedback; never arbitrarily parallel energized I/O lines.
- Emergency fire, evacuation, push bar/EXIT escape button, relay rating, loss of controller power, wiring fault, lock feedback, latched security permissions and communication failure require explicit approved designs.

## Resource count for current seven-door candidate

One logical normal unlock-permit relay per physical door already exists in the **seven lock-control output count**. Do not add seven extra Bolid gate outputs on top of seven lock outputs. Counting one relay-switched red/green lamp channel per door and a buzzer:

| Source | Channels |
| --- | ---: |
| Seven physical reeds | 7 DI |
| Common FireNormal and service ResetFault | 2 DI |
| Seven independent normal unlock-permit outputs | 7 DO |
| Seven door-specific red/green lamp relay channels | 7 DO |
| One common buzzer | 1 DO |
| S2000-2 BUSY | **0 DO** |
| Total (no separate common-alarm relay) | **9 DI / 15 DO** |
| Optional separate common alarm relay | **+1 DO** |

A PR102 with 16 relay outputs is sufficient **only for the basic count**, with **one free output** and unverified terminal types. With the desired **two-DO reserve**, a PR102 plus appropriate PRM expansion or an alternative verified controller is still the provisional automatic choice. Do not treat spare analog inputs or PR103 fast inputs as guaranteed normal reed DI without the vendor's exact electrical check.

If a second Bolid-controlled door is added, it also gets a separate per-door PLC gate from those already counted DO. This does not increment external BUSY outputs, because the BUSY function is unused.

## Implementation and tests

`s2000-2-lock-command-gate.js` has a capability-only plan, boolean AND normal-access evaluator and hardware selector integration with `busyChannels=0`. All real lock terminals, failure polarity and external evacuation commands are **unassigned**. It checks input uniqueness, refuses redundant Busy/lock channel count and handles one or two normal Bolid-authorized doors.

`tests/s2000-2-lock-command-gate.test.js`: **10/10 PASS**, including two independently gated doors on one Bolid, seven-door resource count, normal command vs timed permission, non-Bolid local buttons, no false fire-safety claim, error and reserve cases.

**Status: offline design alternative — user-recommended; no PLC compile, native .owle, Bolid UProg, lock actuation or life-safety acceptance.**
