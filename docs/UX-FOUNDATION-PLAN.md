# UX 기반 작업 기획 (P1) — v2

앞선 두 작업(초안 품질·발송 안전, 예약 실발송)은 **서버 정합성**을 고쳤다. 이 기획은 화면 쪽
공백을 다룬다.

> **개정 이력**
> v1 → v2: 설계 검토(`UX-FOUNDATION-PLAN.review.md`) 반영. HIGH 6 / MEDIUM 12 / NIT 5 전부 반영했다.
> v1의 근거 수치 6개가 실측과 달랐고(§1), 두 가지 설계 결함이 있었다 —
> ① 프로필 완료 판정을 **제품에서 읽히지 않는 필드**(`profiles.boilerplate`)에 걸었고,
> ② `Button.loading` 사양이 현재 컴포넌트로 **구현 불가능**했다.
> 측정 기준값·재현 경로 없이 적은 수치(랜딩 번들 107kB, "7화면/15클릭")도 제거하거나 각주로 내렸다.

---

## 0. 사실 확인 (커밋 `0e5aea4` 기준, 코드로 검증)

### 0.1 계획을 바꾼 사실

| v1 계획 | 실측 | v2 계획 |
|---|---|---|
| 온보딩 단계에 "기자 데이터 동기화" | `journalists`에 **`userId`가 없다**(전역 캐시, 인덱스 `by_email`/`by_beat`뿐). 동기화는 일 1회 크론(`crons.ts`) + 관리자 수동 — **사용자 행위가 아니다** | "첫 매칭 실행"으로 교체. 판정은 `campaigns.list`가 이미 주는 `matchCount > 0` |
| ① 판정을 `profiles.boilerplate`로 | `ensureProfile`가 `companyName`에 `user.name`/`"내 회사"`를 **항상** 넣고 `AppShell`이 마운트마다 호출한다 → 존재 판정 불가. **그리고 `profiles.boilerplate`는 제품 어디에서도 읽히지 않는다** — `campaigns/new/page.tsx:94`는 `mediaKits.boilerplate`를 쓴다 | **`profiles.profileConfirmedAt` 필드를 새로 추가**해 "사용자가 설정을 한 번 저장했다"는 행위를 판정한다(§4.1) |
| 판정을 `usage.getAnalytics`에 얹는다 | `getAnalytics`는 `activeClientId`를 무시하고 항상 `by_user`. `campaigns.list`는 `by_client`로 전환 → 에이전시 모드에서 **다른 축**을 본다(기존 결함) | `campaigns.list` 기반으로 계산해 불일치를 상속하지 않는다 |
| `Button.loading`이 "자식 아이콘 자리"에 스피너 | `Button`은 `children`을 그대로 렌더한다 — **아이콘 슬롯이 없다**. 아이콘은 호출부 children에 섞여 있다(`<Send/> {label}`) | `icon?: LucideIcon` prop을 신설하고 그 자리를 스피너가 차지한다(§3.3) |
| 랜딩 CTA를 `<Link><Button>`으로 | `<a>`는 대화형 콘텐츠를 자식으로 가질 수 없다 — 무효 HTML + 중복 포커스 스톱 | `buttonClasses()` 유틸을 export해 `<Link className>`에 적용(§5) |

### 0.2 설계에 반영한 제약

- `gmailAccounts`·`smtpAccounts`·`mediaKits`에 `agencyClientId`가 **없다** → 에이전시가 클라이언트를
  바꿔도 발신 수단은 동일. ①②는 사용자 축으로만 판정 가능하다(§4.3).
- `agencyClients`에 회사 소개 필드가 **없다** → 에이전시 모드에서 ①은 클라이언트와 무관하다.
- **Gmail 연결만으로는 기자에게 메일이 나가지 않는다** — `schema.ts`의 `sendModeValidator` 주석:
  "`gmail_drafts`는 발송이 아니라 Gmail 초안 생성이다… 실제 메일이 나가는 것은 `smtp`뿐". ② 판정에 반영(§4.2).
- `campaigns.list`의 `sentCount`는 `record_only`(0통 발송) 기록을 **포함**한다 → ⑤ 라벨에 반영(§4.2).
- `seedDemoForMe`는 캠페인 1건 + 매칭 최대 12건을 삽입한다(초안은 넣지 않는다) → ③④를 즉시 완료시킨다(§4.4).
- `campaigns.list`는 `activeClientId`가 있어도 **멤버십 확인 실패 시 조용히 `by_user`로 폴백**한다.
- `vitest.config.ts`의 `include`는 `["convex/**/*.test.ts", "lib/**/*.test.ts"]`뿐 → **`components/`·`app/`
  아래 테스트는 수집되지 않는다**(§7).
