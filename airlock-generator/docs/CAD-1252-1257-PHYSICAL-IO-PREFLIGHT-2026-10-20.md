# Airlock CAD 1252–1257 — independent I/O preflight, no BUSY

**Date:** 20 October 2026. **Branch:** `feat/airlock-physical-io-preflight` (separate
from Codex native FBD work). This document is an **equipment CAPACITY worksheet**,
**not** an approved pinout, wiring instruction, vendor Owen Logic application,
safety certification, lock electrical scheme or commissioning plan.

## Confirmed physical topology

```text
                      CNC
                       |
                      1257
                    /      \
                  1256    1255
                   |        |
                  1254    1253
                    \      /
                       1252
```

Seven confirmed doors with ONE reed input and ONE logical normal
lock-permit output each. Rooms 1252–1257 contain six incident groups.
**1274 is parts storage, excluded.** All local airlock groups use
the operator-confirmed 10-second hold *after last door closes*.
The proposed dirty-side early return is *not* confirmed or included.

**Only the CNC–1257 entrance has an S2000-2 reader.** The operator selected
per-lock normal authorization gates instead of the physical shared
S2000-2 BUSY input. Therefore we explicitly model **BUSY DO = 0**.
In this architecture K1 of S2000-2 authorizes normal access in its own
external contact path; it is **NOT a PLC DI** unless optional K1
feedback via approved isolating wiring is separately requested.

The upstream fixture still contains a legacy
`busyContactToBolid=true` annotation; this worksheet does not reuse
it for the newer operator-selected lock-gate scenario.
Do not change the shared fixture before Codex reviews it.

## Engineering scenarios

| Item | One local button per non-SCUD door | Two local buttons per non-SCUD door |
| --- | ---: | ---: |
| Physical reeds | 7 DI | 7 DI |
| Local access request buttons | 6 DI | 12 DI |
| FireNormal (informational only) | 1 DI | 1 DI |
| ResetFault | 1 DI | 1 DI |
| **Total DI** | **15** | **21** |
| Logical normal lock-permit outputs | 7 relay DO | 7 relay DO |
| Door-specific red/green lamps via changeover | 7 relay DO | 7 relay DO |
| Shared buzzer | 1 relay DO | 1 relay DO |
| Bolid BUSY | **0** | **0** |
| **Total relay DO** | **15** | **15** |
| Requested design spare | 2 DI / 2 DO | 2 DI / 2 DO |
| **Required incl. spare** | **17 DI / 17 DO** | **23 DI / 17 DO** |

Optional isolated K1 monitor adds **1 DI**. A distinct common alarm
relay adds **1 DO**. Choosing one room-status lamp per zone (instead of
one per physical door) changes lamps from 7 to 6 but is **not** a door
permit indication; the user must select it explicitly.

**The actual number and orientation of physical buttons is pending site
inspection.** A local button per door is a planning scenario,
not a confirmed electrical installation. A second button or
reader on the S2000-2 channel may also affect wiring but is not
silently counted as an Owen DI. The on-device S2000 EXIT button
cannot be controlled as if it were an ordinary PR input without
an approved electrical integration design.

## Owen provisional 24 V selection

**Provisional first choice:** `PR102-24.2416.03.1 + PRM-1.24`:

- PR102 24 V `.03.1`: **16 regular DI**, **16 relay DO**,
  plus 8 AI deliberately *not counted as ordinary DI*;
- PRM-1.24: **8 DI / 8 relay DO**;
- combined capacity **24 DI / 24 relay DO**, subject to
  exact wiring, special groups, connector/power and vendor approval;
- with six local buttons: **9 DI / 9 DO** free before reserving 2 each;
- with twelve local buttons: **3 DI / 9 DO** free before reserving 2 each.

Manufacturer sources:
- OWEN PR102 exact variants: https://agriculture.owen.ru/product/pr102/modifications
- OWEN PRM-1 exact specifications: https://agriculture.owen.ru/product/prm1/specifications
- OWEN PR102 with **two expansion slots** and *internal PRM bus*:
  https://owen.ru/product/pr102

**PRM expansion is not an RS-485 peripheral bus.** Multiple separate
PR devices over Modbus RS-485 are a different design with per-zone
watchdogs, authority ownership and safe failure decisions. An
aggregate channel count is not evidence that a networked interlock
can safely close across controllers.

## New independently testable modules

- `cad-io-preflight.js`: read-only candidate-schema validator and
  I/O planner; rejects duplicate physical doors, misplaced zones,
  guessed physical terminals, forgotten S2000-2, implicit BUSY,
  unknown options and mismatched counts.
