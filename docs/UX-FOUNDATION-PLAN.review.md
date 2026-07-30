# UX-FOUNDATION-PLAN.md 설계 검토

대상: `docs/UX-FOUNDATION-PLAN.md` (커밋 `0e5aea4` 시점 코드 기준)
검토 방식: 기획서의 사실 주장을 저장소 소스로 직접 확인. 기획서 서술은 근거로 인정하지 않음.

**판정: CHANGES_REQUESTED** (HIGH 6 / MEDIUM 12 / NIT 5)

---

## 검토 결과

### HIGH

**1. `window.confirm`은 3곳이 아니라 4곳이다 — §3.2와 §7.4가 즉시 모순된다**

§1 P1과 §3.2는 "3곳"(SMTP 즉시발송, 템플릿 삭제, MCP 키 폐기)이라고 적었지만 실제는 4곳이다.

```
app/(app)/campaigns/[id]/page.tsx:611  예약 SMTP 발송 확인   ← 기획서 누락
app/(app)/campaigns/[id]/page.tsx:628  SMTP 즉시 발송 확인
app/(app)/campaigns/[id]/page.tsx:1048 템플릿 삭제
components/app/UserMcpKeys.tsx:60      MCP 키 폐기
```

누락된 611은 **예약 실발송 확인**으로, 직전 커밋(`0e5aea4`)이 추가한 가장 위험한 확인창이다.
§3.2가 "3곳 교체"라고 지시하면 §7.4의 "`window.confirm` 잔존 0건(가드 테스트)"이 반드시 깨진다.

수정: §1 P1과 §3.2의 목록을 위 4곳으로 교체하고, 611도 628과 같이 **문구 유지 + `danger` variant**로
명시한다(611은 "사용자가 자리에 없을 때 나간다"는 추가 경고가 있으므로 문구를 절대 축약하지 않는다).

---

**2. P2(성공·실패 색 구분)의 실제 변경을 정의한 절이 없다 — Phase 1 범위에 구멍**

§2는 P2를 Phase 1 범위로 선언했고 §1 P2는 대상을 `settings`의 `gmailMsg`/`ocMsg`, `agency`의 `msg`로
특정했다. 그러나 §3에는 이 세 곳을 어떻게 바꾸는지 쓴 절이 **없다**. §3.1은 Toast를 "만드는" 것까지만
정의하고, §5는 "페이지 인라인 노트 중 발송 결과·lint 결과에 `role="status"` 추가"라고만 한다.
구현자는 "Toast를 만들되 호출부는 아무것도 안 바꿔도" §7 완료 기준을 전부 통과한다.

실측: 인라인 문자열 상태는 48개 `useState`(문자열/`string|null`), setter 호출 60곳. 전면 교체는
Phase 1 범위를 크게 넘는다. 따라서 **경계를 숫자로 못 박아야 한다.**

수정: §3에 `3.6 인라인 상태 → Toast 전환 대상`을 신설하고 아래만 이번 범위로 확정한다.

| 파일 | 상태 변수 | 전환 |
|---|---|---|
| `app/(app)/settings/page.tsx` | `gmailMsg` | 성공/실패 분기해 `toast.success` / `toast.error`, 상태 변수 삭제 |
| `app/(app)/settings/page.tsx` | `ocMsg` | 동일 |
| `app/(app)/settings/page.tsx` | `saved` | `toast.success("저장했습니다")`, `saveProfile`에 `try/catch` 추가(현재 없음 → 실패 시 무반응) |
| `app/(app)/agency/page.tsx` | `msg` | 동일 |
| `components/app/UserMcpKeys.tsx` | `error` | `toast.error(toUserMessage(e))` |

그 외 43개는 **이번에 손대지 않는다**를 §2 Non-goals에 명문화한다(특히 `sendNote`·`lint`는 결과가
화면에 남아야 하므로 인라인 유지 + `role="status"`만 — §5와 일관).

---

**3. `Button.loading` 사양이 현재 `Button`으로 구현 불가능하다**

§3.3은 "`loading`이면 **기존 자식 아이콘 자리에** `<Loader2>`"라고 지시한다. 그런데
`components/ui/Button.tsx`는 `{...props}`만 스프레드하고 `children`을 그대로 렌더한다 — **아이콘 슬롯이
없다.** 아이콘은 호출부 children에 섞여 있다(`<Send className="h-4 w-4" /> {label}`). "자식 아이콘 자리"를
찾아 교체하려면 `children` 순회/`cloneElement`가 필요한데, §3.5는 바로 그 이유로 `cloneElement`를
배제했다. 자기모순이다.

또한 "`loading`은 라벨 교체를 대체하지 않고 **보완**한다"는 문장은 구현 지시가 아니다. 어느 호출부가
`loading`을 받는지 목록이 없어, prop만 추가하고 채택 0건이어도 완료로 볼 수 있다.