- 클라이언트 경계는 `app/ConvexClientProvider.tsx` 하나이고 랜딩·signin·앱이 이를 공유한다.
- 렌더 테스트 하네스가 없다(`environment: "node"`, jsdom 미설치). 소스 스캔 가드 패턴은 이미 있다
  (`convex/drafts.guard.test.ts` 47개).

---

## 1. 문제 정의 (수치는 커밋 `0e5aea4` 실측)

| # | 문제 | 실측 근거 |
|---|---|---|
| P1 | 파괴적 액션이 `window.confirm` | **4곳**: `campaigns/[id]:611`(예약 SMTP 발송), `:628`(SMTP 즉시발송), `:1048`(템플릿 삭제), `UserMcpKeys.tsx:60`(MCP 키 폐기) |
| P2 | 성공·실패를 같은 변수에 담아 색 구분 불가 | `settings`의 `gmailMsg`(330), `ocMsg`(197), `agency`의 `msg`(74) — 모두 `text-foreground-muted`로만 렌더 |
| P3 | 로딩 표현이 흩어짐 | `Button`에 `loading` prop 없음. 스피너를 **손으로 넣은 곳 4곳**(`AiProviderKeys:191,235`, `admin:408`, `settings:194`) — 프리미티브가 없어 반복됨 |
| P4 | 스켈레톤이 회색 블록 1장 복붙 | `animate-pulse` **24곳 / 13파일** |
| P5 | 폼 에러를 입력에 연결하는 패턴이 **1곳에만** 있어 반복 불가 | `campaigns/[id]:1139,1155,1156`에 `aria-invalid`+`aria-describedby` 올바른 연결이 있다(직전 커밋에서 추가). 나머지 폼에는 없다 |
| P6 | 가입 후 첫 발송까지 안내가 없음 | 대시보드에 "다음 할 일"이 없고 데모 시드 버튼만 있다[^1] |
| P7 | 모바일에서 제품 핵심 정보가 사라짐 | `UsageMeter:13` `hidden … sm:block`(무료 10통 한도 제품에서 잔여량 소실). 테이블 컬럼 숨김: `campaigns` `sm:table-cell`(3열), `journalists` `md:table-cell`(beat)·`lg:table-cell`(기사수) |
| P8 | 접근성 | `aria-*` **17건** / `role=` **0건** / `aria-live` 0건 / `aria-current` 0건. `Progress`에 `role="progressbar"` 없음. 랜딩 signin CTA **5곳**(`page.tsx:41,66,186,265,345`)이 인라인 클래스라 `focus-visible` 없음 |

[^1]: 최단 경로: `/` → `/signin` → `/dashboard` → `/settings`(발신 아이덴티티) → `/settings`(발신 수단) →
`/campaigns/new` → `/campaigns/[id]`(②매칭 → ③초안 → ④승인). 화면 전환 7회.

---

## 2. 범위

### 병합 단위 — 3개 PR로 분할한다

Phase는 서로 독립이 아니다(§5는 §3.1의 Toast에 의존, §6은 §5의 `Progress` 변경 위에서 이뤄진다).
총 변경 규모가 40파일 내외라 한 커밋으로 묶으면 회귀 원인을 격리할 수 없다.

| PR | 내용 | 선행 |
|---|---|---|
| **PR#1** | Phase 1 — 프리미티브 4개 + `toUserMessage` + confirm 4곳 + 인라인 상태 5곳 전환 + 가드 | — |
| **PR#2** | Phase 2 — 온보딩(스키마 1필드 + 쿼리 + 순수 판정 함수 + 체크리스트 + 배너) | PR#1 |
| **PR#3** | Phase 3+4 — 접근성 9항목 + 모바일 4항목 (`Progress`를 양쪽이 건드리므로 함께) | PR#1 |

### Non-goals

- **템플릿 5문항 위저드** — 미결 제품 결정 3건 때문에 연기한다: (a) 톤 축("정중/담백")이 현재
  `OUTLET_TONE`(매체 유형 자동 결정)과 충돌하는지, (b) 산출물을 `userEmailTemplates`에 저장할지
  별도 축으로 둘지, (c) 5문항의 정확한 문구. 결정 없이 만들면 버릴 코드가 된다.
  실시간 미리보기·자리표시자 삽입 UI(이미 구현)가 "문법을 배워야 하는" 문제의 큰 부분을 덮는다.
