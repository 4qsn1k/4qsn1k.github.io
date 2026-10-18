# QA-OL-012 — HOME-PC native FBD acceptance, 2026-10-18

**Scope:** software-only **integrated** execution of `FB_Room_N1` and `FB_Room_N4` inside Owen Logic 3.3.378.0, on the actual FBD. No physical PR, lock, interlock, APS, ventilation or actual door was tested or changed.

## Acceptance summary

| Evidence | Result | Interpretation |
| --- | --- | --- |
| Native OWLE structure | **PASS** | 25 FBD elements, 16 native ConnectorModels, 16/16 verified real port-to-port mappings. |
| One physical-reed model source for door 1–4 | **PASS** | Virtual `I4` feeds both room blocks. |
| Native OR shared inhibit | **PASS** | `N1.Output8 OR N4.Output7 -> Q4`. `Q4` is a *virtual software signal*, not physical lock output. |
| Native simulator | **PASS** | Owen Logic Shift+F5, F6, F8 and F10, two live ST instances and actual FBD paths observed. |
| QA-OL-012A | **PASS** | N1 PURGE/30, N4 READY/10, Q4=1. |
| QA-OL-012B | **PASS** | Open only N4 door 3–4: N1 READY, N4 OPEN/20, Q4=1. On closing Q4=0. |
| QA-OL-012C | **PASS** | Both READY/10, Q1=1, Q2=1, Q4=0. |
| QA-OL-012D | **PASS** | Shared I4 opens: both OPEN/20, other door-block requests asserted. |
| QA-OL-012E | **PASS, observed time window** | Shared I4 closes: N4 READY, N1 PURGE, Q4=1; later N1 READY, Q4=0. |
| QA-OL-012F | **PASS** | FireNormal=0: both FIRE/99, O_Fire=1, software block requests=0, Q4=0. |
| Timer boundary | **PASS within ~2 s observation window** | N1 PURGE/Q4=1 near 29 s simulated time; N1 READY/Q4=0 near 31 s. Configured simulation cycle 100 ms; faster F10 key sequences may skip individual inputs. Do **not** claim ±100 ms timing precision. |
| GitHub Actions | **PASS** | [CI workflow run #39116025655](https://github.com/4qsn1k/4qsn1k.github.io/actions/runs/39116025655) (success) for evidence commit `08c0f1b4a7dea4fec9157ce7e9fba35c0aa3cf7d`. |
| Independent compiler diagnostics | **NOT CAPTURED** | Native simulator executed the two ST FB instances, but no separate clean compiler log was produced. Official Owen Logic 3.3 user guide describes simulator as the offline functional validation path; no independent offline build command is documented. Never substitute programming a PLC. |
| Real-life equipment | **NOT TESTED** | Installation, wiring, power-loss, fire escape, actual air purge / 15 Pa pressure, and SCUD/Modbus require separate approved tests. |

## Preserved evidence

Read-only checker: [`../bridge/qa012_verify_native_fbd.ps1`](../bridge/qa012_verify_native_fbd.ps1), returned `QA012_NATIVE_CONNECTOR_PORTMAP_PASS` exit 0 on HOME-PC test file SHA256 `0E3F85BFC198AA298EBAC5068E76B5C0408CB4590FAEE9530E74559A1A167A00`.

[Detailed test operations and timestamps](QA-OL-012-HOME-RUNTIME-2026-10-18.md).

[Native HOME-PC screenshots (11 files)](evidence/qa-ol-012-home-20261018) include shared-door opening, both READY, N4-only opening, fire signal, and N1 timer before/after transition.

Original test OWLE backed up separately: `Airlock_FBD_QA012_HOME_before_20261018.owle`; SHA256 `55684A7F6E6C268DB8959D1F39D8DFE9B127EE454633BF08E9CA2F520A1218F9`. All image evidence comes from TEST GUI. No controller programmed.

## Scope of sign-off

**QA-OL-012 software integration functional tests A–F: PASS** with timer observation window ±approximately 1 s around target (29–31 s). **Native standalone compiler-log verification: NOT AVAILABLE/NOT CAPTURED. Physical commissioning: NOT AUTHORIZED/NOT DONE.**

The native OR Q4 is a logical shared **inhibit**; it is not the final common-door green permit. That distinct signal, fire/manual-reset behavior, power-loss response, hardware output mapping, and supervisory sensor-fault cases must be designed and qualified separately before deployment.

QA-OL-006 remains PASS and was not repeated. HOME-PC remains primary; Z4559 remains reserve. Keep PR in draft until reviewed.
