import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * UI 기반 구조 가드.
 *
 * ⚠️ 이 파일은 반드시 `lib/` 아래에 있어야 한다. `vitest.config.ts`의 `include`는
 *    `["convex/**\/*.test.ts", "lib/**\/*.test.ts"]`뿐이므로 `components/`나 `app/` 아래에 두면
 *    **수집되지 않고 CI가 초록으로 통과한다** — 가드가 무음 no-op이 된다.
 *
 * 렌더 테스트 하네스(jsdom·testing-library)는 도입하지 않는다(`environment: "node"`,
 * 런타임 의존성 최소 방침). 대신 `convex/drafts.guard.test.ts`가 쓰는 소스 스캔 패턴으로
 * "되돌아갈 수 있는 지점"만 고정한다.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf-8");

/**
 * 주석을 제거한 소스 — "이 식별자를 쓰지 않는다"류 가드에 쓴다.
 *
 * 왜 필요한가: 주석은 **왜 그것을 쓰지 않았는지**를 설명하려고 금지된 식별자를 언급한다
 * (예: "`getAnalytics`는 `activeClientId`를 무시하므로 쓰지 않는다"). 산문 언급까지 잡으면
 * 가드를 통과시키려고 같은 실수를 막아 주는 기록을 지워야 한다 — 가드가 문서를 해친다.
 * `lib/errorMessage.ts` 가드에서 이미 같은 판단을 했다(정규식 리터럴만 검사).
 */
const readCode = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // 앞에 공백이나 줄 시작이 오는 경우만 — `https://`의 `//`를 건드리지 않는다.
    .replace(/(^|\s)\/\/.*$/gm, "$1");

/**
 * 파괴적 액션 호출부 — `window.confirm`이 남아 있으면 안 된다.
 *
 * 저장소 전체를 검사하면 안 된다: `components/ui/Dialog.tsx`는 `showModal()` 미지원
 * 브라우저를 위한 폴백으로 `window.confirm`을 **의도적으로** 갖고 있다(파괴적 액션에서
 * 무확인 진행은 금지이므로). 전체 검사로 쓰면 가드가 자기 설계를 거부한다.
 */
const CONFIRM_FREE_FILES = [
  "app/(app)/campaigns/[id]/page.tsx",
  "components/app/UserMcpKeys.tsx",
];

describe("확인 대화상자", () => {
  for (const f of CONFIRM_FREE_FILES) {
    it(`${f}: window.confirm이 남아 있지 않다`, () => {
      expect(read(f)).not.toMatch(/window\.confirm/);
    });

    it(`${f}: useConfirm을 쓴다`, () => {
      expect(read(f)).toContain("useConfirm");
    });
  }

  it("window.confirm은 Dialog 폴백에만 존재한다", () => {
    const s = read("components/ui/Dialog.tsx");
    // 폴백이 사라지면 미지원 브라우저에서 확인 없이 파괴적 액션이 진행된다.
    expect(s).toContain("supportsModalDialog");
    expect(s).toMatch(/window\.confirm/);
  });

  it("네이티브 dialog의 showModal을 쓴다 — 포커스 트랩을 직접 구현하지 않는다", () => {
    const s = read("components/ui/Dialog.tsx");
    expect(s).toContain("showModal()");
    // 어떤 경로로 닫혀도 취소로 확정해야 한다(ESC·backdrop 포함).
    expect(s).toContain("onClose");
  });

  it("확인 API는 Promise<boolean>이다 — 호출부의 명령형 흐름을 보존한다", () => {
    // 선언형 onConfirm 콜백으로 바꾸면 발송 코드 경로를 재구성해야 한다.
    expect(read("components/ui/Dialog.tsx")).toMatch(/Promise<boolean>/);
  });
});