수정: API를 명시적으로 바꾼다.

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
// disabled={disabled || loading}, aria-busy={loading || undefined}
```

그리고 **1차 채택 호출부를 열거한다**(제안: `campaigns/[id]` 발송 버튼, `settings` 저장/Gmail 연결/
OpenCrab 테스트, `SmtpConnect` 저장·테스트, `UserMcpKeys` 발급, 대시보드 데모 시드). 이때 각 호출부는
`<Send .../>`를 `icon={Send}`로 옮기고 라벨 문자열 교체는 유지한다. 이미 `components/app/AiProviderKeys.tsx`
(191, 235행)가 손으로 `<Loader2 className="animate-spin">`를 넣고 있으므로 그 2곳도 `loading`으로 흡수한다.

---

**4. ①(프로필) 판정 기준인 `profiles.boilerplate`는 제품에서 읽히지 않는 사장 필드다**

§0의 대체 판정 근거("`ensureProfile`가 절대 채우지 않는다")는 사실이다. 그러나 검토에서 더 중요한
사실이 나왔다: **`profiles.boilerplate`를 소비하는 코드가 없다.**

- 쓰기: `app/(app)/settings/page.tsx`(253행)와 `convex/profiles.ts:updateProfile`뿐.
- 읽기: `settings` 폼이 자기 값을 다시 채우는 것 외에 없음.
- 보도자료 생성 화면은 보일러플레이트를 **미디어킷**에서 가져온다 — `app/(app)/campaigns/new/page.tsx:94`
  `const bp = (kit.boilerplate ?? "").trim();` (`profile.boilerplate`가 아니다).

즉 기획대로 하면 사용자는 **제품 동작에 아무 영향이 없는 필드**를 채워야 체크리스트 ①이 닫히고,
그때까지 발신 배너와 체크리스트가 계속 노출된다. §8의 대응("설명에 '회사 소개 한 줄' 명시 + 필드
직접 링크")은 "왜 채워야 하나"에 답하지 못한다. 이건 문구 문제가 아니라 게이트 선택 문제다.

수정: 둘 중 하나를 §0에서 결정한다.

- **(권장) 명시적 확인 플래그.** `profiles`에 `profileConfirmedAt: v.optional(v.number())`를 추가하고
  `updateProfile` 성공 시 `Date.now()`를 찍는다. ① = `profileConfirmedAt !== undefined`.
  `ensureProfile`는 이 필드를 절대 쓰지 않는다(가드 테스트로 고정). 판정 대상이 "사용자가 설정을 한 번
  저장했다"는 실제 행위가 되고, 죽은 필드에 의존하지 않는다.
- **(대안) `boilerplate`를 실제 경로에 배선.** `campaigns/new`에서 미디어킷이 없을 때
  `profile.boilerplate`를 폴백으로 채운다. 그러면 게이트가 값을 갖는다. 단 이건 Phase 1~4 밖의
  기능 변경이므로 범위를 늘린다.

---

**5. §7 완료 기준이 Phase 2·3·4를 전혀 검증하지 않는다**

§7의 5개 항목 중 Phase 1만 검증한다(순수 함수 테스트, `window.confirm` 0건). 온보딩 체크리스트가
렌더되는지, `aria-current`/`role="progressbar"`/skip-link가 들어갔는지, 모바일에서 `UsageMeter`가
보이는지에 대한 판정 기준이 **하나도 없다**. "렌더 테스트 하네스를 도입하지 않는다"는 결정 자체는
타당하다(`vitest.config.ts`의 `environment: "node"`, jsdom·testing-library 미설치, 런타임 의존성 8개
유지 방침). 문제는 **대체 수단을 Phase 1에만 적용한 것**이다.

이 저장소에는 이미 정답 패턴이 있다 — `convex/drafts.guard.test.ts`(47개), `convex/aiPipeline.guard.test.ts`(20개)가
`readFileSync`로 소스를 읽어 불변식을 고정한다. Phase 3·4도 같은 방식으로 기계적으로 검증 가능하다.

수정: §7에 아래를 추가한다.

```ts
// lib/uiFoundation.guard.test.ts  (경로 주의 — 소견 6 참고)
const read = (p: string) => readFileSync(join(ROOT, p), "utf-8");

it("파괴적 액션에 window.confirm이 남아 있지 않다", () => {
  for (const f of UI_FILES) expect(read(f)).not.toMatch(/window\.confirm/);
});
it("Sidebar 활성 링크에 aria-current가 있다", () =>
  expect(read("components/app/Sidebar.tsx")).toMatch(/aria-current=/));
