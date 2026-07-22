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

## 2. Convex Auth 키 설정 ⭐ (로그인 동작에 필수)

```bash
npx @convex-dev/auth
```
- dev 배포에 `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` 환경변수를 생성/설정합니다.
- 로컬 테스트 시 `SITE_URL`은 보통 `http://localhost:3000`.

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

프로덕션에도 Auth 키가 필요하므로:
```bash
npx @convex-dev/auth --prod
# SITE_URL 은 Vercel 도메인으로 (5단계 후 확정되면 재설정)
```

## 5. Vercel 배포 ⭐

**방법 A — GitHub 연동(권장, push마다 자동 배포):**
1. vercel.com → **Add New → Project** → 이 저장소(`contentscoin/crabpitch`) 임포트.
2. **Environment Variables**에 추가:
   - `CONVEX_DEPLOY_KEY` = 4단계에서 발급한 Production Deploy Key
3. Build Command는 `vercel.json`에 이미 설정됨:
   `npx convex deploy --cmd 'pnpm build'`
   → 빌드 시 Convex 프로덕션 배포 + 올바른 `NEXT_PUBLIC_CONVEX_URL` 자동 주입.
4. **Deploy**.

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
```
→ Google OAuth 등 콜백/리다이렉트가 프로덕션 도메인과 일치하게 됩니다.

---

## 선택: 실 통합 배선

`.env.example` 참고. 미설정 시 데모 시드로 동작합니다.

| 변수 | 용도 |
|---|---|
| `OPENCRAB_API_URL` / `OPENCRAB_API_KEY` | 기자 온톨로지 실매칭(시드 대체) |
| `ANTHROPIC_API_KEY` | 보도자료·메일 AI 개인화 강화 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Gmail(BYO-Email) 발송·초안 OAuth |

> Convex 액션에서 쓰는 서버 시크릿은 `npx convex env set KEY value --prod` 로 Convex 배포에 설정합니다.

---

## 체크리스트

- [ ] `npx convex dev` — dev 배포 + `.env.local`
- [ ] `npx @convex-dev/auth` — Auth 키(dev)
- [ ] 로컬 로그인 + 데모 시드 확인
- [ ] `npx convex deploy` — 프로덕션 배포
- [ ] `npx @convex-dev/auth --prod` — Auth 키(prod)
- [ ] Vercel `CONVEX_DEPLOY_KEY` 환경변수 + Deploy
- [ ] `convex env set SITE_URL <vercel-domain> --prod`
