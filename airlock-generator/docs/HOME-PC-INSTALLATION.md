# HOME-PC — Owen Logic 3.3.378 installed and verified

**Date:** 2026-10-17, approximately 09:10–09:18 Europe/Moscow.  
**Scope:** Independent offline development and simulation machine for Airlock Generator.  
**Hardware PLC:** NOT connected or programmed.

## Installed / verified

| Component | Result |
|---|---|
| Operating system | Windows 11 Pro, x64 |
| Administrative permissions | Verified available at installation time |
| Microsoft .NET Framework | 4.8 present |
| Microsoft Visual C++ 2015–2022 | Present (x64 and x86) |
| Microsoft .NET Desktop Runtime | **6.0.36 installed**, WindowsDesktop.App 6.0.36 registered; .NET 8 preserved |
| Owen Logic | **3.3.378.0 installed**, official vendor setup returned exit code 0 |
| Git / Node.js / Python | Already installed, retained |
| Owen Logic shortcut | Present on HOME-PC desktop |
| Project Git checkout and ZIP backup | Created before installation and retained |

The **Owen Logic installed location** is per-user under
`%LOCALAPPDATA%\Programs\Owen\Owen Logic\`, **not** `C:\Program Files`.
This explains why an initial script falsely reported `OWEN_EXE_NOT_FOUND_AFTER_SETUP` despite successful installation.

### Verified installers

- Owen Logic 3.3.378: official `ftp-ow.owen.ru/softupdate/OWEN%20Logic/Setup/Archive/Setup_OwenLogic_3.3.378.exe`. SHA-256 `cf1890e160c1366c8e76572c6d386c54e6a54af1b57c44252850b2556172d119`. Windows Authenticode **Valid**, signer *Owen Digital Solutions LLC*.
- .NET Desktop Runtime 6.0.36 x64: `builds.dotnet.microsoft.com/dotnet/WindowsDesktop/6.0.36/windowsdesktop-runtime-6.0.36-win-x64.exe`. SHA-256 `0d20debb26fc8b2bc84f25fbd9d4596a6364af8517ebf012e8b871127b798941`. Windows Authenticode **Valid**, signer *Microsoft Corporation*.
- .NET Desktop Runtime installer exit code **0** and installed runtime verified by `dotnet --list-runtimes`.
- No restart performed.

**Support notice:** .NET 6 is out of Microsoft support. It was installed solely for the current Owen Logic dependency; keep it isolated from Internet-facing services and revisit with a newer vendor-supported runtime when available.

## Test-only project transfer

Two separate test copies were transferred **directly from Z4559 to HOME-PC**, without publishing the binary .owle files to GitHub. Transfer integrity confirmed with SHA-256, ZIP CRC and required `Project`/`StFunctionBlocks` entries.

| Project | Bytes | SHA-256 |
|---|---:|---|
| `Airlock_SIMULATION_TEST.owle` | 12,658 | `33e5dd2cd02d49c28a1fa429c4ea50329791b33645d1e356dd48cbbf8c8e9284` |
| `Airlock_FBD_PROBE_ONLY.owle` | 24,574 | `55684a7f6e6c268db8959d1f39d8dfe9b127ee454633bf08e9ca2f520a1218f9` |

On HOME-PC: `%USERPROFILE%\Documents\AirlockGeneratorBackup\owen-tests\`.

## Actual native GUI launch

`ProgramRelayFBD.exe` launched successfully with `Airlock_SIMULATION_TEST.owle`:

- Version `3.3.378.0`.
- `ProgramRelayFBD.exe` running in Windows interactive session 1.
- Window title contains `Airlock_SIMULATION_TEST.owle` at the expected HOME-PC test path.
- Windows UI Automation located the correct root window and enumerated 97 descendants.
- The project was opened from the separate test copy; the original Z4559 project was not modified.

**Not yet verified on HOME-PC:** compilation of ST/FBD, a complete end-to-end simulator run, remote input mutation through `owen-bridge.ps1`, and the shared-door FBD wiring. Existing independent Owen Logic simulation PASS results were obtained earlier on Z4559.

## Automated tests on HOME-PC

Executed from the cloned `airlock-generator` directory:

```cmd
npm test
node bridge\headless-qa.js
```

- **34/34 unit tests PASS**, including native FBD fixture *structure* checks.
- **8/8 headless reference-model tests PASS** (twice, once inside npm test and once standalone).
- Exit code **0**.
- JSON reports created in `airlock-generator\qa-reports\` and `airlock-generator\bridge\reports\`.

These are tests of the JS model, not native Owen Logic or a physical controller.

## Local artifacts

- Project: `%USERPROFILE%\Documents\AirlockGeneratorBackup\repo\airlock-generator\`
- ZIP backup: `AirlockGenerator_2026-10-17.zip` in the backup root.
- Installer files: `installers\`, with corresponding Windows code-signature validation.
- Installation log: `INSTALL-OWEN-20261017.log`.
- Test files: `owen-tests\` (plus transfer manifest and decoder script).
- Original commissioning `.owle` and real equipment: **untouched**.

## Next project work

1. Continue QA-OL-012: real GUI-created inter-block FBD connectors and OR for shared door 1–4.
2. Verify native compilation and simulation of both blocks on Z4559 and HOME-PC.
3. Add positive end-to-end tests for dual-zone inhibition and door-specific green permissive.
4. Agree safety behavior after fire release; physical egress and S2000-2 BUSY are not covered by model tests.
