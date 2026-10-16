#!/usr/bin/env bash
# Reproducible non-hardware validation, for Codex cloud or any clone.
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/codex-setup.sh
node --check st-generator.js
node --check st-testbench.js
node --check project-wiring.js
node --check project-wiring-ui.js
node --check bridge/headless-qa.js
node tests/st-generator.test.js
node tests/project-wiring.test.js
node tests/pressure-and-interlocks.test.js
node tests/hmi.test.js
node tests/snap.test.js
node bridge/headless-qa.js --out ./qa-reports
echo 'CODEX_MODEL_QA_PASS (independent JS model, not Owen Logic)'
