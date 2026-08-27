#!/usr/bin/env bash
# Stop hook: after a turn that touched the repo, check whether CLAUDE.md and
# .github/copilot-instructions.md are still an accurate summary of the
# project and update them if not. Both files carry equivalent content for
# Claude Code and GitHub Copilot respectively.
#
# Guarded so it only runs when something actually changed since the last
# check (state hash) and never recurses into itself (--safe-mode disables
# hooks for the spawned headless session).
set -u

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

command -v git >/dev/null 2>&1 || exit 0
command -v claude >/dev/null 2>&1 || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

EXCLUDES=(':!CLAUDE.md' ':!.claude' ':!.github/copilot-instructions.md')

DIFF=$(git diff HEAD -- . "${EXCLUDES[@]}" 2>/dev/null)
UNTRACKED_FILES=$(git ls-files --others --exclude-standard -- . "${EXCLUDES[@]}" 2>/dev/null)

if [ -z "$DIFF" ] && [ -z "$UNTRACKED_FILES" ]; then
  exit 0
fi

UNTRACKED_CONTENT=$(printf '%s\n' "$UNTRACKED_FILES" | xargs -I{} cat {} 2>/dev/null)
HASH=$(printf '%s' "$DIFF$UNTRACKED_CONTENT" | shasum -a 256 | cut -d' ' -f1)

STATE_DIR=".claude"
STATE_FILE="$STATE_DIR/.claude-md-review-state"
mkdir -p "$STATE_DIR"

if [ -f "$STATE_FILE" ] && [ "$(cat "$STATE_FILE" 2>/dev/null)" = "$HASH" ]; then
  exit 0
fi

echo "$HASH" > "$STATE_FILE"

PROMPT='Eres un mantenedor de documentación de este repositorio (GitOps, SvelteKit). Hay dos ficheros de contexto para asistentes de IA que deben decir lo mismo, cada uno en su propio formato: CLAUDE.md (raíz, para Claude Code) y .github/copilot-instructions.md (para GitHub Copilot). Ambos documentan arquitectura, comandos, RBAC, seguridad y una sección de "Problemas conocidos". Ejecuta `git diff HEAD -- . '"'"':!CLAUDE.md'"'"' '"'"':!.claude'"'"' '"'"':!.github/copilot-instructions.md'"'"'` y `git status --porcelain` para ver qué ha cambiado desde el último commit, incluyendo ficheros nuevos. Lee los dos ficheros. Si el cambio introduce algo relevante que deberían reflejar y no reflejan (nuevo módulo o servicio, cambio de arquitectura o del modelo de persistencia, nuevo comando de build/test, un endpoint o comportamiento roto digno de "Problemas conocidos", un patrón de seguridad nuevo, o algo que contradiga lo ya documentado), edita AMBOS ficheros para añadir o corregir esa parte, manteniendo el idioma (español) y el formato/nivel de detalle que cada uno ya tiene (CLAUDE.md es más extenso y con más tablas; copilot-instructions.md es una versión más compacta del mismo contenido). No reescribas secciones que siguen siendo correctas ni dupliques exactamente el mismo texto en los dos, solo mantenlos equivalentes en la información. Si no hay nada que amerite un cambio, no edites nada y no expliques por qué.'

(
  claude -p "$PROMPT" \
    --model claude-haiku-4-5-20251001 \
    --permission-mode acceptEdits \
    --allowedTools "Read,Edit(CLAUDE.md),Edit(.github/copilot-instructions.md),Bash(git diff:*),Bash(git status:*),Bash(git log:*),Grep,Glob" \
    --safe-mode \
    --no-session-persistence \
    >/dev/null 2>&1 &
)

exit 0
