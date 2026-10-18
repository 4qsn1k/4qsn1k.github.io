#!/usr/bin/env bash
# Complete deterministic offline suite; includes TCP socket simulator, fake RS485 worker and event tests.
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/codex-setup.sh
# npm test uses 'python' executable. On Linux codex images python3 may be the only name.
if ! command -v python >/dev/null; then
  temp_bin="$(mktemp -d)"
  trap 'rm -rf "$temp_bin"' EXIT
  ln -s "$(command -v python3)" "$temp_bin/python"
  export PATH="$temp_bin:$PATH"
fi
npm run check
echo "AIRLOCK_CODEX_FULL_OFFLINE_QA_PASS (JS/Modbus-mock only; NOT Owen Logic or real PLC)"
