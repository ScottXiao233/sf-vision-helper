#!/bin/bash
set -euo pipefail

ENV_FILE="$HOME/.claude/private/sf-vision.env"

if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  {
    printf 'export SILICONFLOW_API_KEY=%q\n' "${SILICONFLOW_API_KEY:-}"
    printf 'export SILICONFLOW_BASE_URL=%q\n' "${SILICONFLOW_BASE_URL:-https://api.siliconflow.cn/v1}"
  } >> "$CLAUDE_ENV_FILE"
fi

exit 0
