#!/usr/bin/env bash
# Vercel 빌드 진입점.
#
# Convex 배포를 언제 함께 실행할지 결정한다. 프로덕션 Deploy Key(prod:…)로
# Preview를 빌드하면 Convex CLI가 거부하며 빌드 전체가 실패한다:
#   ✖ Detected a non-production build environment and "CONVEX_DEPLOY_KEY"
#     for a production Convex deployment.
# 그래서 키의 종류와 VERCEL_ENV를 함께 보고 분기한다.
set -euo pipefail

BUILD_CMD="pnpm build"

if [[ -z "${CONVEX_DEPLOY_KEY:-}" ]]; then
  echo "→ CONVEX_DEPLOY_KEY 없음: Next.js만 빌드"
  exec $BUILD_CMD
fi

# Preview Deploy Key는 Preview 빌드에서 Convex preview 배포를 만들 수 있다.
if [[ "$CONVEX_DEPLOY_KEY" == preview:* ]]; then
  echo "→ Preview Deploy Key: Convex preview 배포 + 빌드"
  exec npx convex deploy --cmd "$BUILD_CMD"
fi

if [[ "${VERCEL_ENV:-}" == "production" ]]; then
  echo "→ Production: Convex prod 배포 + 빌드"
  exec npx convex deploy --cmd "$BUILD_CMD"
fi

# 프로덕션 키 + 비프로덕션 빌드(Preview/Development) → Convex 배포는 건너뛴다.
# 프런트엔드는 .env.production 의 NEXT_PUBLIC_CONVEX_URL(프로덕션)로 붙는다.
echo "→ ${VERCEL_ENV:-unknown} 빌드 + 프로덕션 키: Convex 배포 건너뛰고 Next.js만 빌드"
exec $BUILD_CMD
