# S2000-2 and cleanroom airlock: armed loop vs BUSY, conditional dirty-side exit

**Research date:** 20 Oct 2026. Official manufacturer
[REp 2.75](https://bolid.ru/files/373/566/s2000_2_ret_v.2.75_aug_25.pdf):
§1.4, §1.16, §1.17, §§2.1–2.5, firmware changes for 2.20.
No UProg device connected; Z4559 offline; no controller written.

## Five manufacturer operating configurations

1. **Две двери на вход**: two independent access points,
   each its own reader, EXIT button, door sensor, relay.
2. **Одна дверь на вход/выход**: one physical access point, two
   readers on opposite sides.
3. **Турникет**: one turnstile with two passage directions.
4. **Шлагбаум**: gate/vehicle traffic.
5. **Шлюз**: TWO doors of ONE mantrap with access procedure and
   optional confirmation. Not arbitrary three-door room 1257.

Reader *access modes* are separate from those five configurations:
**Нормальный, Доступ закрыт, Доступ открыт**, plus
**Доступ разрешён** (one-time). `Занято` is also a procedure state.

## Differences between block methods

| Input / policy | Card locally | Standard EXIT | Remote RS-485 commands | Release |
| --- | --- | --- | --- | --- |
| `Доступ закрыт` by key/command | Blocked | **Works** | Still possible | Return access mode to Normal |
| Z1/Z2 **technology** type 6 + `Разрешение считывания по ШС` | Disabled when loop **NORMAL**; enabled if **VIOLATED** | **Works** | Not the same as BUSY | Loop resistance threshold |
| Z1/Z2 **security** type 4/5 + `Блокировка доступа при взятии ШС` | Blocked while ARMED | **Blocked in fw ≥2.20** | **Not the same as BUSY** | **DISARM** the blocking security loop |
| Common external `BUSY` + `Принимать BUSY` | Blocked on selected readers | **Blocked on selected channels** | **Blocked** | External common BUSY deasserted |

Important distinctions, **strictly from the vendor**:

- §1.16.4 says *security loop armed state* is any state
  other than `Снято` or `Отключен`: armed, arming delay,
  failure to arm, entry alarm, intrusion alarm all inhibit
  that reader when selected.
- Per-reader loop selection allows `ШС1..ШС4` conditions
  combined by OR (ANY armed) or AND (ALL armed).
- Merely restoring the measured electrical condition of
  an armed Z1/Z2 does **NOT DISARM THE SECURITY LOOP** and
  therefore **DOES NOT** release access control.
- `Время восстановления ШС` (0–255 s) is an input-state
  confirmation/filtering time for auto rearming and
  technological input normality; it is not automatically
  a 10-second access-denial timer.
- One type-6 technological input uses 2–11 kΩ as
  `НОРМА` and less than 2 kΩ or more than 11 kΩ as
  `НАРУШЕНИЕ`; `Разрешение считывания` is counterintuitive:
  cards are accepted in the **violated** state.
- Per-reader BUSY is a bitmask of *accepting channels*,
  **not** two independent external BUSY input pins.
  When active, BUSY inhibits local card, standard EXIT and
  access commands received over the network.
- Both blocking buttons and controlling physical door
  release must be checked for life-safety requirements.
  Hardware independent emergency egress and APS overrides
  take priority over FBD dwell timers.

Special warning: a **combined access/security key** authorized
to disarm the blocking loop may both DISARM and grant access
on one presentation (§1.16.4). This bypass path conflicts with
unconditional 10-second cleanroom hold and must not be assumed
safe without restricting cards/roles and bench tests.

## Operator's proposed asymmetric cleanroom rule

**Policy still PROPOSED, NOT SITE-CONFIRMED:**

- **Dirty → cleaner zone:** strict 10-second local
  post-close dwell; no normal door access before timer.
- **Cleaner → dirtier zone:** permitted early return when
  the *other physical doors of the incident group remain
  fully closed*, if the specific sanitation/SOP risk
  assessment permits it. Log `EARLY_DIRTY_EXIT`, give
  short acoustic warning (distinct from 30 s OPEN-DOOR
  buzzer), and **restart full 10 seconds after this door
  closes** on its incident room(s).
- **Any actual simultaneous door opening:** prohibited
  in normal access. A door's emergency release is a separate
  functional-safety path.
- **Converging room 1252:** reverse access must not cause
  a transitive inhibit down an unrelated closed branch.
- **Only one physical reed** reports OPEN/CLOSED, not
  movement direction. Direction requires known authorized
  reader/button side, reliable egress event, or a separate
  direction/occupancy sensor. Do **not** infer which way a
  person crossed a door from that one reed.
- **A single physical two-wire lock cannot selectively
  permit cleaner → dirtier yet deny dirtier → cleaner**
  just by energizing its one release relay; separate
  authorization/interface or physical architectural
  measures are needed.

Potential logic interface (prototype signals ONLY):

```text
RoomHolding = AnyDoorOpen OR NOT TON10S(ALL_DOORS_CLOSED)
EarlyDirtyReturn = OperatorRequestFromCleanerSide
                   AND RoomHolding
                   AND AllOtherIncidentDoorsClosed
                   AND NOT FireFault
       // do not actuate real lock until hardware/egress reviewed

On (EarlyDirtyReturn AND VerifiedDoorPassage):
    RaiseWarning(temporary = true)
    Log(EARLY_DIRTY_EXIT)
    HoldTimers.ResetForIncidentRooms()

On (LastDoorClosed):
    HoldTimers.RestartFull10Seconds()

On (APS):
    IndependentApprovedEmergencyEgressOverridesNormalInhibits()
```

The `VerifiedDoorPassage` event must be chosen from real
hardware (button request and reed opening are not always
proof of crossing). The alarm should have selectable
duration/policy, and should never be confused with the
30-second prolonged-open-door buzzer.

### Integration status

`s2000-2-access-methods.js` is a read-only capability
evaluator comparing: `normal`, `access-closed`,
`tech-loop-reader-gate`, `armed-security-loop` and `busy`.
It flags impossible combinations (two independent holds on
one BUSY), fallacious release by restoring an armed loop,
unproven direction from a single reed, and blocked reverse
normal EXIT buttons.

**It does not generate physical lock commands or arm/disarm
commands** and changes neither the seven-door topology nor the
already confirmed symmetric 10-second policy.

Before coding the optional asymmetric policy, request
operator approval of per-door direction and whether
return into the less clean side is an allowed **normal**
procedure or only an exceptional/safety escape.