- **인라인 상태 43개의 전면 Toast 전환** — 전환 대상은 §3.6의 5곳으로 한정한다. `sendNote`·`lint`
  결과처럼 **화면에 남아야 하는** 정보는 인라인 유지 + `role="status"`만 붙인다(§5).
- **`getAnalytics`의 에이전시 축 불일치 / `campaigns.list`의 멤버십 폴백** — 기존 결함. 온보딩은
  우회하되(§0.1) 원인은 고치지 않는다.
- **Gmail 토큰 상태 판정** — `gmailAccounts.getConnection`은 상태 필드를 반환하지 않는다. ② 판정은
  행 존재 + 종류만 본다.
- **`record_only` 기록과 실발송의 구분** — `emailDrafts`에 발송 수단이 없고 즉시 발송 경로는
  `campaigns.sendMode`를 저장하지 않는다(예약 시에만 저장). 따라서 현재 데이터로 구분 불가.
  ⑤ 라벨을 "첫 발송 기록"으로 정직하게 쓴다(§4.2).
- **낙관적 업데이트 도입** — PR#1의 Toast가 실패 가시성을 먼저 확보해야 안전하다.
- **색 대비 전면 감사 / 11px 텍스트 크기 조정 / `/ai`·`/settings` 패널 중복 제거** — 디자인·정보구조
  결정이 필요하다.
- **`campaigns/[id]`의 테이블 2개 카드화**(`:283,311,357,367`) — 매칭 표는 체크박스·점수바가 얽혀 있어
  별도 작업이다.
- **모바일 드로어 내비** — 새 프리미티브(포커스 트랩·바디 스크롤 락)가 필요하고 `Dialog`와 별개 구현이다.
  fade 마스크로 "발견 불가" 문제만 해결한다(§6).

---

## 3. PR#1 — 피드백·프리미티브

### 3.1 `Toast`

`components/ui/Toast.tsx` — Context + Provider + `useToast()`. **의존성 추가 없음.**

```
toast.success(msg) / toast.error(msg) / toast.info(msg)
```

**Provider 위치: `ConvexClientProvider` 내부으로 확정한다.** 근거: **앱의 유일한 클라이언트
경계**이고 랜딩·signin이 같은 트리를 쓴다. (v1은 근거로 "signin 실패 문구를 토스트로 옮기는
것이 범위"라고 적었으나 **signin은 전환하지 않는다** — 폼 제출 실패는 화면에 남는 편이 낫고,
§2가 이미 "화면에 남아야 하는 정보는 인라인 유지"를 예외로 두었다. Provider 위치는 단일
클라이언트 경계라는 근거만으로 성립한다.)
**v1의 "번들 +5kB면 AppShell로 내린다" 조항은 폐기한다** — 그 롤백은 signin 사용을 불가능하게 만들어
자기 근거를 무너뜨린다. 번들 영향은 수용한다(컴포넌트 의존성 0).

**politeness — live region을 2개 항상 마운트한다.** 하나의 컨테이너에 두 politeness를 둘 수 없고,
마운트된 region의 `aria-live`를 런타임에 바꾸면 스크린리더가 안정적으로 읽지 않는다.

```tsx
<div aria-live="polite"    role="status" …>{polite.map(…)}</div>
<div aria-live="assertive" role="alert"  …>{assertive.map(…)}</div>
```

- `error` → assertive, `success`/`info` → polite.
- 소멸: `success`/`info` 5초, `error` 8초.
- 스택 상한 **합계 3개**. 초과 시 가장 오래된 것을 축출하되 **`error`는 축출 대상에서 제외**한다
  (8초 유지 규칙과 충돌하지 않게).
- 수동 닫기 버튼 `aria-label="알림 닫기"`.

### 3.2 `Dialog` / `useConfirm`

`components/ui/Dialog.tsx` — **네이티브 `<dialog>` + `showModal()`**.

근거: ESC 닫기·포커스 트랩·`::backdrop`·배경 inert를 브라우저가 제공한다. 저장소에 포커스 트랩
구현이 0건이므로 직접 만들 이유가 없다. Baseline 2022(Safari 15.4+). `package.json`에 browserslist가
없어 지원 범위가 정의되지 않았으므로 이 결정을 여기 남긴다.
**폴백 규칙**: `showModal`이 없으면 확인 없이 진행하지 **않고** `window.confirm`으로 되돌린다
(파괴적 액션이므로 무확인 진행은 금지).

