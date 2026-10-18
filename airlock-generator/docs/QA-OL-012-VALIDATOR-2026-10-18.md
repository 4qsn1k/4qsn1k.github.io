# QA-OL-012 — Portable OWLE verifier, 18.10.2026

Read-only file: [`../bridge/qa012_verify_native_fbd.ps1`](../bridge/qa012_verify_native_fbd.ps1).

Actual HOME-PC execution (Owen Logic 3.3.378 saved test `Airlock_FBD_QA012_HOME.owle`), exit code **0**:

```json
{"result":"QA012_NATIVE_CONNECTOR_PORTMAP_PASS","scope":"OWLE_STRUCTURE_ONLY_NOT_SIMULATION","elements":25,"connectors":16,"matched":16,"hash":"0E3F85BFC198AA298EBAC5068E76B5C0408CB4590FAEE9530E74559A1A167A00","nativeScenariosVerified":false}
```

All 16 expected wire port pairs match. One common test input `I4` reaches both room FBs. `FB_Room_N1.Output8` and `FB_Room_N4.Output7` connect through the native `OR` to test `Q4`. There are no unknown/dangling endpoints.

GitHub Actions [Airlock Generator QA run #39112563846](https://github.com/4qsn1k/4qsn1k.github.io/actions/runs/39112563846): completed/success for commit `ce66a4396ccc761068a01d3a975fd516e72fe7a2`.

**QA-OL-012 overall: IN PROGRESS.** File-structure validation and CI are not a substitute for native runtime scenarios QA-OL-012A–F, compiler diagnostics, timer validation, or any real controller tests. No actual PR/SCUD hardware was modified.
