#!/usr/bin/env bash
# Codex environment setup for airlock-generator. No secrets and no deployments.
set -euo pipefail
cd "$(dirname "$0")/.."
printf 'AIRLOCK_SETUP repo=%s\n' "$(pwd)"
if ! command -v node >/dev/null; then
  echo 'Node.js >=22 is required; configure Node.js 22 in the Codex environment.' >&2
  exit 1
fi
node -e 'const major = Number(process.versions.node.split(".")[0]);if (major < 22) {console.error("Node >=22 required");process.exit(1)}; console.log("Node",process.version)'
if ! command -v git >/dev/null; then
  echo 'git command is required' >&2
  exit 1
fi
echo 'Setup OK: all JS test scripts have zero third-party package dependencies.'
echo 'Run: bash scripts/codex-check.sh'