**API는 `useConfirm()` — `Promise<boolean>`을 반환한다.** 교체 대상 4곳은 모두 `async` 함수 중간에서
확인 결과를 받아 흐름을 계속한다(`const ok = window.confirm(...); if (!ok) return;`). 선언형
`onConfirm` 콜백으로 바꾸면 발송 코드 경로를 재구성해야 한다 — 저장소에서 가장 위험한 코드다.

```tsx
const confirm = useConfirm();
const ok = await confirm({ title, description, confirmLabel, variant: "danger" });
if (!ok) return;
```

`ConfirmProvider`는 `<dialog>` 하나를 유지하고 `close`/ESC를 `false`로 resolve한다.
`onConfirm` 콜백형 래퍼는 **만들지 않는다**(호출부가 없다).

**교체 대상 4곳 — 문구는 모두 유지한다.**

| 위치 | 확인 내용 | variant |
|---|---|---|
| `campaigns/[id]:611` | 예약 SMTP 실발송 | `danger` |
| `campaigns/[id]:628` | SMTP 즉시 발송 | `danger` |
| `campaigns/[id]:1048` | 커스텀 템플릿 삭제 | `danger` |
| `UserMcpKeys.tsx:60` | MCP 키 폐기 | `danger` |

611·628의 문구는 **축약 금지**. 되돌릴 수 없다는 경고와 발신 주소가 들어 있고, 611은 "사용자가 자리에
없을 때 나간다"는 추가 정보를 담는다. 기본 포커스는 **취소**(Enter 연타로 확정되지 않게).

### 3.3 `Button` — `loading` + `icon`

기존 API 보존(`variant` 6종 / `size` 4종 / `forwardRef` / `displayName`) + optional 2개 추가.

```tsx
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** 좌측 아이콘. loading이면 이 자리에 스피너가 들어간다. */
  icon?: LucideIcon;
}
// 렌더: {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
//       {children}
// disabled = disabled || loading,  aria-busy = loading || undefined
```

**라벨 문자열 교체는 유지한다.** "생성 중…"은 스피너보다 많은 정보를 준다. `loading`은 라벨 교체를
대체하지 않는다.

**1차 채택 호출부** (각각 `<Icon/>`를 `icon={Icon}`으로 옮긴다):

| 파일 | 버튼 |
|---|---|
| `campaigns/[id]` | 초안 생성, AI 다듬기, 발송(승인), 예약 취소 |
| `settings` | 프로필 저장, Gmail 연결, OpenCrab 동기화 테스트 |
| `SmtpConnect` | 저장, 연결 테스트 |
| `UserMcpKeys` | 키 발급 |
| `dashboard` | 데모 데이터 생성 |
| `AiProviderKeys:191,235` | **손으로 넣은 `<Loader2 animate-spin>`을 `loading`으로 흡수** |

### 3.4 `Skeleton`

`components/ui/Skeleton.tsx` — `<Skeleton className>` + `<SkeletonText lines>` + `<SkeletonCard>` +
`<SkeletonRows rows>`. **24곳을 콘텐츠 형태에 맞게** 교체한다(표 자리는 행, 카드 자리는 카드).
전부 같은 회색 블록이면 지금과 다를 게 없다.
  - 원본이 `border border-border bg-card` 카드 프레임을 갖고 있던 **7곳이 우선 대상**이다:
    `campaigns`·`journalists`·`replies`·`dashboard`·`media-kit`의 목록 자리 → `SkeletonRows`,
    `campaigns/[id]`·`media-kit` 상세 → `SkeletonCard`, `settings` 억제 리스트 → `SkeletonText`.
  - `SkeletonRows`에 `cols`는 두지 않는다 — 쓰는 곳이 없어 dead API가 된다.
  - 가드는 export 존재가 아니라 **호출부 사용**을 검사한다(dead code를 불변식으로 고정하지 않게).

### 3.5 `FormField`

`components/ui/FormField.tsx` — label + control + description + error를 묶고 aria를 자동 연결한다.
**참조 구현은 `campaigns/[id]:1139,1155,1156`** — 이미 올바른 연결이 있고, 그것을 반복 가능하게 만드는 것이
이 프리미티브의 목적이다.

```tsx
<FormField label="회신 이메일" error={err} description="기자 답장을 받을 주소">
  {(id, describedBy) => (
    <Input id={id} aria-invalid={!!err || undefined} aria-describedby={describedBy} />
  )}
</FormField>
```