describe("Button 프리미티브", () => {
  const src = read("components/ui/Button.tsx");

  it("loading·icon prop과 aria-busy를 노출한다", () => {
    expect(src).toMatch(/loading\?: boolean/);
    expect(src).toMatch(/icon\?: LucideIcon/);
    expect(src).toMatch(/aria-busy/);
    // loading이면 눌리지 않아야 한다.
    expect(src).toMatch(/disabled=\{disabled \|\| loading\}/);
  });

  it("buttonClasses를 export하고 Button 내부도 그것을 쓴다(단일 출처)", () => {
    expect(src).toMatch(/export function buttonClasses/);
    expect(src).toMatch(/className=\{buttonClasses\(/);
  });

  it("스피너를 손으로 넣은 곳이 남아 있지 않다", () => {
    // 프리미티브가 없어서 각 호출부가 자기 Loader2를 넣고 있었다.
    //
    // ⚠️ `animate-spin` 전면 금지는 쓰지 않는다 — 스피너와 무관한 정당한 회전 아이콘
    //    (예: "동기화 중"을 표현하는 RefreshCw)까지 영구 금지하게 된다.
    //    진행 표시를 `Button.loading`으로 통일했는지만 본다.
    for (const f of ["components/app/AiProviderKeys.tsx", "app/(app)/settings/page.tsx"]) {
      expect(read(f), f).not.toMatch(/Loader2/);
      expect(read(f), f).toMatch(/loading=\{/);
    }
    // 스피너 컴포넌트를 아는 곳은 프리미티브 하나여야 한다.
    expect(read("components/ui/Button.tsx")).toContain("Loader2");
  });
});

describe("Toast 프리미티브", () => {
  const src = read("components/ui/Toast.tsx");

  it("politeness가 다른 live region을 2개 항상 마운트한다", () => {
    // 한 컨테이너에 두 politeness를 둘 수 없고, 런타임에 aria-live를 바꾸면
    // 스크린리더가 안정적으로 읽지 않는다.
    expect(src).toMatch(/aria-live="polite"/);
    expect(src).toMatch(/aria-live="assertive"/);
    expect(src).toMatch(/role="status"/);
    expect(src).toMatch(/role="alert"/);
  });

  it("에러는 더 오래 남고 축출되지 않는다", () => {
    expect(src).toMatch(/error:\s*8000/);
    expect(src).toMatch(/kind !== "error"/);
  });

  it("Provider가 유일한 클라이언트 경계에 배선돼 있다 — 랜딩·signin도 쓸 수 있어야 한다", () => {
    const provider = read("app/ConvexClientProvider.tsx");
    expect(provider).toContain("ToastProvider");
    expect(provider).toContain("ConfirmProvider");
  });
});

describe("Skeleton 프리미티브", () => {
  it("콘텐츠 형태별 변형을 제공한다", () => {
    const src = read("components/ui/Skeleton.tsx");
    for (const name of ["Skeleton", "SkeletonText", "SkeletonCard", "SkeletonRows"]) {
      expect(src).toContain(`export function ${name}`);
    }
    // 로딩 자리표시자는 보조 기술에 읽히면 의미 없는 반복이 된다.
    expect(src).toMatch(/aria-hidden/);
  });

  /**
   * ⚠️ export 존재만 검사하면 **dead code를 불변식으로 고정**한다.
   *    기획 §3.4의 요구는 "만든다"가 아니라 "콘텐츠 형태에 맞게 **쓴다**"였다.
   *    실제로 카드·표 자리에 쓰이는지 호출부에서 확인한다.
   */
  it("변형이 실제로 쓰인다 — 전부 같은 회색 블록이면 만든 의미가 없다", () => {
    const callSites = [
      "app/(app)/campaigns/page.tsx",
      "app/(app)/journalists/page.tsx",
      "app/(app)/replies/page.tsx",
      "app/(app)/dashboard/page.tsx",
      "app/(app)/media-kit/page.tsx",
      "app/(app)/campaigns/[id]/page.tsx",
      "app/(app)/settings/page.tsx",
    ]
      .map(read)
      .join("\n");
    for (const name of ["SkeletonText", "SkeletonCard", "SkeletonRows"]) {
      expect(callSites, name).toMatch(new RegExp(`<${name}[ />]`));
    }
  });

  it("손으로 만든 animate-pulse 블록이 남아 있지 않다", () => {
    for (const f of [
      "app/(app)/dashboard/page.tsx",
      "app/(app)/campaigns/page.tsx",
      "app/(app)/campaigns/[id]/page.tsx",
      "app/(app)/journalists/page.tsx",
      "app/(app)/replies/page.tsx",
      "app/(app)/settings/page.tsx",
      "app/(app)/agency/page.tsx",
      "app/(app)/media-kit/page.tsx",
      "app/(app)/admin/page.tsx",
      "components/app/UserMcpKeys.tsx",
      "components/app/AiProviderKeys.tsx",
      "components/app/ByoAiConnect.tsx",
      "components/app/McpGuide.tsx",
    ]) {
      expect(read(f), f).not.toMatch(/animate-pulse/);
    }
  });
});

describe("성공·실패 피드백", () => {
  /**
   * 성공과 실패를 **같은 상태 변수**에 담아 회색 텍스트로 렌더하던 곳들.
   * 사용자가 색으로 결과를 구분할 수 없었다.
   */
  const REMOVED_STATES: Array<[string, string[]]> = [
    ["app/(app)/settings/page.tsx", ["gmailMsg", "ocMsg", "setSaved"]],
    ["app/(app)/agency/page.tsx", ["setMsg"]],
    ["components/app/UserMcpKeys.tsx", ["setError"]],
  ];

  for (const [file, states] of REMOVED_STATES) {
    for (const state of states) {
      it(`${file}: ${state} 상태가 제거됐다`, () => {
        expect(read(file)).not.toContain(state);
      });
    }
  }

  /**
   * 예외를 던지지 않고 `mode`로 결과를 알리는 액션을 무조건 success로 띄우면,
   * 실패가 초록 체크와 함께 나가 **실패를 성공이라고 적극적으로 주장**한다.
   * 회색 텍스트로 구분이 안 되던 것보다 나쁘다 — 이 PR의 목적이 정확히 뒤집힌다.
   */
  it("mode로 결과를 알리는 액션은 mode를 보고 분기한다", () => {
    const src = read("app/(app)/settings/page.tsx");
    const start = src.indexOf("async function testOpenCrab");
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, start + 900);
    expect(block).toMatch(/r\.mode === "error"/);
    expect(block).toContain("toast.error");
  });

  it("OAuth 콜백 쿼리를 지운다 — 재마운트마다 같은 토스트가 다시 뜬다", () => {
    expect(read("app/(app)/settings/page.tsx")).toMatch(/router\.replace\("\/settings"\)/);
  });

  it("전환된 화면이 toast를 쓴다", () => {
    for (const f of [
      "app/(app)/settings/page.tsx",
      "app/(app)/agency/page.tsx",
      "components/app/UserMcpKeys.tsx",
    ]) {
      expect(read(f), f).toContain("useToast");
    }
  });

  /**
   * 실패를 삼키던 곳들 — `try/finally`만 있어 버튼만 원래대로 돌아가고 이유는 알 수 없었다.
   * (SMTP 연결 해제, 프로필 저장, 데모 시드, MCP 키 폐기, API 키 클립보드 복사)
   */
  it("프로필 저장에 오류 처리가 있다", () => {
    const src = read("app/(app)/settings/page.tsx");
    const start = src.indexOf("async function saveProfile");
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf("async function connectGmail"));
    expect(block).toContain("catch");
    expect(block).toContain("toUserMessage");
    // 제출 전 검증이 없으면 잘못된 값이 조용히 저장된다.
    expect(block).toContain("validateProfileForm");
  });

  it("데모 시드에 오류 처리가 있다", () => {
    const src = read("app/(app)/dashboard/page.tsx");
    const start = src.indexOf("async function runSeed");
    const block = src.slice(start, start + 500);
    expect(block).toContain("catch");
    expect(block).toContain("toUserMessage");
  });
});

describe("오류 문구 정규화", () => {
  /**
   * 정본은 설치된 패키지다 — `convex/dist/esm/browser/logging.js`의
   * `createHybridErrorStacktrace`가 `[CONVEX ${prefix}(${udfPath})] …`를 만든다.
   * 초기 버전은 `[Request ID: …]`를 가정했는데 그 문자열은 이 클라이언트에 **존재하지 않아**
   * 테스트는 초록인데 실제 오류는 하나도 벗겨지지 않았다.
   */
  it("실제 Convex 접두 형태를 다룬다", () => {
    const src = read("lib/errorMessage.ts");
    expect(src).toMatch(/\\\[CONVEX/);
    expect(src).toMatch(/Called by client/);
  });

  it("가정으로 만든 형태를 정규식으로 두지 않는다", () => {
    // `[Request ID: …]`는 이 클라이언트가 만들지 않는 형태다. 다시 추가하려면 먼저
    // node_modules/convex에서 생성 지점을 확인해야 한다.
    //
    // ⚠️ 산문 언급(왜 지웠는지 남긴 주석)은 잡지 않는다 — **정규식 리터럴**만 본다.
    //    문서를 금지하면 같은 실수를 반복하지 않게 해 주는 기록이 사라진다.
    expect(read("lib/errorMessage.ts")).not.toMatch(/\\\[Request ID/);
  });

  it("오류 노출도가 가장 높은 경로들이 정규화를 거친다", () => {
    // 발송·예약·초안 생성 실패를 전부 받는 자리 + 같은 싱크를 공유하는 SMTP 두 catch.
    expect(read("app/(app)/campaigns/[id]/page.tsx")).toContain("setSendError(toUserMessage(e))");
    const smtp = read("components/app/SmtpConnect.tsx");
    expect(smtp.match(/toUserMessage\(e\)/g) ?? []).toHaveLength(3);
  });
});

describe("폼 검증", () => {
  it("FormField가 aria 연결을 담당한다", () => {
    const src = read("components/ui/FormField.tsx");
    // children을 함수로 받는다 — Input/Textarea/native select가 섞여 있어
    // cloneElement로 주입하면 타입이 깨진다.
    expect(src).toMatch(/children: \(\s*id: string,/);
    expect(src).toMatch(/describedBy: string \| undefined/);
    expect(src).toMatch(/role="alert"/);
  });

  it("required가 시각 표시에서 멈추지 않고 컨트롤까지 전달된다", () => {
    // 라벨의 별표는 aria-hidden이라 보조 기술에 전달되지 않는다.
    // 컨트롤에 required가 붙어야 "필수 입력"으로 낭독된다.
    expect(read("components/ui/FormField.tsx")).toMatch(/children\(id, describedBy, required/);
    for (const f of ["app/(app)/settings/page.tsx", "components/app/SmtpConnect.tsx"]) {
      expect(read(f), f).toMatch(/required=\{isRequired\}/);
    }
  });

  it("검증 규칙이 순수 함수로 분리돼 화면과 테스트가 공유한다", () => {
    const src = read("lib/profileForm.ts");
    expect(src).toMatch(/export function validateProfileForm/);
    expect(src).toMatch(/export const EMAIL_PATTERN/);
  });

  it("SMTP 이메일 검증이 프로필 폼과 같은 정규식을 쓴다", () => {
    // 두 벌로 두면 한쪽만 고쳐져 서버 normalizeEmail과 어긋난다.
    expect(read("components/app/SmtpConnect.tsx")).toContain("EMAIL_PATTERN");
  });
});


describe("온보딩 체크리스트", () => {
  /**
   * ①단계는 "사용자가 직접 저장했다"는 **행위**로 판정한다.
   *
   * 필드 존재로 판정하면 반드시 틀린다: `ensureProfile`가 `companyName`(`user.name` 또는
   * 리터럴 `"내 회사"`)·`senderName`·`contactEmail`을 자동으로 채우고, `AppShell`이
   * 마운트마다 이 mutation을 호출한다 → 로그인만 해도 "작성 완료"가 된다.
   */
  it("ensureProfile은 profileConfirmedAt을 찍지 않는다", () => {
    const src = read("convex/profiles.ts");
    const block = src.slice(
      src.indexOf("export const ensureProfile"),
      src.indexOf("export const updateProfile"),
    );
    expect(block).not.toContain("profileConfirmedAt");
  });

  it("updateProfile은 profileConfirmedAt을 찍는다", () => {
    const src = read("convex/profiles.ts");
    const block = src.slice(src.indexOf("export const updateProfile"));
    expect(block).toMatch(/profileConfirmedAt: Date\.now\(\)/);
  });

  /**
   * `boilerplate`를 게이트로 쓰지 않는다 — `ensureProfile`가 채우지 않는 건 맞지만
   * **제품 어디에서도 읽히지 않는 필드**다(보도자료는 `mediaKits.boilerplate`를 쓴다).
   * 아무 효과 없는 값을 채워야 배너가 사라지는 게이트는 정당화할 수 없다.
   */
  it("판정에 boilerplate를 쓰지 않는다", () => {
    expect(readCode("convex/onboarding.ts")).not.toContain("boilerplate");
    expect(readCode("lib/onboarding.ts")).not.toContain("boilerplate");
  });

  /**
   * `journalists`에는 `userId`가 없다 — 전역 테이블이고 인덱스도 `by_email`/`by_beat`뿐이다.
   * "기자 리스트 확보"류의 사용자별 단계를 여기서 판정하려 하면 축이 맞지 않는다.
   */
  it("journalists 테이블로 사용자별 진행을 판정하지 않는다", () => {
    expect(readCode("convex/onboarding.ts")).not.toContain("journalists");
  });

  /**
   * 캠페인·매칭·발송은 `campaigns.list`(클라이언트 축을 존중)로 계산한다.
   * `usage.getAnalytics`는 `activeClientId`를 무시하고 항상 `by_user`로 조회하므로,
   * 온보딩이 거기 얹히면 에이전시 모드에서 축 불일치를 상속한다.
   */
  it("getMyChecklist는 캠페인 집계를 하지 않는다 — 대시보드의 campaigns.list를 쓴다", () => {
    const src = readCode("convex/onboarding.ts");
    expect(src).not.toContain("getAnalytics");
    expect(src).not.toMatch(/query\("campaigns"\)/);
    // 체크리스트는 이미 구독 중인 데이터를 prop으로 받는다.
    expect(read("components/app/OnboardingChecklist.tsx")).toMatch(/campaigns,/);
  });

  it("발신 수단은 사용자 축으로만 조회한다", () => {
    // `gmailAccounts`·`smtpAccounts`에 `agencyClientId`가 없다 → 클라이언트별로 다를 수 없다.
    const src = readCode("convex/onboarding.ts");
    expect(src).toMatch(/withIndex\("by_user"/);
    expect(src).not.toContain("agencyClientId");
  });

  /**
   * 판정 규칙은 순수 함수가 정본이다. 이 저장소에는 렌더 테스트 하네스가 없으므로
   * (`environment: "node"`, jsdom 미설치) 컴포넌트 안의 규칙은 검증할 방법이 없다.
   */
  it("판정 규칙이 컴포넌트가 아니라 lib/onboarding.ts에 있다", () => {
    const lib = read("lib/onboarding.ts");
    for (const fn of [
      "buildOnboardingChecklist",
      "toCampaignState",
      "shouldShowSenderBanner",
      "parseSnoozedUntil",
    ]) {
      expect(lib, fn).toContain(`export function ${fn}`);
    }
    const cmp = read("components/app/OnboardingChecklist.tsx");
    expect(cmp).toContain("buildOnboardingChecklist");
    expect(cmp).toContain("toCampaignState");
  });

  it("대시보드가 체크리스트를 렌더한다", () => {
    const src = read("app/(app)/dashboard/page.tsx");
    expect(src).toMatch(/<OnboardingChecklist campaigns=\{campaigns\} \/>/);
  });

  /**
   * 다 끝났으면 렌더하지 않는다. "5/5 완료" 카드로 남기면 영구히 자리를 먹는다.
   */
  it("완료 후에는 렌더하지 않는다", () => {
    expect(read("components/app/OnboardingChecklist.tsx")).toMatch(
      /if \(checklist\.allDone\) return null/,
    );
  });

  /**
   * 진행률을 막대(색)로만 전달하면 안 된다. `Progress`에는 아직 `role="progressbar"`가
   * 없고, 지금 붙이면 기존 사용처 3곳(사용량 미터·미디어킷 완성도·보도자료 점수)이
   * **이름 없는 progressbar**가 되어 새 위반을 만든다 → 접근성 작업은 PR#3에서 한다.
   * 그때까지 막대는 장식이고, 보이는 "n/m" 텍스트가 의미를 전달해야 한다.
   */
  it("진행률이 보이는 텍스트로 전달된다 — 막대는 장식이다", () => {
    const src = read("components/app/OnboardingChecklist.tsx");
    expect(src).toMatch(/\{doneCount\}\/\{totalCount\}/);
    expect(src).toMatch(/aria-hidden="true"[\s\S]{0,120}<Progress/);
  });

  it("완료 여부를 색·아이콘만으로 전달하지 않는다", () => {
    expect(read("components/app/OnboardingChecklist.tsx")).toMatch(/sr-only/);
  });
});

describe("에이전시 클라이언트 축", () => {
  /**
   * ①② 는 사용자 축(`profiles`/`gmailAccounts`/`smtpAccounts`에 `agencyClientId` 없음),
   * ③④⑤ 는 클라이언트 축(`campaigns.list`가 `activeClientId` 존중)이다.
   * 한 진행률에 섞으면 클라이언트를 전환할 때 숫자의 의미가 붕괴한다.
   */
  it("클라이언트 컨텍스트에서 계정 공통 단계를 진행률에서 뺀다", () => {
    const src = read("lib/onboarding.ts");
    expect(src).toMatch(/accountScoped/);
    expect(src).toMatch(/counted = steps\.filter\(\(s\) => !s\.accountScoped\)/);
  });

  it("진행률에서 빠진 단계도 '다음 할 일'에서는 사라지지 않는다", () => {
    // nextStep을 counted에서 찾으면 계정 공통 미완료가 영구히 숨는다.
    expect(read("lib/onboarding.ts")).toMatch(/nextStep: steps\.find/);
  });

  /**
   * `seed.seedDemoForMe`는 `agencyClientId`를 넣지 않는다. `campaigns.list`는
   * `activeClientId`가 있으면 `by_client`로 조회하므로 시드 결과가 목록에 나타나지 않는다
   * → 성공 토스트만 뜨고 화면은 그대로인 버튼은 고장으로 보인다.
   */
  it("클라이언트 컨텍스트에서는 데모 시드 버튼을 숨긴다", () => {
    const src = read("app/(app)/dashboard/page.tsx");
    expect(src).toMatch(/const isClientScoped = /);
    expect(src).toMatch(/isClientScoped \? undefined :/);
  });

  it("시드가 클라이언트 축을 채우게 되면 이 가드를 다시 본다", () => {
    // 가드의 근거가 코드에 남아 있는지 확인한다. seedDemoForMe가 agencyClientId를
    // 넣기 시작하면 위 숨김은 불필요해지므로 함께 지워야 한다.
    expect(readCode("convex/seed.ts")).not.toContain("agencyClientId");
  });
});

describe("발신 수단 미연결 배너", () => {
  /**
   * 없던 동안의 실패 경로: 초안을 다 만들고 발송을 누른 뒤에야 막혔다.
   * 들인 노력이 가장 큰 지점에서 처음 알려 주는 셈이었다.
   */
  it("앱 셸에 배선돼 어느 화면에서든 보인다", () => {
    const src = read("components/app/AppShell.tsx");
    expect(src).toContain("<SenderBanner />");
    // Topbar 아래에 와야 한다 — 상단 내비게이션을 밀어내지 않는다.
    expect(src.indexOf("<Topbar />")).toBeLessThan(src.indexOf("<SenderBanner />"));
  });

  it("표시 조건이 순수 함수로 분리돼 있다", () => {
    expect(read("components/app/SenderBanner.tsx")).toContain("shouldShowSenderBanner");
  });

  /**
   * 서버 렌더에서는 `localStorage`를 읽을 수 없다. 마운트 전에 스누즈 상태를 모른 채
   * 렌더하면 하이드레이션 불일치가 나고, 닫아 둔 배너가 매 새로고침마다 깜빡인다.
   */
  it("마운트 후에만 렌더한다 — localStorage를 서버에서 읽을 수 없다", () => {
    const src = read("components/app/SenderBanner.tsx");
    expect(src).toMatch(/setMounted\(true\)/);
    expect(read("lib/onboarding.ts")).toMatch(/if \(!mounted\) return false/);
  });

  it("localStorage 접근을 try로 감싼다", () => {
    // 사파리 프라이빗 모드 등에서 getItem/setItem이 던진다 → 앱 전체가 죽는다.
    const src = read("components/app/SenderBanner.tsx");
    expect(src.match(/try \{/g) ?? []).toHaveLength(2);
  });

  /**
   * 대시보드에서는 띄우지 않는다 — `senderKind === "none"`이면 체크리스트 ②가 반드시
   * 미완료이므로 체크리스트가 항상 렌더된다 → 같은 말을 두 곳에서 하게 된다.
   * 설정 화면에서도 띄우지 않는다 — 이미 고칠 수 있는 화면이다.
   */
  it("체크리스트와 중복되는 화면에서는 띄우지 않는다", () => {
    const src = read("lib/onboarding.ts");
    expect(src).toMatch(/pathname\.startsWith\("\/settings"\)/);
    expect(src).toMatch(/pathname === "\/dashboard"/);
  });

  it("닫기는 영구 숨김이 아니라 24시간 스누즈다", () => {
    const lib = read("lib/onboarding.ts");
    expect(lib).toMatch(/SENDER_BANNER_SNOOZE_MS = 24 \* 60 \* 60 \* 1000/);
    // 영구 숨김이면 발송이 안 되는 이유를 영구히 모른 채 쓰게 된다.
    expect(read("components/app/SenderBanner.tsx")).toMatch(
      /Date\.now\(\) \+ SENDER_BANNER_SNOOZE_MS/,
    );
  });

  it("닫기 버튼에 접근 가능한 이름이 있다", () => {
    // 아이콘만 있는 버튼은 낭독할 이름이 없다.
    expect(read("components/app/SenderBanner.tsx")).toMatch(/aria-label="24시간 동안 숨기기"/);
  });
});