it("Progress가 progressbar 역할과 값을 노출한다", () => {
  const s = read("components/ui/Progress.tsx");
  expect(s).toMatch(/role="progressbar"/);
  expect(s).toMatch(/aria-valuenow/);
});
it("AppShell에 skip-link와 main#main이 있다", () => {
  const s = read("components/app/AppShell.tsx");
  expect(s).toMatch(/href="#main"/);
  expect(s).toMatch(/<main[^>]*id="main"/);
});
it("UsageMeter가 모바일에서 숨지 않는다", () =>
  expect(read("components/app/UsageMeter.tsx")).not.toMatch(/hidden\s+w-44\s+sm:block|hidden[^"]*sm:block/));
it("랜딩 CTA가 focus-visible 링을 갖는 공통 클래스를 쓴다", () =>
  expect(read("app/page.tsx")).toMatch(/buttonClasses\(/));
```

Phase 2는 순수 함수 테스트로 커버 가능하다(소견 10·11의 규칙을 그대로 케이스화).

---

**6. 새 가드 테스트가 `vitest` 수집 범위 밖이면 조용히 실행되지 않는다**

`vitest.config.ts`의 `include`는 `["convex/**/*.test.ts", "lib/**/*.test.ts"]`다. §7.4·§7.5가 요구하는
가드 테스트를 `components/ui/*.test.ts`나 `app/**`에 두면 **수집되지 않고 CI는 초록으로 통과한다.**
"잔존 0건 고정"이라는 요구가 무음 no-op이 된다. 기획서는 이 제약을 언급하지 않는다.

수정: §7에 한 문장 추가 — "UI 가드 테스트는 `lib/` 아래에 둔다(`lib/uiFoundation.guard.test.ts`).
`vitest.config.ts`의 `include`는 이미 `lib/**/*.test.ts`를 포함하므로 설정 변경이 불필요하다.
`app/`·`components/` 아래에는 테스트를 두지 않는다." (또는 `include`에 두 경로를 추가한다 — 둘 중
하나를 기획서에서 고른다.)

---

### MEDIUM

**7. `ConfirmDialog`의 선언형 API가 4개 호출부의 명령형 흐름과 맞지 않는다**

§3.2는 `onConfirm` 콜백형 API를 정의했다. 그런데 교체 대상 4곳은 모두 `async` 함수 **중간에서**
확인 결과를 동기적으로 받아 흐름을 계속한다. 예: `campaigns/[id]/page.tsx:600~640`의 `wrap("send", async () => { ... const ok = window.confirm(...); if (!ok) return; await scheduleCampaign(...) })`.
선언형 `<ConfirmDialog onConfirm>`으로 바꾸려면 이 흐름을 대기 상태로 쪼개야 하는데, 어떻게 쪼갤지가
기획서에 없다. 구현자가 임의로 판단하면 발송 코드 경로가 예상 밖으로 재구성된다(가장 위험한 코드다).

수정: `useConfirm()`을 함께 정의해 호출부 구조를 보존한다.

```tsx
// components/ui/Dialog.tsx
const confirm = useConfirm();
const ok = await confirm({ title: "…", description: "…", confirmLabel: "발송", variant: "danger" });
if (!ok) return;
```
`ConfirmProvider`는 `<dialog>` 하나를 유지하고 `Promise<boolean>`를 resolve한다(`close`/ESC → `false`).
`onConfirm` 콜백형 래퍼가 추가로 필요한지 여부도 명시한다(불필요하면 만들지 않는다).

---

**8. Toast Provider 위치에 대해 §3.1과 §8이 상호배타적 지시를 한다**

§3.1: "`AppShell` 안에 두면 인증 전 화면에서 못 쓴다 → `ConvexClientProvider` 내부."
§8: "+5kB 이상이면 `AppShell`로 내린다."
후자를 실행하면 전자의 근거(signin에서 토스트 사용)가 무효가 된다. 어느 쪽이 이기는지, 측정을 언제
누가 어떤 명령으로 하는지(그리고 107kB 기준값의 출처)가 없다. 참고로 `app/layout.tsx`가 모든 라우트를
`ConvexClientProvider`로 감싸는 것은 사실이라 전제 자체는 맞다.

수정: 결론을 하나로 고정한다. 권장: "`ConvexClientProvider` 내부에 둔다. 번들 영향은 수용한다 —
컴포넌트는 의존성 0이고 signin 실패 문구를 토스트로 옮기는 것이 이번 범위이기 때문이다. `AppShell`로
내리는 대안은 폐기한다." (측정 조건을 남기려면 "`pnpm build` 출력의 `/` First Load JS 기준 +5kB"처럼
명령과 지표를 특정하고, 초과 시 대안은 'AppShell 이동'이 아니라 'signin은 인라인 유지'로 바꾼다.)

---

**9. ② 발신 수단 판정이 Gmail 행 존재만으로 done — 스키마 주석과 모순된다**

§4.1은 `senderConnected = gmailAccounts 또는 smtpAccounts 행 존재`로 정의했다. 그런데
`convex/schema.ts`의 `sendModeValidator` 주석은 "`gmail_drafts`는 발송이 아니라 Gmail 초안 생성이다…
기자 메일함으로 실제 메일이 나가는 것은 `smtp`뿐이다"라고 못 박는다. Gmail만 연결한 사용자는 ②가
완료되고 배너도 사라지지만 **메일은 여전히 나가지 않는다.** §4.2가 붙이려는 문구
"연결하지 않으면 메일이 나가지 않습니다"와 정면으로 어긋난다. `senderNeedsCheck`도 SMTP `lastStatus`만
보므로 Gmail 토큰 만료는 잡히지 않는다(`gmailAccounts.getConnection`은 `email`만 반환한다 — 상태 필드가 없다).

수정: `senderKind`를 문구에 반영하는 규칙을 명시한다.

- `senderKind === "smtp"` → ② 완료, 설명 "기자에게 실제 메일이 나갑니다".
- `senderKind === "gmail"` → ② **부분 완료**로 표시(체크는 하되 경고 톤): "Gmail 연결은 초안 생성까지만
  가능합니다. 실제 발송에는 SMTP 연결이 필요합니다." + `/settings` 링크.
- 배너는 `senderKind === "none"`일 때만 띄운다(현행 유지).
- Gmail 토큰 상태 판정은 이번 범위 밖임을 §2 Non-goals에 적는다.

---

**10. ⑤ 첫 발송 판정이 `record_only`(0통 발송)로도 참이 된다**

`campaigns.list`의 `sentCount`는 `drafts.filter(d => d.status === "sent" || d.status === "published").length`다
(검증 완료). `record_only` 경로는 메일을 한 통도 보내지 않고 초안을 `sent`로 기록한다(스키마 주석 +
`campaigns/[id]` 발송 분기 확인). 따라서 "첫 발송" 단계가 실제 발송 없이 닫힌다 — 온보딩 목표
("가입 후 첫 발송까지")를 스스로 무너뜨린다.

수정: ⑤의 정의를 기획서에 못 박는다. 쿼리 추가 없이 가능한 선택은 둘이다.

- (권장) ⑤ = `campaigns.some(c => c.sentCount > 0)` **그대로 두되** 라벨을 "첫 발송 기록"으로 바꾸고
  설명에 "크랩피치 밖에서 보낸 건도 포함됩니다"를 넣는다(현재 데이터로 구분 불가함을 인정).
- 진짜 발송만 세려면 `emailDrafts`에 발송 수단이 없으므로 `campaigns.sendMode !== "record_only"` 조건을
  추가해야 한다: ⑤ = `campaigns.some(c => c.sentCount > 0 && c.sendMode !== "record_only")`.
  (레거시 `undefined`는 `record_only` 취급이라는 스키마 규칙과 일치. 단 즉시발송 건은 `sendMode`가
  비어 있을 수 있으므로 이 식이 참이 되지 않을 위험을 확인해야 한다 — 확인 결과를 기획서에 적는다.)

---

**11. 데모 시드가 ③④를 즉시 완료 처리한다 — 체크리스트 바로 옆 CTA다**

`convex/seed.ts:seedDemoForMe`는 `campaigns`(status `matched`) 1건 + `matches` 최대 12건을 삽입한다
(`emailDrafts`는 삽입하지 않는다). 따라서 데모 버튼 한 번으로 ③ 첫 캠페인과 ④ 첫 매칭이 완료된다.
§4.2는 그 버튼을 EmptyState에 **남기기로** 했으므로, 사용자는 체크리스트 옆 버튼으로 진행률 2/5를
가짜로 올리게 된다. 기획서에 이 상호작용이 없다.

또한 시드는 `agencyClientId`를 넣지 않아, 에이전시 모드(`activeClientId` 설정 시)에서는 만든 캠페인이
`campaigns.list`(by_client)에 보이지 않는다 — 데모를 눌러도 체크리스트가 안 움직인다.

수정: 규칙을 하나 고른다. (a) 데모 시드 캠페인을 판정에서 제외한다(시드 캠페인 이름/새 플래그로 식별 —
스키마 변경 필요), 또는 (b) **허용하고 명문화한다**: "데모 데이터는 ③④를 완료시킨다. 체험 경로를
막지 않는 것이 낫다고 판단했다. ⑤ 발송은 데모로 채워지지 않으므로 체크리스트가 사라지지는 않는다."
어느 쪽이든 §4와 §8에 한 줄 필요하다. 에이전시 모드에서 데모가 무반응인 점도 §8 위험에 추가한다.

---

**12. 에이전시 모드 체크리스트가 정의되지 않았다**

§8은 "문구에 '발신 수단은 계정 공통'을 명시"로 대응했지만, 실제 문제는 더 크다.

- `agencyClients` 스키마에는 `boilerplate`가 **없다**(`agencyId`/`name`/`contactEmail`/`notes`/`createdAt`).
  즉 ①은 에이전시 자신의 `profiles.boilerplate`를 본다 — 클라이언트를 바꿔도 값이 같다.
- ③④⑤는 `campaigns.list`(by_client)라 클라이언트 전환마다 리셋된다. 결과적으로 새 클라이언트를
  추가할 때마다 진행률이 2/5로 돌아가고 체크리스트가 다시 나타난다. 이게 의도인지 기획서에 없다.
- `campaigns.list`는 `activeClientId`가 있어도 **멤버십 확인에 실패하면 조용히 `by_user`로 폴백**한다
  (`convex/campaigns.ts:16~30`). §0은 "축 불일치를 상속하지 않는다"고 했지만 이 폴백은 상속된다.

수정: §4에 "에이전시 모드 동작" 문단을 추가하고 결정을 적는다. 권장:

- `activeClientId`가 설정된 동안 체크리스트는 **③④⑤만** 표시하고 진행률을 `n/3`으로 낸다.
  ①②는 "계정 공통 설정"으로 분리된 회색 줄로 내려 상태만 보여 준다(CTA 강조 대상에서 제외).
- 클라이언트 전환으로 체크리스트가 다시 나타나는 것은 의도된 동작임을 명시한다.
- 멤버십 폴백은 이번에 고치지 않음을 Non-goals에 추가한다.

---

**13. 배너 규칙이 절반만 정의됐다 — 중복 노출·스누즈 키·읽기 시점**

§4.2에 없는 것: (a) 대시보드에서 체크리스트 ②와 배너가 동시에 같은 말을 하는 문제(배너를 숨길지),
(b) `localStorage` **키 이름**, (c) 24시간 계산 방식과 저장 형식, (d) SSR/hydration 안전한 읽기 시점
(렌더 중 `localStorage` 접근은 불가 — 기존 `ThemeToggle`은 `useEffect`로 처리한다), (e) `AppShell`
트리에서의 위치(`Topbar` 위/아래, `MobileNav`와의 순서), (f) 숨김 경로 판정 범위(`/settings`만인가
하위 경로 포함인가).

수정: 아래를 §4.2에 명기한다.

```
키: "crabpitch-sender-banner-snoozed-until"  값: epoch ms 문자열
표시 조건: senderKind === "none"
        && !pathname.startsWith("/settings")
        && !(pathname === "/dashboard" && 체크리스트가 렌더 중)   ← 중복 제거
        && (mounted && Number(localStorage[키] ?? 0) < Date.now())
읽기: useEffect로 mounted 후 1회 — 서버 렌더에서는 배너를 렌더하지 않는다
위치: AppShell의 <Topbar /> 바로 아래, <MobileNav /> 위
닫기: localStorage[키] = String(Date.now() + 24*60*60*1000)
```

---

**14. `boilerplate` 입력 판정 규칙이 없다 — 빈 문자열 패치 때문에 truthy 판정이 깨진다**

`app/(app)/settings/page.tsx:74`의 `saveProfile`은 `update(form)`으로 **폼 전체**를 보내므로, 저장 한 번에
`boilerplate: ""`가 patch된다. `updateProfile`에는 어떤 검증도 없다. `profileDone`을 truthy로 판정하면
`""`는 false지만, 공백 한 칸이나 `.` 한 글자는 true가 된다.

수정: §4.1에 규칙을 적는다 — `profileDone = (profile.boilerplate ?? "").trim().length >= 10`
(10자 근거: 문장 한 줄의 최소치. 폼 쪽 검증과 동일 상수를 공유한다.) 소견 4의 `profileConfirmedAt`
방식을 택하면 이 항목은 대신 "저장 성공 시 타임스탬프 기록"으로 대체된다.

---

**15. `FormField`를 적용하는 두 폼에 오류 원천이 없다 — 검증 규칙 미정**

§3.5는 "서버가 필드별 오류를 돌려주는 곳이 없다"는 관찰까지는 맞다(확인 완료: `updateProfile` 무검증,
`smtpAccounts`는 `normalizeEmail`이 mutation throw). 그런데 그 상태로 `settings` 발신 아이덴티티 폼과
`SmtpConnect`에 `FormField`를 적용하면 `error`가 항상 `undefined`여서 **관측 가능한 변화가 0**이고
"실효를 확인"할 수 없다. 어떤 검증을 클라이언트에 새로 넣을지가 없다.

수정: 검증 규칙을 §3.5에 표로 확정한다(전부 클라이언트 측, 제출 전 판정).

| 필드 | 규칙 | 오류 문구 |
|---|---|---|
| `companyName` | trim 1~50자 | "회사명을 입력해 주세요." |
| `contactEmail` | 비어 있지 않고 `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | "올바른 이메일 주소가 아닙니다." |
| `boilerplate` | trim 10~300자(소견 14와 동일 상수) | "회사 소개를 한 줄 이상 적어 주세요." |
| `SmtpConnect` 이메일 | 위와 같은 정규식(서버 `normalizeEmail`과 일치) | 동일 문구 |

그리고 `saveProfile`에 `try/catch`를 넣어 실패 시 `toast.error(toUserMessage(e))`를 띄운다(현재는 실패해도
아무 표시가 없다 — 미처리 rejection).

---

**16. `toUserMessage`의 정규화 규칙이 정의되지 않았다**

§3.1은 "알려진 접두(`Uncaught Error:` 등)를 벗긴다"만 적었다. 접두 목록이 "등"으로 열려 있고, Convex
클라이언트가 던지는 문자열에는 Request ID·`Server Error`·스택 라인이 함께 오는 경우가 있어 접두 제거만
으로는 사용자 문구가 남지 않는다. 또 `Error`가 아닌 값(문자열/객체)과 `ConvexError` 구분도 없다.

수정: 규칙과 테스트 케이스를 함께 못 박는다(`lib/errorMessage.ts` + `lib/errorMessage.test.ts`).

```
1) Error가 아니면 typeof string일 때만 그 값을 쓰고, 그 외는 기본 문구.
2) 메시지를 줄 단위로 나눠 앞뒤 공백 제거.
3) /^\[Request ID: [^\]]+\]\s*/, /^Server Error\s*/, /^Uncaught (Error|ConvexError):\s*/ 를 순서대로 제거.
4) /^\s*at\s/ 로 시작하는 라인 이후는 전부 버린다.
5) 남은 첫 줄이 빈 문자열이면 기본 문구 "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
6) 그 외에는 원문을 그대로 통과시킨다(도메인 한글 문구 보존 — 파일럿 게이트·예약 수단 미연결 등).
```
테스트 케이스: 위 6종 + "이미 한글 도메인 문구" + "빈 문자열" + `undefined`.

---

**17. Toast의 politeness 설계가 구현 불가능한 형태로 적혀 있다**

§3.1: "`aria-live="polite"` + `role="status"` 컨테이너(에러는 `assertive`)". 하나의 컨테이너에 두 politeness를
동시에 둘 수 없고, 이미 마운트된 live region의 `aria-live`를 런타임에 바꾸면 스크린리더가 안정적으로
읽지 않는다(`role="status"`는 암묵적으로 polite다).

수정: **두 개의 live region을 항상 마운트**한다.

```tsx
<div aria-live="polite"   role="status" className="…">{polite.map(...)}</div>
<div aria-live="assertive" role="alert"  className="…">{assertive.map(...)}</div>
```
`toast.error`는 assertive 영역, `success`/`info`는 polite 영역에 넣는다. "스택 최대 3개" 규칙이 두 영역
합계인지 각각인지도 명시한다(권장: 합계 3, 단 `error`는 축출 대상에서 제외 — 8초 유지 규칙과의 충돌 방지).

---

**18. §6의 journalists 카드 전환 브레이크포인트가 실제 코드와 맞지 않는다**

§1 P7은 "테이블 컬럼 `hidden md:table-cell`"이라고 뭉갰지만 실측은 다르다.

```
app/(app)/campaigns/page.tsx:47,48,49,64,65,66   hidden … sm:table-cell   (매칭/초안/발송)
app/(app)/journalists/page.tsx:73,83             hidden … md:table-cell   (beat)
app/(app)/journalists/page.tsx:75,87             hidden … lg:table-cell   (기사수)
app/(app)/campaigns/[id]/page.tsx:283,311,357,367 lg:/md:table-cell       (§6 범위 밖)
```

§6은 campaigns와 journalists 모두 "`sm` 미만에서 카드 전환"이라고 했다. campaigns에는 맞지만
journalists는 **640~1024px 구간에서 beat·기사수가 계속 사라진 채 남는다** — P7이 지적한 문제가 그대로다.

수정: journalists는 "`lg` 미만에서 카드 리스트로 전환"으로 바꾼다(가장 늦게 숨는 컬럼 기준). 또는
컬럼 3개를 카드에 모두 넣고 `md` 미만 전환 + `md~lg`는 `기사수`를 노출로 재배치한다 — 하나를 고른다.
`campaigns/[id]`의 테이블 2개는 이번 범위 밖임을 §2에 적는다. 아울러 "대시보드 최근 캠페인 리스트를
재사용 가능한 형태로 추출"이 journalists(링크 아님)에도 쓰인다는 뜻인지 명확히 한다 — 대시보드 항목은
`<Link>` 행이라 기자 목록과 구조가 다르다.

---

**19. 랜딩 CTA를 `<Link><Button>`으로 바꾸면 `<a>` 안에 `<button>`이 들어간다**

§5의 마지막 항목이 접근성 개선을 목표로 하면서 **무효 HTML과 중복 포커스 스톱**을 만든다
(`<a>`는 대화형 콘텐츠를 자식으로 가질 수 없다). 대시보드가 이미 `<Link><Button>` 패턴을 쓰고 있어
그 결함을 랜딩 5곳으로 확산시키는 셈이다. 참고로 `Button`은 `forwardRef`만 쓰고 `"use client"`가 없어
RSC인 `app/page.tsx`에서 렌더 자체는 가능하다(react-server 조건에서 `forwardRef` export 확인) — 문제는
마크업 중첩이다.

수정: 클래스 추출 방식으로 바꾼다.

```tsx
// components/ui/Button.tsx
export function buttonClasses(opts?: { variant?: Variant; size?: Size; className?: string }): string
// Button 내부도 이 함수를 사용해 단일 출처 유지
// app/page.tsx
<Link href="/signin" className={buttonClasses({ size: "lg" })}>무료로 시작</Link>
```
§5의 항목 문구를 "`<Link>`에 `buttonClasses()` 적용(중첩 금지)"으로 교체한다.

---

**20. §1의 근거 수치 다수가 실측과 다르다 — 회귀 기준으로 쓸 수 없다**

| 기획서 | 실측 | 비고 |
|---|---|---|
| P1 `window.confirm` 3곳 | **4곳** | 소견 1 |
| P3 "스피너는 저장소 전체에 1곳" | **4곳** | `AiProviderKeys.tsx:191,235`(Loader2), `admin/page.tsx:408`·`settings/page.tsx:194`(RefreshCw `animate-spin`) |
| P5 "`aria-invalid`/`aria-describedby` 사용 0건" | **3건 존재** | `campaigns/[id]/page.tsx:1139,1155,1156` — 템플릿 편집기에 이미 올바른 연결 패턴이 있다 |
| P8 "`aria-*` 12건" | **17건** | `aria-label` 6, `aria-pressed` 4, `aria-hidden` 1, `aria-invalid` 2, `aria-describedby` 1 등 |
| P8 "랜딩 CTA 6곳" | **5곳** | `app/page.tsx` 41·66·186·265·345 (`href="/signin"`). 외부 링크 2곳(364·375)은 별개 |
| §6 "9개 탭" | **8개**(관리자만 9) | `components/app/nav.tsx` `NAV` 8 + `ADMIN_NAV` 1 |
| P4 스켈레톤 24곳 | **24곳** | 일치 |

수치가 틀리면 §7의 "잔존 0건" 류 기준과 리뷰어의 확인이 어긋난다. 특히 P5는 **틀린 전제로 설계를
정당화**한다 — 이미 `aria-invalid`+`aria-describedby`를 손으로 연결한 사례가 있으므로 `FormField`는
"수단이 없다"가 아니라 "패턴이 1곳에만 있어 반복 불가"로 근거를 고쳐야 하고, 그 기존 코드를
`FormField` API의 참조 구현으로 삼아야 한다.

---

**21. Phase 간 의존성과 커밋/PR 단위가 없다 — Phase 1~4 일괄 진행은 과대하다**

§7은 "각 Phase는 …병합 가능"이라 하지만 Phase는 서로 독립이 아니다.

- §5(Phase 3) "상태 알림 → Toast가 `aria-live` 담당"은 §3.1(Phase 1) 없이는 성립하지 않는다.
- §6(Phase 4) `UsageMeter` 변경은 §5의 `Progress` 라벨 prop 위에서 이뤄진다.
- §4.2(Phase 2) 배너는 §3.1의 Provider 위치 결정에 영향을 받는다(`AppShell` 이동 시 충돌).

범위 총량도 작지 않다: 신규 프리미티브 4개 + 스켈레톤 24곳 + confirm 4곳 + 인라인 상태 5곳 +
접근성 9항목 + 테이블 2개 카드화 = 40개 파일 내외. 한 커밋/한 PR로 묶으면 회귀 원인 격리가 불가능하다.

수정: §7 앞에 "작업 순서와 병합 단위"를 추가한다. 권장 3분할(각각 독립 병합 가능):

1. **PR#1 Phase 1** — 프리미티브 4개 + `toUserMessage` + confirm 4곳 + 인라인 상태 5곳 전환 + 가드 테스트.
2. **PR#2 Phase 2** — `convex/onboarding.ts` + `lib/onboarding.ts`(+테스트) + 체크리스트 + 배너.
   PR#1 병합 후 시작(토스트·스켈레톤 의존).
3. **PR#3 Phase 3+4** — 접근성 9항목 + 모바일 4항목. `Progress`를 양쪽이 건드리므로 함께 묶는다.

템플릿 5문항 위저드를 연기한 근거(미결 제품 결정 3건 + 실시간 미리보기 기존 구현)는 **타당하다.**
실시간 미리보기·플레이스홀더 삽입 UI가 `campaigns/[id]`에 이미 있고, `OUTLET_TONE`과의 충돌은 실제 미결
사안이다. 이 부분은 수정 불필요.

---

**22. `ThemeToggle` 항목의 진단이 부정확하고 수정 방법이 없다**

§5는 "초기 아이콘 hydration 불일치 수정"이라고 적었다. 실제 코드(`components/ThemeToggle.tsx`)는
`useState(false)` → `useEffect`에서 클래스 확인이므로 **서버·클라이언트 첫 렌더는 일치한다**(불일치
경고는 나지 않는다). 문제는 다크 모드에서 첫 페인트에 달 아이콘이 잠깐 보이는 것이다. 수정 방법
(마운트 전 placeholder / `layout.tsx`의 테마 스크립트에서 초기값 주입 / 쿠키 기반 SSR) 중 무엇을 택할지
없고, `aria-pressed`가 "무엇이 pressed"인지도 정의되지 않았다.

수정: "다크 모드 첫 페인트 시 아이콘이 1프레임 어긋나는 문제를 고친다 — `mounted` 상태를 두고 마운트
전에는 아이콘 자리를 같은 크기의 빈 박스로 렌더한다. `aria-pressed={dark}`(눌림 = 다크 모드 활성)
+ `aria-label`은 '다크 모드'로 고정한다."로 교체한다.

---

**23. `role="progressbar"` 접근명이 절반만 채워진다**

§5는 `Progress`에 `aria-label`을 **optional**로 추가하고 `UsageMeter`에만 전달한다. 그런데 `Progress`
사용처는 3곳이다 — `UsageMeter.tsx:20`, `media-kit/page.tsx:89`, `media-kit/page.tsx:757`. 뒤 두 곳은
`role="progressbar"`만 붙고 접근명이 없어 오히려 "이름 없는 progressbar" 위반을 새로 만든다.
Phase 2에서 추가되는 온보딩 `Progress`도 같은 문제를 갖는다.

수정: `label`을 **필수 prop**으로 만들고(타입 에러로 누락을 컴파일 타임에 잡는다) 3곳 문구를 지정한다
— `"이번 달 발송 사용량"`, `"미디어킷 완성도"`, `"보도자료 점수"`, 온보딩은 `"온보딩 진행률"`.

---

### NIT

**24. `mediaKitDone`을 반환하되 쓰지 않는 것은 이번 범위 밖의 코드다.** §4.1이 스스로 "이번엔 쓰지
않는다"고 적었다. 미사용 반환 필드는 다음 단계에서 추가하면 되므로 지금 넣지 않는다(또는 왜 지금
넣어야 하는지 한 줄을 적는다).

**25. EmptyState CTA 규칙의 조건이 공허하다.** §4.2 "체크리스트가 렌더될 때 EmptyState의 CTA는
'데모 데이터 생성'만 남긴다" — EmptyState는 `campaigns.length === 0`일 때만 렌더되고, 그때는 ③이
미완료이므로 체크리스트가 **항상** 렌더된다. 즉 조건부가 아니라 무조건이다. "EmptyState의
'새 보도자료 작성' CTA를 제거한다(상단 체크리스트가 그 역할을 한다)"로 단정형으로 고친다.

**26. §0의 "`ensureProfile`가 절대 채우지 않는 유일한 필드다"는 과장이다.** `ensureProfile`는
`boilerplate` 외에도 `activeAgencyId`·`activeClientId`·`preferredAiProvider`·`preferredLlmProvider`·
`isPlatformAdmin`을 채우지 않는다. "발신 아이덴티티 폼 필드 중 유일하게 자동 채워지지 않는 필드"로
정확히 쓴다.

**27. `getMyChecklist`를 `AppShell`에서 구독하면 앱 전 페이지에 쿼리 1개가 늘어난다.** 배너를 숨기는
`/settings`에서도 구독은 유지된다. 수용 가능하지만 §8 위험 표에 한 줄 남기는 게 낫다.

**28. 랜딩 번들 기준값 107kB의 출처가 없다.** `docs/PROJECT_ANALYSIS.md`에도 없다. §8에 측정 명령과
측정 시점 커밋을 적는다(`pnpm build` 출력의 `/` First Load JS).

**29. P6의 "7화면 / 15+클릭"은 재현 절차가 없어 검증 불가하다.** 판정 기준이 아니라 동기 설명이므로
치명적이지 않지만, 경로(어느 화면 → 어느 화면)를 각주로 남기면 완료 후 비교가 가능해진다.

---

## Verified Assumptions (코드로 확인됨)

1. **`journalists`에 `userId`가 없다** — `convex/schema.ts` `journalists` 정의에 사용자 축 필드 없음,
   인덱스는 `by_email`/`by_beat`뿐. ✅
2. **동기화는 사용자 행위가 아니다** — `convex/crons.ts`가 `crons.daily("sync journalist packs", {hourUTC:18,minuteUTC:30}, internal.opencrabActions.syncPacksInternal)`로 일 1회 실행. 관리자 수동 경로 별도. ✅
   (단 `settings` 화면에 사용자가 누를 수 있는 `syncJournalists` 테스트 버튼이 있다 — 194행. 온보딩
   단계로 쓰지 않는다는 결론은 그대로 유효.)
3. **`ensureProfile`가 `companyName`을 항상 채운다** — `companyName: args.companyName ?? user?.name ?? "내 회사"`.
   `senderName`/`contactEmail`도 `user.name`/`user.email`로 채운다. `boilerplate`는 채우지 않는다. ✅
4. **`AppShell`이 마운트마다 `ensureProfile`을 호출한다** — `EnsureProfile` 컴포넌트의 `useEffect`. ✅
5. **`campaigns.list`가 `matchCount`/`sentCount`를 반환한다** — `convex/campaigns.ts:52~58`에서
   `matchCount`, `draftCount`, `sentCount`, `replyCount` 부착. ✅
6. **`campaigns.list`는 `activeClientId`가 있으면 `by_client`로 전환한다** — 확인. (단 멤버십 확인 실패 시
   `by_user` 폴백 — 소견 12) ✅
7. **`usage.getAnalytics`는 `activeClientId`를 무시하고 항상 `by_user`를 쓴다** — `convex/usage.ts` 확인. ✅
8. **`gmailAccounts`·`smtpAccounts`·`mediaKits`에 `agencyClientId`가 없다** — 스키마 전체에서
   `agencyClientId`는 `pressReleases`·`campaigns`에만 존재. ✅
9. **`smtpAccounts.getConnection`이 `lastStatus`/`lastError`/`lastCheckedAt`를 반환한다** — 확인. ✅
10. **클라이언트 경계는 `app/ConvexClientProvider.tsx` 하나이고 랜딩·signin·앱이 공유한다** —
    `app/layout.tsx`가 `<body>` 전체를 감싼다. ✅
11. **P2 근거** — `settings`의 `gmailMsg`(330행)/`ocMsg`(197행), `agency`의 `msg`(74행) 모두 성공·실패를
    한 변수에 담고 `text-foreground-muted`로만 렌더. ✅
12. **`Button`에 `loading` prop이 없다** — `components/ui/Button.tsx` 확인. ✅
13. **스켈레톤 24곳** — `animate-pulse` 총 24건(13개 파일). ✅
14. **`role=` 0건 / `aria-live` 0건 / `aria-current` 0건 / `Progress`에 `role="progressbar"` 없음** — 확인. ✅
15. **`UsageMeter`가 `hidden … sm:block`으로 모바일에서 사라진다** — `components/app/UsageMeter.tsx:13`. ✅
16. **랜딩 CTA에 `focus-visible` 링이 없다** — `app/page.tsx`의 signin 링크 5곳 모두 인라인 클래스,
    `focus-visible:` 없음. ✅
17. **렌더 테스트 하네스가 없다** — `vitest.config.ts` `environment: "node"`, jsdom·testing-library 미설치.
    소스 스캔 가드 패턴은 이미 존재(`convex/drafts.guard.test.ts` 47 tests). 현재 `pnpm test` = 33 files /
    602 tests 전부 통과(기준선). ✅
18. **`Button`을 RSC인 랜딩에서 렌더하는 것은 가능하다** — `react/react.react-server.js`가 `forwardRef`를
    export. (다만 소견 19의 중첩 문제는 별개) ✅

## Unverified / Wrong Assumptions

1. **틀림 — `window.confirm` 3곳.** 실제 4곳(예약 SMTP 확인 누락). → 소견 1.
2. **틀림 — "`aria-invalid`/`aria-describedby` 사용 0건".** `campaigns/[id]/page.tsx:1139,1155,1156`에 존재.
   → 소견 20.
3. **틀림 — "`aria-*` 12건".** 실제 17건. → 소견 20.
4. **틀림 — "스피너는 저장소 전체에 1곳".** 실제 4곳. → 소견 20.
5. **틀림 — "랜딩 CTA 6곳".** signin CTA는 5곳. → 소견 20.
6. **틀림 — "9개 탭".** 일반 사용자 8개, 플랫폼 관리자만 9개. → 소견 20.
7. **부정확 — "테이블 컬럼 `hidden md:table-cell`".** `hidden md:table-cell`은 journalists의 beat 1개뿐이고,
   campaigns는 `sm:table-cell`, journalists 기사수는 `lg:table-cell`이다. → 소견 18.
8. **부정확 — "`boilerplate`는 `ensureProfile`가 절대 채우지 않는 유일한 필드".** 다른 optional 필드들도
   채우지 않는다. → 소견 26.
9. **누락된 사실(기획서가 확인하지 않음) — `profiles.boilerplate`는 어디에서도 읽히지 않는다.**
   `campaigns/new`는 `mediaKits.boilerplate`를 쓴다(`app/(app)/campaigns/new/page.tsx:94`). 온보딩 게이트의
   근거가 무너진다. → 소견 4.
10. **누락된 사실 — `seedDemoForMe`가 캠페인+매칭을 삽입해 ③④를 즉시 완료시킨다.** → 소견 11.
11. **누락된 사실 — Gmail 연결만으로는 실제 발송이 불가능하다**(스키마 주석: 실발송은 `smtp`뿐).
    ② 판정과 문구가 어긋난다. → 소견 9.
12. **누락된 사실 — `sentCount`는 `record_only`로 기록된 초안을 포함한다.** → 소견 10.
13. **누락된 사실 — `vitest` `include`가 `convex/**`·`lib/**`뿐이다.** UI 가드 테스트 위치 제약. → 소견 6.
14. **누락된 사실 — `settings`의 `saveProfile`에 오류 처리가 없다**(`update(form)` 후 바로 `setSaved(true)`).
    → 소견 15.
15. **누락된 사실 — `agencyClients`에 회사 소개/보일러플레이트 필드가 없다.** 에이전시 모드에서 ①은
    클라이언트와 무관하다. → 소견 12.
16. **검증 불가 — 랜딩 번들 107kB.** 저장소 문서에 근거 없음, 빌드 산출물로도 확인 불가. → 소견 28.
17. **검증 불가 — "7화면 / 15+클릭".** 재현 경로 미기재. → 소견 29.
18. **검증 불가(수용) — 네이티브 `<dialog>` Baseline 2022 / Safari 15.4+.** 저장소에 지원 브라우저 정의가
    없다는 §8의 서술은 사실(`package.json`에 browserslist 없음). 결정 자체는 합리적이다 — 포커스 트랩
    자체 구현이 0건인 상태에서 브라우저 제공 동작을 쓰는 것이 위험이 낮다. 다만 §3.2에
    "`showModal()` 미지원 브라우저에서는 확인 없이 진행하지 않고 버튼을 비활성화한다"처럼 폴백 규칙
    한 줄은 필요하다(파괴적 액션이므로 무확인 진행은 금지).

---

## 설계 결정에 대한 판단 요약

| 결정 | 판단 |
|---|---|
| Toast Provider를 `ConvexClientProvider`에 둔다 | **근거는 타당**(유일한 클라이언트 경계, signin 공유 — 확인됨). 단 §8의 롤백 조항과 모순 → 소견 8 |
| 네이티브 `<dialog>` | **타당.** 폴백 규칙만 추가 → Unverified 18 |
| `Button.loading`이 라벨 교체를 "보완" | **불명확 + 구현 불가.** API를 다시 써야 함 → 소견 3 |
| `FormField` children-as-function | **패턴 자체는 타당**(`Input`/`Textarea`/native `select` 혼재는 사실). 다만 오류 원천이 없어 적용해도 효과 0 → 소견 15 |
| 온보딩 서버 쿼리 + 클라이언트 계산 하이브리드 | **축 불일치 회피 목적은 타당.** 그러나 에이전시 모드에서 ①②(사용자 축)와 ③④⑤(클라이언트 축)가 한 진행률에 섞이는 문제를 문구로만 덮었다 → 소견 12 |
| `boilerplate`로 프로필 완료 판정 | **부적절.** 죽은 필드를 게이트로 삼는다 → 소견 4 |
| 템플릿 위저드 연기 | **타당.** 수정 불필요 |
| 렌더 테스트 하네스 미도입 | **결정은 타당**(node 환경·의존성 최소 방침·기존 가드 패턴). 그러나 대체 수단을 Phase 1에만 적용해 Phase 2~4가 무검증 → 소견 5 |
| Phase 1~4 일괄 진행 | **분할 권장.** 3 PR로 쪼갤 것 → 소견 21 |

## 판정

**보류(CHANGES_REQUESTED).** HIGH 6건, MEDIUM 12건.

착수를 막는 최소 조건은 다음 6건이다.

1. `window.confirm` 목록을 4곳으로 정정(§1·§3.2) — 지금 상태로는 §7.4가 반드시 실패한다.
2. P2 전환 대상 호출부 목록 확정(§3에 신설) — 없으면 Phase 1이 "만들고 안 쓰기"로 끝난다.
3. `Button.loading` API 재정의(`icon` prop) + 채택 호출부 목록.
4. ① 판정 기준을 `profiles.boilerplate`에서 `profileConfirmedAt`(또는 배선)으로 교체.
5. §7에 Phase 2·3·4의 소스 스캔 가드 기준 추가.
6. 가드 테스트 배치 경로를 `lib/` 로 명시(`vitest` include 제약).

MEDIUM 12건은 구현자가 임의 판단하게 되는 지점들이다(ConfirmDialog 통합 방식, Provider 위치 최종안,
②⑤ 판정 의미, 데모 시드·에이전시 모드·배너 규칙, 검증 규칙, Toast politeness, 브레이크포인트, PR 분할).
HIGH 6건과 함께 기획서에 반영하고 다시 올리면 착수 가능한 수준이 된다. 반영은 문서 수정만으로
가능하며 새로운 조사가 필요한 항목은 없다.