children을 함수로 받는 이유: `Input`/`Textarea`/네이티브 `select`가 섞여 있고 각자 props가 다르다.
`cloneElement`로 주입하면 타입이 깨진다.

**적용 범위 + 검증 규칙 (전부 클라이언트, 제출 전 판정).** 서버가 필드별 오류를 돌려주는 곳이 없으므로
검증을 함께 넣지 않으면 `error`가 항상 `undefined`여서 관측 가능한 변화가 0이 된다.

| 폼 | 필드 | 규칙 | 오류 문구 |
|---|---|---|---|
| `settings` 발신 아이덴티티 | `companyName` | trim 1~50자 | 회사명을 입력해 주세요. |
| | `contactEmail` | 비어 있지 않고 `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | 올바른 이메일 주소가 아닙니다. |
| | `boilerplate` | **선택 항목.** 비어 있으면 통과, 값이 있으면 trim 10~300자 | 회사 소개를 10자 이상 적어 주세요. |

`boilerplate`를 필수로 두지 않는 이유: 보도자료 하단 소개를 쓰지 않는 기존 사용자가 설정을
저장할 수 없게 된다. (v1은 필수로 적었으나 구현에서 선택으로 바꿨고 이쪽이 맞다.)
| `SmtpConnect` | 이메일 | 위와 같은 정규식(서버 `normalizeEmail`과 일치) | 올바른 이메일 주소가 아닙니다. |

`settings`의 `saveProfile`에 **`try/catch`를 추가**한다 — 현재 `update(form)` 후 바로 `setSaved(true)`라
실패해도 아무 표시가 없다(미처리 rejection).

### 3.6 인라인 상태 → Toast 전환 (전환 대상 확정)

문자열 상태 48개 중 **아래 5곳만** 이번에 전환한다. 나머지는 §2 Non-goals.

| 파일 | 상태 | 전환 |
|---|---|---|
| `settings/page.tsx` | `gmailMsg` | 성공/실패 분기 → `toast.success` / `toast.error`, 상태 변수 삭제 |
| `settings/page.tsx` | `ocMsg` | 동일 |
| `settings/page.tsx` | `saved` | `toast.success("저장했습니다")` + `try/catch`(§3.5) |
| `agency/page.tsx` | `msg` | 동일 |
| `UserMcpKeys.tsx` | `error` | `toast.error(toUserMessage(e))` |

### 3.7 `toUserMessage`

`lib/errorMessage.ts` + `lib/errorMessage.test.ts`. 현재 `e.message`를 그대로 노출해 Convex 내부 문구가
새는 곳이 있다. **도메인 한글 문구는 그대로 통과시킨다** — 이 저장소의 서버 오류는 이미 사용자용
한글이고(파일럿 게이트 안내, 예약 수단 미연결 등) 삼키면 정보가 사라진다.

```
1) Error가 아니면 typeof string일 때만 그 값을 쓰고, 그 외는 기본 문구.
2) 줄 단위로 나눠 앞뒤 공백 제거.
3) /^\[Request ID: [^\]]+\]\s*/ → /^Server Error\s*/ → /^Uncaught (Error|ConvexError):\s*/ 순서로 제거.
4) /^\s*at\s/ 로 시작하는 라인 이후는 버린다.
5) 남은 첫 줄이 비면 기본 문구 "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
6) 그 외에는 원문 통과.
```

테스트 케이스 9종: 위 6규칙 각각 + 이미 한글 도메인 문구 + 빈 문자열 + `undefined`.

---

## 4. PR#2 — 온보딩

### 4.1 ① 판정 — `profileConfirmedAt` 신설

`profiles`에 필드 하나를 추가한다.

```ts
/**
 * 사용자가 발신 아이덴티티를 **직접 저장한** 시각.
 *
 * `ensureProfile`가 companyName·senderName·contactEmail을 자동으로 채우므로(로그인만 해도
 * 행이 생긴다) 필드 존재로는 "작성했는가"를 판정할 수 없다. `boilerplate`도 게이트로 쓸 수
 * 없다 — 제품 어디에서도 읽히지 않는 필드라 채울 이유를 설명할 수 없다.
 * `updateProfile`만 이 값을 찍는다. `ensureProfile`는 절대 쓰지 않는다(가드 테스트로 고정).
 */