- `scripts/export-cad-io-preflight.js`: deterministic self-contained
  export of `IO-PREFLIGHT.json`, `IO-CHANNELS.csv` (UTF-8 with BOM),
  `IO-PLAN-RU.md`, and SHA256 manifest.
- `tests/cad-io-preflight.test.js` (14 scenarios);
  `tests/cad-io-preflight-export.test.js` (9 scenarios).
  Tests do **not** open serial ports or write any PLC.

Run **only from the parallel worktree** on HOME-PC:

```powershell
cd 'C:\Users\Forest\Documents\AirlockGeneratorBackup\io-preflight-parallel\airlock-generator'
node tests/cad-io-preflight.test.js
node tests/cad-io-preflight-export.test.js
node scripts/export-cad-io-preflight.js experimental/fixtures/real-cad-1252-1274-candidate.json C:\Users\Forest\Documents\AirlockGeneratorBackup\io-preflight-outputs\NEW-UNUSED-DIRECTORY
```

A second scenario uses `--buttons=2`; optional `--alarm`,
`--room-lamps` and `--k1-feedback` are supported. Exports
refuse to overwrite a directory or emit a fake `.owle`.

### Important outstanding decisions

1. Confirm **one or two local buttons** for each physical door and
   whether any separate local reverse passage request exists on CNC.
2. Confirm the **exact electric lock** and contact polarity; S2000-2 K1
   combined with the independent PLC grant must not block approved
   emergency escape or produce false access-event assumptions.
3. Decide lamp indication per door versus per room.
4. Confirm a separate **general alarm relay** is necessary;
   one shared buzzer already exists but does not replace an alarm DO.
5. Only after native `.owle` compilation, a physical terminal
   diagram and independent fire/egress tests may this become
   a field wiring/BOM plan.

**No physical device was touched. No current production .owle changed.
The parallel worktree is intentionally separate from Codex.**

## Дополнение: ранний арбитраж K1 (20.10.2026)

**Предыдущая таблица 15/21 DI является только расчётом каналов.** Если сигнал K1 остаётся лишь во внешней цепи штатного разрешения замка, ПР не знает о запросе CNC до срабатывания геркона. Поэтому ПР не сможет своевременно резервировать группу 1257, и нельзя утверждать безопасное взаимоисключение одновременных запросов на дверь CNC и смежную дверь.

Для полной логики предварительно включён **отдельный изолированный вход K1** (`--k1-feedback`). Тогда при лампах по каждой двери:
- 1 кнопка на каждую из 6 внутренних дверей: **16 DI / 15 DO**, свободно 8 DI и 9 DO на предварительно выбранной паре PR102 + PRM-1.
- 2 кнопки на каждую внутреннюю дверь: **22 DI / 15 DO**, свободно 2 DI и 9 DO.
- Без ламп, как в опыте Codex #28: **16 DI / 8 DO** при одной кнопке. Различие в количестве DO не означает противоречия.
- АПС-норма и сервисный сброс по одному DI уже учтены. Сигнал `DATA_HEALTHY` не считается дополнительным физическим DI. BUSY = 0.

**Изоляция K1 не проверена.** Не подключать K1 напрямую параллельно силовой цепи или к входу ПР без подтверждённой контактной схемы. Длительность импульса K1 должна позволять детектировать фронт в цикле ПР; требуется испытание пропусков, зависших уровней и повторных запросов. Нормальный доступ по-прежнему разрешается только при одновременных K1 и независимом разрешении ПР. Аварийное освобождение остаётся отдельным аппаратным контуром.

Проверенные варианты без изменений реального оборудования:

```powershell
node scripts/export-cad-io-preflight.js experimental/fixtures/real-cad-1252-1274-candidate.json C:\Users\Forest\Documents\AirlockGeneratorBackup\io-preflight-outputs\NEW-16DI-K1 --k1-feedback
node scripts/export-cad-io-preflight.js experimental/fixtures/real-cad-1252-1274-candidate.json C:\Users\Forest\Documents\AirlockGeneratorBackup\io-preflight-outputs\NEW-22DI-K1 --buttons=2 --k1-feedback
```

Имена `NEW-...` должны обозначать **несуществующие** каталоги. Контроль целостности экспорта — `MANIFEST-SHA256.json`. Метки слотов `DIxx/DOxx` абстрактные; штатных адресов Owen Logic и номеров клемм этот модуль не назначает.

Пользователь отдельно разрешил ST как возможную реализацию исполнительной логики (Issue #28). Этот документ остаётся только ведомостью каналов; FBD/ST-программа, нативная компиляция, электросхема и испытания на реальном ПР не входят в его область.
