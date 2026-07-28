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
| `OPENCRAB_API_URL` / `OPENCRAB_API_KEY` | 기자 온톨로지 + **기자단 팩 동기화**. MCP는 `URL=https://opencrab.sh/api/mcp` + `KEY=ocm_…`. HTTP는 기존 POST+Bearer. 팩 동기화는 MCP 키에서만 동작 |
| `ANTHROPIC_API_KEY` | (선택) 보도자료·메일 AI 개인화. 없으면 템플릿 유지 |
| `GMAIL_OAUTH_CLIENT_ID` / `GMAIL_OAUTH_CLIENT_SECRET` | (선택) Gmail BYO. **없으면 `AUTH_GOOGLE_*` 폴백**. 콜백: `https://<deployment>.convex.site/gmail/callback` |
| `SMTP_ENCRYPTION_KEY` | **SMTP 발송을 쓰려면 필수.** 사용자 메일 비밀번호 봉인용 마스터 키. base64 32바이트만 허용 — 만드는 방법은 아래 |

#### `SMTP_ENCRYPTION_KEY` 만들기

base64로 인코딩된 **32바이트**여야 합니다. 아래 중 편한 것으로 만들어 출력값을 그대로 넣습니다.

```bash
# macOS · Linux
openssl rand -base64 32
```

```powershell
# Windows PowerShell — openssl이 기본 설치돼 있지 않습니다
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

```js
// 로컬 셸이 없을 때 — 브라우저 콘솔(F12). 값이 브라우저 밖으로 나가지 않습니다.
btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
```

`Get-Random`처럼 암호학적으로 안전하지 않은 난수는 쓰지 마세요 — 마스터 키에는 부적합합니다.

#### 넣을 때 주의

- **미설정이면 SMTP 계정 저장이 실패합니다.** 평문으로 대체 저장하지 않습니다 — Gmail 앱
  비밀번호는 IMAP까지 열려 있어 DB 유출만으로 사용자의 과거 메일이 통째로 읽히기 때문입니다.
- **교체하면 저장된 비밀번호가 전부 복호화에 실패**하고 사용자가 재입력해야 합니다.
  키 교체는 사용자에게 보이는 사고이므로 유출이 의심될 때만 합니다.
- Vercel이 아니라 **Convex 환경변수**입니다. 복호화는 Convex 액션에서만 일어납니다.
- CLI로 넣을 때는 **프로젝트 폴더 안에서** 실행하세요. 밖에서 돌리면 `No CONVEX_DEPLOYMENT`가
  납니다(배포 대상은 프로젝트의 `.env.local`에서 읽습니다).
- 대시보드(Settings → Environment Variables)로 넣어도 됩니다. 이때 **base64 값만** 붙여넣으세요
  — `--prod` 같은 CLI 플래그가 값에 섞이면 안 됩니다. 실제로 `OPENCRAB_API_KEY`가 그렇게 돼서
  인증이 27번 연속 실패한 적이 있습니다. 지금은 저장 시점에 "base64가 아닙니다"로 막히지만,
  애초에 넣지 않는 편이 낫습니다.

프로덕션 일괄 설정 스크립트: `scripts/set-prod-integrations.sh`  
(`CONVEX_DEPLOY_KEY` + `OPENCRAB_API_KEY` export 후 실행)

### 기자단 팩 동기화 운영

오픈크랩 기자단 배치 팩 26개 + reference 팩을 `journalists` 테이블로 반입합니다. **신규 환경변수는 없습니다** — 위 `OPENCRAB_API_*`를 그대로 씁니다.

- **자동**: 매일 1회 크론(`sync journalist packs`, UTC 18:30 = KST 03:30)
- **수동**: `/admin` → 「오픈크랩 팩 동기화」 → 전체 동기화 / 실패·결손만 재시도
- **실패 격리**: 팩 1개 단위로 커밋하므로 한 팩이 실패해도 나머지는 진행됩니다. 결과는 `packSyncRuns`에 남고 `/admin`에서 확인합니다.
- **결손(partial)**: 팩이 선언한 레코드 수보다 적게 파싱되면 `partial`로 기록됩니다. 상류 인제스트 단계에서 청크가 유실된 팩(예: batch-025는 원문의 약 41%만 저장)은 재시도해도 복구되지 않으며, 해당 기자는 reference 팩 병합으로 보완되거나 메일 후킹에서 generic 폴백으로 처리됩니다.
- **신규 시리즈**: 목록에서 새 팩이 감지돼도 **자동 전환하지 않습니다.** `/admin`의 승인 대기 목록에서 관리자가 켜야 동기화 대상이 됩니다.
- **PII**: `/admin`은 집계·메타만 노출합니다. 기자 실명·이메일 열람 UI는 없으며, 동기화 오류 로그의 이메일은 저장 전 마스킹됩니다.

Agency REST (Agency 플랜 + `/agency`에서 `cp_live_…` 키 발급):

| Method | Path | 설명 |
|---|---|---|
| GET/POST | `https://<deployment>.convex.site/api/v1/clients` | 클라이언트 목록/생성 |
| GET | `…/api/v1/campaigns?clientId=` | 캠페인 목록 |
| POST | `…/api/v1/press-releases` | 보도자료+캠페인 (`clientId`, `title`, `body`) |

### 유저 MCP (키 발급은 Free 포함 · 매칭·템플릿·분류 도구는 Solo 이상)

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
- [ ] `convex env set SMTP_ENCRYPTION_KEY "$(openssl rand -base64 32)" --prod` (SMTP 발송을 쓸 경우)
- [ ] 설정 → 「발신 메일 (SMTP)」에서 계정 연결 + 「연결 테스트」 통과 확인
- [ ] `/ai` MCP 키 발급 → Cursor `mcp.json` 연결 스모크 (Free는 도구 3종, Solo 이상은 6종 노출 확인)
- [ ] 앱 설정 → 서버 연동 상태 · OpenCrab 동기화 테스트