profileConfirmedAt: v.optional(v.number()),
```

`updateProfile` 성공 시 `Date.now()`를 기록한다. ① = `profileConfirmedAt !== undefined`.

기존 사용자는 미완료로 보인다. 설정을 한 번 저장하면 닫히고, 그 행위 자체가 온보딩의 목적이므로
백필하지 않는다.

### 4.2 판정 규칙

**새 쿼리 `convex/onboarding.ts` → `getMyChecklist`** — 대시보드가 이미 구독하는
`usage`/`analytics`/`campaigns`/`profile`로 덮이지 않는 것만 서버에서 묶는다.

```ts
returns: v.object({
  profileDone: v.boolean(),      // profileConfirmedAt 존재
  senderKind: v.union(v.literal("smtp"), v.literal("gmail"), v.literal("none")),
  senderNeedsCheck: v.boolean(), // SMTP lastStatus === "error" ("저장됐다 ≠ 붙는다")
  isClientScoped: v.boolean(),   // activeClientId가 설정돼 있는가 (§4.3)
})
```

`mediaKitDone`은 **반환하지 않는다** — 이번에 쓰지 않는다.

캠페인·매칭·발송은 **클라이언트에서 `campaigns.list`로 계산**한다(축 불일치 회피, 쿼리 추가 없음).
판정 로직은 `lib/onboarding.ts`의 **순수 함수**로 분리해 테스트한다.

| 단계 | 라벨 | 판정 | 설명 문구 |
|---|---|---|---|
| ① | 발신 정보 저장 | `profileDone` | 회사명·보내는 사람·회신 주소를 저장하세요. |
| ② | 발신 수단 연결 | `senderKind !== "none"` | (아래 분기) |
| ③ | 첫 캠페인 만들기 | `campaigns.length > 0` | 보도자료를 쓰면 캠페인이 만들어집니다. |
| ④ | 기자 매칭 실행 | `campaigns.some(c => c.matchCount > 0)` | 주제에 맞는 기자를 찾습니다. |
| ⑤ | **첫 발송 기록** | `campaigns.some(c => c.sentCount > 0)` | 크랩피치 밖에서 보낸 건도 포함됩니다. |

⑤ 라벨이 "발송"이 아니라 "**발송 기록**"인 이유: `sentCount`는 `record_only`(0통 발송) 기록을 포함하고
현재 데이터로는 구분할 수 없다(§2 Non-goals). 정직한 라벨을 쓴다.

**② 분기 — Gmail은 부분 완료다.** 실제 메일이 나가는 것은 SMTP뿐이다(§0.2).

| `senderKind` | 체크 | 문구 |
|---|---|---|
| `smtp` | 완료 | 기자에게 실제 메일이 나갑니다. `senderNeedsCheck`면 "마지막 연결이 실패했습니다 — 설정에서 확인하세요." |
| `gmail` | **완료(경고 톤)** | Gmail 연결은 **초안 생성까지만** 가능합니다. 실제 발송에는 SMTP 연결이 필요합니다. |
| `none` | 미완료 | 연결하지 않으면 메일이 나가지 않습니다. |

### 4.3 에이전시 모드

`activeClientId`가 설정된 동안:

- 체크리스트는 **③④⑤만** 표시하고 진행률을 `n/3`으로 낸다.
- ①②는 "**계정 공통 설정**"이라는 별도 회색 줄로 내려 상태만 보여 준다(CTA 강조 대상 제외).
  근거: `profiles`·`gmailAccounts`·`smtpAccounts`에 `agencyClientId`가 없어 클라이언트별로 다를 수 없다.
- 클라이언트를 전환하면 ③④⑤가 리셋되어 체크리스트가 다시 나타난다 — **의도된 동작**이다
  (새 클라이언트마다 캠페인을 처음부터 만든다).

### 4.4 화면

**`components/app/OnboardingChecklist.tsx`** — 대시보드 StatCard 그리드 **뒤**, "내 AI" **앞**.

- 모든 단계 완료면 **렌더하지 않는다**(언마운트).
- `Progress` + `n/5`(에이전시 모드는 `n/3`).
- 미완료 단계 중 **첫 번째만** CTA를 강조하고 나머지는 회색 — 다음 한 걸음을 명확히 한다.
- `campaigns === undefined || checklist === undefined`면 `<SkeletonCard>`.
- **데모 시드가 ③④를 즉시 완료시키는 것을 허용하고 명문화한다.** 체험 경로를 막지 않는 편이 낫다.
  ⑤는 데모로 채워지지 않으므로(시드는 `emailDrafts`를 넣지 않는다) 체크리스트가 사라지지는 않는다.
- **EmptyState(최근 캠페인)의 "새 보도자료 작성" CTA를 제거한다** — 상단 체크리스트가 그 역할을 한다.
  "데모 데이터 생성"만 남긴다. (EmptyState는 `campaigns.length === 0`일 때만 나오고 그때는 ③이
  미완료이므로 체크리스트가 **항상** 함께 렌더된다 — 조건부가 아니라 무조건이다.)

**발신 수단 미연결 배너** — `AppShell`, 인증된 사용자 전체.

```
키: "crabpitch-sender-banner-snoozed-until"   값: epoch ms 문자열
표시 조건:
    senderKind === "none"
 && !pathname.startsWith("/settings")            // 이미 그 화면이면 방해다
 && pathname !== "/dashboard"                    // 체크리스트 ②와 중복 (대시보드는 체크리스트가 담당)
 && mounted                                      // SSR에서는 렌더하지 않는다
 && Number(localStorage[키] ?? 0) < Date.now()
