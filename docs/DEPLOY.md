# 완전 라이브 배포 런북 (Convex + Vercel)

프론트는 **Vercel**, 백엔드는 **Convex Cloud**. 아래 순서대로 하면 로그인·데이터·매칭까지
동작하는 완전한 라이브가 됩니다. (⭐ 표시는 사용자 계정 로그인이 필요한 단계 — 대신 실행 불가)

---

## 0. 준비

```bash
pnpm install
```

## 1. Convex 백엔드 연결 ⭐

```bash
npx convex dev
```
- 브라우저로 **Convex 로그인**(GitHub/Google) → 프로젝트 생성(예: `crabpitch`).
- `.env.local`에 `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`이 자동 기록됩니다.
- 스키마·함수가 dev 배포에 푸시됩니다. (이 창은 켜둔 채 로컬 개발 가능)

## 2. Google 로그인(OAuth) 설정 ⭐ (로그인 동작에 필수)

로그인은 **Google 로그인으로 통일**되어 있습니다. 두 가지를 설정합니다.

### 2-1. Convex Auth 키
```bash
npx @convex-dev/auth
```
- dev 배포에 `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` 을 생성/설정합니다.
- 로컬 테스트 시 `SITE_URL`은 보통 `http://localhost:3000`.

### 2-2. Google OAuth 클라이언트
1. [Google Cloud 콘솔](https://console.cloud.google.com/apis/credentials) → **OAuth 2.0 클라이언트 ID**(웹 애플리케이션) 생성.
2. **승인된 리디렉션 URI**에 Convex 콜백 추가:
   `https://<deployment>.convex.site/api/auth/callback/google`
   (`<deployment>`는 Convex 대시보드의 배포 이름 — dev/prod 각각 추가.)
3. 발급된 ID/시크릿을 **Convex 배포 환경변수**로 설정(`.env.local` 아님):
```bash
npx convex env set AUTH_GOOGLE_ID <client-id>
npx convex env set AUTH_GOOGLE_SECRET <client-secret>
```

## 3. 로컬 확인

```bash
pnpm dev            # http://localhost:3000
```
가입/로그인 후 대시보드 **"데모 데이터 생성"** 버튼으로 기자 온톨로지 + 데모 캠페인을 시드하세요.

---

## 4. 프로덕션 Convex 배포 ⭐

```bash
npx convex deploy       # 프로덕션 배포 생성/갱신
```
Convex 대시보드(Settings → URL & Deploy Key)에서:
- **프로덕션 배포 URL** 확인 (Vercel이 빌드시 자동 주입하므로 수동 입력 불필요)
- **Production Deploy Key** 발급 → 복사 (다음 단계 Vercel 환경변수)

프로덕션에도 Auth 키 + Google OAuth 값이 필요하므로:
```bash
npx @convex-dev/auth --prod
npx convex env set AUTH_GOOGLE_ID <client-id> --prod
npx convex env set AUTH_GOOGLE_SECRET <client-secret> --prod
# SITE_URL 은 Vercel 도메인으로 (6단계에서 확정 후 설정)
```
그리고 Google Cloud 콘솔의 OAuth 클라이언트 **승인된 리디렉션 URI**에 프로덕션 콜백도 추가:
`https://<prod-deployment>.convex.site/api/auth/callback/google`

## 5. Vercel 배포 ⭐

**방법 A — GitHub 연동(권장, push마다 자동 배포):**
1. vercel.com → **Add New → Project** → 이 저장소(`contentscoin/crabpitch`) 임포트.
2. **Environment Variables**에 추가 (Production + Preview 권장):
   - `CONVEX_DEPLOY_KEY` = Convex 대시보드 → Settings → **URL & Deploy Keys** → **Production Deploy Key**
3. Build Command는 `vercel.json`에 설정됨:
   - `CONVEX_DEPLOY_KEY` 있음 → `npx convex deploy --cmd 'pnpm build'`
   - 없음(Preview 등) → `pnpm build` 만 (Convex는 이미 배포된 프로덕션 URL 사용)
   → Production/Preview 환경변수에 `CONVEX_DEPLOY_KEY`를 넣으면 빌드마다 Convex도 갱신됩니다.
4. **Deploy**.

### 플랫폼 관리자 (`/admin`)
```bash
npx convex env set ADMIN_EMAILS 'your@email.com' --prod
```
해당 Google 로그인 이메일이면 사이드바에 **관리자**가 나타나고, 사용자 플랜·MCP 키·연동 현황을 볼 수 있습니다.
프로필 플래그 `isPlatformAdmin`으로도 추가 관리자를 지정할 수 있습니다.

### Cursor Cloud Agent용
에이전트가 `npx convex deploy`를 돌리려면 **같은 키**를 Cursor 환경 시크릿에 넣으세요.

1. [Cloud Agents 환경](https://cursor.com/dashboard/cloud-agents) → 이 워크스페이스 환경
2. Secrets에 `CONVEX_DEPLOY_KEY` = `prod:…` 추가
3. **새 에이전트 실행**으로 시크릿이 주입되게 함 (이미 돌 중인 런에는 안 붙을 수 있음)

에이전트는 Convex 대시보드에 로그인할 수 없으므로, **키 발급은 사용자만** 가능합니다.

**방법 B — CLI:**
```bash
npm i -g vercel
vercel link
vercel env add CONVEX_DEPLOY_KEY production   # Production Deploy Key 입력
vercel --prod
```

## 6. Auth 콜백 도메인 고정 ⭐

배포 도메인 확정 후(예: `https://crabpitch.vercel.app`):
```bash
npx convex env set SITE_URL https://crabpitch.vercel.app --prod
# MCP 스니펫 호스트는 SITE_URL이 아니라 Convex 자동 CONVEX_SITE_URL(.convex.site)
```
→ Google OAuth 등 콜백/리다이렉트가 프로덕션 도메인과 일치하게 됩니다.

---

## 선택: 실 통합 배선

`.env.example` 참고. 미설정 시 데모 시드로 동작합니다.

| 변수 | 용도 |
|---|---|
| `OPENCRAB_API_URL` / `OPENCRAB_API_KEY` | 기자 온톨로지. MCP는 `URL=https://opencrab.sh/api/mcp` + `KEY=ocm_…`. HTTP는 기존 POST+Bearer |
| `ANTHROPIC_API_KEY` | (선택) 보도자료·메일 AI 개인화. 없으면 템플릿 유지 |
| `GMAIL_OAUTH_CLIENT_ID` / `GMAIL_OAUTH_CLIENT_SECRET` | (선택) Gmail BYO. **없으면 `AUTH_GOOGLE_*` 폴백**. 콜백: `https://<deployment>.convex.site/gmail/callback` |

프로덕션 일괄 설정 스크립트: `scripts/set-prod-integrations.sh`  
(`CONVEX_DEPLOY_KEY` + `OPENCRAB_API_KEY` export 후 실행)

Agency REST (Agency 플랜 + `/agency`에서 `cp_live_…` 키 발급):

| Method | Path | 설명 |
|---|---|---|
| GET/POST | `https://<deployment>.convex.site/api/v1/clients` | 클라이언트 목록/생성 |
| GET | `…/api/v1/campaigns?clientId=` | 캠페인 목록 |
| POST | `…/api/v1/press-releases` | 보도자료+캠페인 (`clientId`, `title`, `body`) |

### 유저 MCP (유료 Solo/Growth/Agency)

앱 `/ai`에서 `cp_mcp_…` 키 발급. Free는 발급·호출 거부.

| Method | Path | 설명 |
|---|---|---|
| GET/POST/OPTIONS | `https://<deployment>.convex.site/api/mcp` | Bearer `cp_mcp_…` JSON-RPC |
| GET/POST/OPTIONS | `…/api/mcp/cp_mcp_…` | URL에 키 포함 (Cursor/Claude Desktop) |

도구: `crabpitch_status`, `crabpitch_match_journalists`, `crabpitch_email_template`, `crabpitch_classify`.  
설정 가이드: `docs/MCP-SETUP.md`

> Convex 액션에서 쓰는 서버 시크릿은 `npx convex env set KEY value --prod` 로 Convex 배포에 설정합니다.

---

## 체크리스트

- [ ] `npx convex dev` — dev 배포 + `.env.local`
- [ ] `npx @convex-dev/auth` — Auth 키(dev)
- [ ] Google OAuth 클라이언트 생성 + dev 콜백 URI 등록
- [ ] `convex env set AUTH_GOOGLE_ID/SECRET` (dev)
- [ ] 로컬 Google 로그인 + 데모 시드 확인
- [ ] `npx convex deploy` — 프로덕션 배포
- [ ] `npx @convex-dev/auth --prod` + `AUTH_GOOGLE_*` (prod) + prod 콜백 URI 등록
- [ ] Vercel `CONVEX_DEPLOY_KEY` 환경변수 + Deploy
- [ ] `convex env set SITE_URL <vercel-domain> --prod`
- [ ] `OPENCRAB_API_URL` / `OPENCRAB_API_KEY` (prod) — `scripts/set-prod-integrations.sh` 또는 PowerShell `$env:…`
- [ ] Google OAuth에 `https://<prod>.convex.site/gmail/callback` 추가 (`AUTH_GOOGLE_*` 폴백 사용 시)
- [ ] `curl https://<prod>.convex.site/health` → `opencrab`/`gmailOAuth`/`mcp` 확인
- [ ] 유료 플랜 → `/ai` MCP 키 발급 → Cursor `mcp.json` 연결 스모크
- [ ] 앱 설정 → 서버 연동 상태 · OpenCrab 동기화 테스트
