#!/usr/bin/env bash
# 크랩피치 BYO AI — Claude / Codex / Gemini CLI 설치 후 로그인 창 실행
# 사용: bash crabpitch-byo-ai-setup.sh [claude|chatgpt|gemini|all]
set -euo pipefail

TARGET="${1:-all}"

need_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js가 필요합니다: https://nodejs.org (22+ 권장)"
    exit 1
  fi
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm이 필요합니다."
    exit 1
  fi
}

install_npm() {
  local pkg="$1"
  echo "→ npm install -g $pkg"
  npm install -g "$pkg"
}

run_login() {
  local name="$1"
  shift
  echo ""
  echo "=== $name 로그인 (브라우저 창이 열립니다) ==="
  "$@"
}

need_node

case "$TARGET" in
  claude)
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL https://claude.ai/install.sh | bash || install_npm @anthropic-ai/claude-code
    else
      install_npm @anthropic-ai/claude-code
    fi
    run_login "Claude Code" claude
    ;;
  chatgpt)
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL https://chatgpt.com/codex/install.sh | sh || install_npm @openai/codex
    else
      install_npm @openai/codex
    fi
    run_login "Codex (ChatGPT)" codex login
    ;;
  gemini)
    install_npm @google/gemini-cli
    run_login "Gemini" gemini
    ;;
  all)
    echo "세 CLI를 순서대로 설치·로그인합니다. (원치 않는 항목은 Ctrl+C)"
    "$0" claude || true
    "$0" chatgpt || true
    "$0" gemini || true
    ;;
  *)
    echo "Usage: $0 [claude|chatgpt|gemini|all]"
    exit 1
    ;;
esac

echo ""
echo "완료. 이후 크랩피치 웹의 「내 AI」에서 스킬 프롬프트를 복사해 CLI/앱에 붙여넣으세요."
