#!/usr/bin/env bash
# Airlock Generator/Codex Cloud: unprivileged, no PLC and no network secrets.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "AIRLOCK_CODEX_SETUP pwd=$PWD"
command -v git >/dev/null || { echo "ERROR git is required"; exit 2; }
command -v node >/dev/null || { echo "ERROR Node.js >=22 is required"; exit 2; }
node -e 'if(+process.versions.node.split(".")[0]<22) process.exit(2); console.log("Node "+process.version)'
command -v python3 >/dev/null || { echo "ERROR Python3 required for read-only serial mock tests"; exit 2; }
python3 - <<'PY'
import sys
print("Python",sys.version.split()[0])
assert sys.version_info >= (3,10), "Python >= 3.10 required"
PY
# Check-only: serial worker tests inject a fake pymodbus module, never open COM.
# DO NOT install hardware dependencies or scan networks in Codex Cloud.
echo "AIRLOCK_CODEX_SETUP_PASS"
