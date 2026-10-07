#!/bin/bash
# Prépare les sessions Claude Code dans le cloud : paquets Python des outils de
# conversion et de vérification, KaTeX (package.json) pour
# scripts/verifier-page.js, et puppeteer-core, hors du dépôt, pour
# scripts/verifier-mise-en-page.js et scripts/verifier-schema.js.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

pip install --quiet --disable-pip-version-check --root-user-action=ignore \
  fonttools pillow lxml sympy pypandoc-binary

npm install --no-audit --no-fund

# puppeteer-core n'est pas une dépendance du site : on l'installe à part, et on
# le rend visible par NODE_PATH. Le navigateur est le Chromium du conteneur.
OUTILS="$HOME/kholaweb-outils"
mkdir -p "$OUTILS"
[ -f "$OUTILS/package.json" ] || echo '{"private": true}' > "$OUTILS/package.json"
npm install --prefix "$OUTILS" --no-audit --no-fund puppeteer-core

# Le conteneur tourne sous root, et Chromium refuse alors de démarrer sans
# --no-sandbox ; ce lanceur l'ajoute sans toucher aux scripts.
cat > "$OUTILS/chromium" << 'LANCEUR'
#!/bin/sh
exec /opt/pw-browsers/chromium --no-sandbox "$@"
LANCEUR
chmod +x "$OUTILS/chromium"

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export NODE_PATH=\"$OUTILS/node_modules\"" >> "$CLAUDE_ENV_FILE"
  echo "export CHROME=\"$OUTILS/chromium\"" >> "$CLAUDE_ENV_FILE"
fi
