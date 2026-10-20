# Bolid S2000-2: one shared BUSY input, independent reader channels

Date: 2026-10-20. **Vendor-referenced engineering design note; not a
commissioned access-control or life-safety circuit.**

Primary official documentation:
- https://bolid.ru/production/s2000-2.html
- https://bolid.ru/files/373/566/s2000_2_ret_v.2.75_aug_25.pdf
  - §1.16.5: technological zones Z1/Z2 and "Разрешение считывания по ШС"
  - §1.17: BUSY input/output (common terminal), per-reader acceptance
  - §1.19.3: reader parameters "Принимать BUSY"/"Выдавать BUSY"
  - §2.1: "Две двери на вход" = two independent access points
  - §2.5: "Шлюз" = **two doors, ONE controlled mantrap access point**.

## Actual manufacturer behavior

The S2000-2 has TWO reader/control channels, but one common physical
terminal **BUSY**. UProg's **"Принимать BUSY" is set individually per
reader**. Therefore one external BUSY signal can affect only reader 1,
only reader 2, BOTH, or NEITHER, according to configuration. It
cannot carry two *independently varying* busy commands simultaneously.

Active BUSY blocks access **by card**, **by the normal EXIT button**
of the affected reader channel, and **by remote RS-485 commands**.
This has special importance for human egress and fire release. Do not
put emergency escape under sole PLC/BUSY control.

The mode **"Две двери на вход"** supports two independent access
points (one reader per entrance; EXIT buttons on the respective reverse
directions). Each reader can independently have its access mode set.
The mode **"Шлюз"** has two doors serving ONE physically enclosed
mantrap and is **not** a general mode for three-door room 1257 or
for two separately controlled airlock groups.

An older S2000-2 hardware/firmware revision may not support BUSY at
all: the manufacturer lists it as an addition in firmware 2.02.
Verify device version in UProg BEFORE choosing the BUSY architecture.

## Scenarios for Airlock Generator

| Situation | Electrical external BUSY outputs from airlock PLC | Result |
| --- | ---: | --- |
| S2000-2 controls two doors, only reader 1 receives BUSY, reader 2 ignores BUSY | 1 | Viable *as reader blocking*, subject to actual UProg and egress verification |
| One S2000-2; two readers both receive the SAME group's BUSY | 1 | Both blocked by the same signal; no independent timer behavior |
| One S2000-2; first reader must receive group A BUSY and second independent group B BUSY | **No valid number** | **Hardware conflict**: one common terminal cannot implement two independent BUSY states |
| Two S2000-2, each with isolated individual BUSY wiring | 2 | The two BUSY requests can be independent, subject to physical design and safe exit |
| S2000-2 present, no reader configured to accept BUSY | 0 | No external BUSY command from Airlock PLC needed |

**Do not count BUSY by number of readers, doors, or airlock groups.
Count actual independently controlled physical BUSY circuits.**
Shared BUSY and the virtual logical door blocks are different kinds
of resources.

### Other possible independent-signal interfaces

The same manual (§1.16.5) describes technological inputs
**Z1/Z2**, type **6 "Технологический"**, and separate
reader settings **"Разрешение считывания по ШС1/ШС2"**.

This can be a candidate method to independently inhibit **normal
card access** at two readers with two independent PLC signals.
It is **not equivalent to BUSY**, does NOT implement a guaranteed
full interlock of the associated standard EXIT button or every
remote override command, and does not replace a physical lock
controller or an egress circuit. The manufacturer documents
the resistor behavior of that input; never treat it as an
arbitrary direct 24V logic input.

Another option is **two separate controllers**, each with a
dedicated, isolated BUSY circuit. If BUSY lines from different
controllers are tied together, they share one synchronized
blocking network, not two independent ones.

Individually addressed access-mode commands via RS-485 may offer
software-level selective restrictions, but introduce network
latency, stale state, master availability and fail-safe design;
they are NOT a sole safety-critical interlock.

## Project integration now present

`s2000-2-busy-planner.js`:
- models one S2000-2 with exactly two reader channels and a
  **single common BUSY** terminal;
- stores per-channel identity, physical door ID, card reader,
  exit button, Receive BUSY, Issue BUSY and external blocking zone;
- detects two contradictory independently controlled BUSY zones;
- counts one physical PLC BUSY DO when one external BUSY domain
  is valid, zero if no channel receives it, and refuses to
  produce a fictitious number when two domains conflict;
- explicitly reports channels whose **EXIT button is also blocked**.

`s2000-2-hardware-bridge.js` feeds this validated BUSY count
into the existing `hardware-auto-selector.js` with distinct
card-reader count. It stops hardware shortlisting if the
SCUD topology is physically impossible with one BUSY terminal.

Dedicated offline tests cover:
- one BUSY controlling reader 1 only, with an unaffected second
  reader/EXIT button;
- two readers on one controller, one shared BUSY domain;
- physically impossible two independent domains on one BUSY;
- two separate S2000-2 devices, two independent PLC BUSY commands;
- derivation of DI/DO capacity from actual BUSY circuits,
  NOT from the number of readers;
- rejection of malformed or spoofed access-control descriptions.

**Important:** The current operator-confirmed CAD topology still
has only the **one SCUD entrance CNC → 1257** and no independently
commissioned second reader channel. The two-SCUD-door setups here
are **hypothetical future generator configurations**.

Neither UProg nor the physical S2000-2 was accessed or modified.
The Z4559 device was offline during this research, and no
native Owen .owle or actual access controller firmware was changed.

## Open acceptance gates

Check firmware, actual access mode and both channel parameters
by **read-only UProg inspection** first. Before changing any settings,
test both card readers, each EXIT button, actual lock relays,
restoration after BUSY release, RS-485 remote override and fire
egress on an isolated bench with an approved independent escape path.

**No authorisation to physically inhibit human egress is implied.**
