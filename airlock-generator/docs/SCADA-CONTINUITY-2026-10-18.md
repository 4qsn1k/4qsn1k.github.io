# SCADA PROJECT CONTINUITY — 18.10.2026

The generator now has `AirlockProjectPackage.build(model)` and two toolbar actions: **SCADA проекта** (opens same-origin `scada.html` using the current project in sessionStorage) and **Скачать проект SCADA** (portable schema `airlock-scada-project/1`).

`scada.html` supports arbitrary imported room/door topology, tabs Plan / Controllers / Signals / Guide, a Modbus address binding form, export of `airlock-connection.json`, local live status and clearly labeled offline preview.

Read-only local server `gateway/server.js` binds **127.0.0.1:8787**, reads profile locally, polls TCP Modbus FC01/02/03/04 only, rejects writes, exposes `/api/project` and `/api/status`. It only understands genuine Modbus TCP MBAP (direct compatible devices or an active Modbus TCP↔RTU gateway). Simple transparent raw RS485-over-TCP bridges do **not** work. PR100/PR200 first generation generally require RS485 Modbus RTU Slave and appropriate translator. No addresses were fabricated.

HOME-PC: `tests/scada-gateway.test.js` **15/15 PASS**, `npm run check` **PASS**, Firefox headless screenshot actually showed all six example rooms and eight doors as UNKNOWN, with no PLC connection. Local Node mock Modbus server produced valid responses through real TCP socket to JSON HTTP SCADA service. **Real PLC connectivity NOT TESTED.**

Critical screen semantics: no response, expired frame, no FireNormal, no GreenPermit or missing one shared zone => never show green. The browser makes NO PLC commands; HTTP service serves only GET and does not write to Modbus.

Documentation: [SCADA-PLC-CONNECTION.md](SCADA-PLC-CONNECTION.md). Physical controller attachment is a **separate commissioning gate**, do not program production equipment for this check. QA-OL-006 PASS and QA-OL-012 native software integration PASS are unchanged; they are not re-tested by this work.
