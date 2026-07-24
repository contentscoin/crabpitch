#!/usr/bin/env bash
# 프로덕션 Convex 통합 env 설정.
# 필요: CONVEX_DEPLOY_KEY (또는 로그인된 `npx convex` + --prod)
#
# 사용:
#   export CONVEX_DEPLOY_KEY=...
#   export OPENCRAB_API_KEY=ocm_...   # 채팅에 붙이지 말고 로컬에서만
#   bash scripts/set-prod-integrations.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${CONVEX_DEPLOY_KEY:-}" ]]; then
  echo "CONVEX_DEPLOY_KEY 가 없습니다. Convex 대시보드 → Production Deploy Key 를 export 하세요."
  echo "예: export CONVEX_DEPLOY_KEY='prod:....'"
  exit 1
fi

OPENCRAB_API_URL="${OPENCRAB_API_URL:-https://opencrab.sh/api/mcp}"
if [[ -z "${OPENCRAB_API_KEY:-}" ]]; then
  echo "OPENCRAB_API_KEY 를 export 하세요 (ocm_… MCP 키)."
  exit 1
fi

echo "→ OPENCRAB_API_URL=$OPENCRAB_API_URL"
npx convex env set OPENCRAB_API_URL "$OPENCRAB_API_URL" --prod
npx convex env set OPENCRAB_API_KEY "$OPENCRAB_API_KEY" --prod

echo "→ Gmail: AUTH_GOOGLE_* 폴백 사용 (코드). Google 콘솔에 콜백만 추가하세요:"
echo "   https://aromatic-shepherd-215.convex.site/gmail/callback"
echo "   (배포 이름이 다르면 Convex 대시보드의 .convex.site 호스트로 교체)"
echo
echo "ANTHROPIC_API_KEY 는 설정하지 않음 (템플릿 초안 유지)."
echo "완료."