읽기: useEffect로 mounted 후 1회 (렌더 중 localStorage 접근 불가 — ThemeToggle과 같은 패턴)
위치: AppShell의 <Topbar /> 바로 아래, <MobileNav /> 위
닫기: localStorage[키] = String(Date.now() + 24*60*60*1000)   // 영구 닫기는 두지 않는다
```

---

## 5. PR#3-a — 접근성

정확히 이 목록만, 기계적으로.

| 대상 | 변경 |
|---|---|
| `Sidebar` 활성 링크 | `aria-current="page"` |
| `Progress` | `role="progressbar"` + `aria-valuenow/min/max` + **`label` 필수 prop**. optional로 두면 이름 없는 progressbar가 새로 생긴다 |
| `Progress` 사용처 4곳 문구 | `UsageMeter:20` "이번 달 발송 사용량" / `media-kit:89` "미디어킷 완성도" / `media-kit:757` "보도자료 점수" / 온보딩 "온보딩 진행률" |
| 인라인 상태 알림 | `sendNote`·`lint` 결과에 `role="status"`(화면에 남아야 하는 정보라 Toast로 옮기지 않는다) |
| `AppShell` | skip-link(`<a href="#main">본문으로 건너뛰기</a>`, focus 시에만 보임) + `<main id="main">` |
| 랜딩 CTA 5곳 | `buttonClasses()` 유틸을 `Button.tsx`에서 export하고 `<Link className={buttonClasses({size:"lg"})}>`로 적용. **`<Link><Button>` 중첩 금지**(무효 HTML). `Button` 내부도 같은 함수를 써 단일 출처를 유지 |
| `ThemeToggle` | 다크 모드 첫 페인트에 아이콘이 1프레임 어긋나는 문제를 고친다 — `mounted` 상태를 두고 마운트 전에는 같은 크기의 빈 박스를 렌더. `aria-pressed={dark}`(눌림 = 다크 활성), `aria-label="다크 모드"` 고정. (v1의 "hydration 불일치"는 오진 — 서버·클라이언트 첫 렌더는 일치한다) |
| `EmptyState`/`StatCard` | heading 레벨을 `as` prop으로 지정 가능하게(기본값 유지) |

---

## 6. PR#3-b — 모바일

| 대상 | 변경 |
|---|---|
| `UsageMeter` | 모바일에서 컴팩트 배지(`7/10`)로 **항상 노출**. `sm` 이상은 현재 막대 유지 |
| `campaigns` 목록 | **`sm` 미만** 카드 리스트 전환(숨는 컬럼이 `sm:table-cell`) |
| `journalists` 목록 | **`lg` 미만** 카드 리스트 전환. 가장 늦게 숨는 컬럼이 `lg:table-cell`(기사수)이므로 `sm` 기준으로 하면 640~1024px에서 정보가 계속 사라진다 |
| 카드 컴포넌트 | 두 목록의 행 구조가 다르다(캠페인은 `<Link>` 행, 기자는 비링크 + 체크박스 없음). **공통 추출하지 않고** 각 페이지에 카드 마크업을 둔다. 대시보드 최근 캠페인 리스트도 그대로 둔다 |
| `MobileNav` | 가로 스크롤 유지 + **우측 fade 마스크**(스크롤 가능 힌트). 탭은 8개(관리자 9개) |

---

## 7. 완료 기준

각 PR은 아래를 모두 만족해야 병합 가능하다.

1. `pnpm typecheck` / `pnpm lint` / `pnpm build` / `pnpm test` 통과. 기준선 **33 files / 602 tests**.
2. 순수 로직에 테스트가 있다 — `lib/errorMessage.test.ts`(9케이스), `lib/onboarding.test.ts`.
   **렌더 테스트 하네스는 도입하지 않는다**(`environment: "node"`, 런타임 의존성 8개 유지 방침).
3. **UI 가드 테스트는 `lib/uiFoundation.guard.test.ts`에 둔다.** `vitest.config.ts`의 `include`가
   `convex/**/*.test.ts`·`lib/**/*.test.ts`뿐이라 `components/`·`app/` 아래 테스트는 **수집되지 않고
   CI가 초록으로 통과**한다. 설정 변경 없이 `lib/`를 쓴다.
4. 기존 소스 스캔 가드(`drafts.guard.test.ts` 47개, `aiPipeline.guard.test.ts` 20개)가 깨지지 않는다.

### PR별 가드 (소스 스캔)

```ts
// PR#1
// ⚠️ 대상 파일을 열거한다. "저장소 전체에 window.confirm 0건"으로 쓰면 §3.2의 폴백
//    (components/ui/Dialog.tsx 안의 showModal 미지원 대비)과 모순되어 가드가 자기 설계를 거부한다.
const CONFIRM_FREE_FILES = [
  "app/(app)/campaigns/[id]/page.tsx",
  "components/app/UserMcpKeys.tsx",
];
it("호출부에 window.confirm이 남아 있지 않다", …)          // 위 2파일만 검사
it("window.confirm은 Dialog 폴백 한 곳에만 있다", …)        // Dialog.tsx에 1건 존재를 적극 확인
it("Button이 loading/icon prop과 aria-busy를 노출한다", …)
it("전환 대상 5곳의 인라인 상태 변수가 제거됐다", …)       // gmailMsg / ocMsg / saved / msg / error
it("saveProfile에 try/catch가 있다", …)

