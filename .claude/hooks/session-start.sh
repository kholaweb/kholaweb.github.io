#!/bin/bash
# Prépare les sessions Claude Code dans le cloud : paquets Python des outils de
# conversion et de vérification, et KaTeX (package.json) pour
# scripts/verifier-page.js.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

pip install --quiet --disable-pip-version-check --root-user-action=ignore \
  fonttools pillow lxml sympy pypandoc-binary

npm install --no-audit --no-fund