// PR#2
it("ensureProfile은 profileConfirmedAt을 쓰지 않는다", …)  // 자동 완료를 구조적으로 차단
it("updateProfile이 profileConfirmedAt을 기록한다", …)
it("온보딩 판정이 순수 함수로 분리돼 있고 journalists를 참조하지 않는다", …)
// + lib/onboarding.test.ts — 에이전시 모드 n/3, Gmail 부분완료, record_only 포함 등 규칙 케이스화

// PR#3
it("Sidebar 활성 링크에 aria-current가 있다", …)
it("Progress가 progressbar 역할·값·필수 label을 노출한다", …)
it("AppShell에 skip-link와 main#main이 있다", …)
it("UsageMeter가 모바일에서 숨지 않는다", …)
it("랜딩 CTA가 buttonClasses를 쓰고 Link>Button 중첩이 없다", …)
```

---

## 8. 위험

| 위험 | 대응 |
|---|---|
| `profileConfirmedAt` 추가로 기존 사용자가 전원 ① 미완료 | 설정 1회 저장으로 닫힌다. 그 행위가 온보딩의 목적이므로 백필하지 않는다. 배너는 `senderKind === "none"`만 보므로 ①로는 배너가 뜨지 않는다 |
| 에이전시 모드에서 데모 시드가 무반응 | `seedDemoForMe`가 `agencyClientId`를 넣지 않아 `campaigns.list`(by_client)에 안 보인다. **기존 결함**이고 이번에 고치지 않는다. 에이전시 모드에서는 데모 버튼을 숨긴다(1줄) |
| `getMyChecklist`를 `AppShell`에서 구독해 전 페이지에 쿼리 1개 증가 | 반환이 불린 4개로 작고 Convex 리액티브 캐시를 탄다. 배너를 숨기는 `/settings`에서도 구독은 유지된다 — 수용 |
| 네이티브 `<dialog>` 미지원 브라우저 | `showModal` 부재 시 `window.confirm`으로 폴백(§3.2). 파괴적 액션에서 무확인 진행은 금지 |
| Toast Provider가 랜딩 번들에 포함 | 수용(§3.1). 롤백 조항 없음 |
| 24곳 스켈레톤 교체 회귀 | 순수 표현 변경. **형태만 바꾸고 조건식은 건드리지 않는다** |
| `journalists` `lg` 미만 카드 전환이 태블릿 레이아웃을 크게 바꾼다 | 의도된 변경(P7). 표에서 숨겨져 있던 정보가 카드에서 보이게 된다 |
