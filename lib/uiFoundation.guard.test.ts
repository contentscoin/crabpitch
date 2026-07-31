import { readdirSync, readFileSync } from "node:fs";
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
// ⚠️ **행 단위**로만 지운다. 주석 구분자를 정규식으로 잘라내면 문자열 리터럴을 훼손한다:
//    `const a = "x // y";`가 `const a = "x`로 잘리고, 블록 주석 구분자를 담은 리터럴은
//    통째로 사라진다. 이 헬퍼를 쓰는 가드는 전부 `not.toContain`이므로 코드가 잘려 나가면
//    테스트는 **통과한다**(false pass) — 오류 방향이 조용한 통과인 것은 검사에서 가장
//    나쁜 성질이다. 첫 비공백 문자로만 판정하면 리터럴을 건드리지 않는다.
//
//    JSX 주석(`{/* … */}`)까지 다뤄야 한다. 본문 줄이 `*` 없이 평문으로 시작하기 때문에
//    "첫 글자로 판정"만으로는 걸러지지 않고, 그 안의 산문이 코드로 취급된다 — 실제로
//    `sm:table-cell`을 설명하는 주석 때문에 "숨는 컬럼이 없다" 가드가 오탐했다.
//    블록 열림/닫힘을 추적해 주석 전체를 버린다.
//
//    ⚠️ 블록 주석은 **구간만** 잘라낸다. 줄 단위로 버리면 `{/* 설명 */} <코드>` 처럼 주석과
//       코드가 같은 줄에 있을 때 **코드까지 사라져** `not.toMatch` 가드가 조용히 통과한다.
//       (이전 구현이 정확히 그 버그를 만들었다.)
//    ⚠️ 한 줄 주석은 **줄 전체가 주석일 때만** 버린다. 문자열 안의 `//`(`https://`)를 자르면
//       뒤쪽 코드가 검사 대상에서 빠져 같은 종류의 조용한 통과가 생긴다.
const readCode = (p: string) => {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of read(p).split("\n")) {
    let rest = raw;
    let kept = "";
    for (;;) {
      if (inBlock) {
        const end = rest.indexOf("*/");
        if (end === -1) {
          rest = "";
          break;
        }
        inBlock = false;
        // `*/}`(JSX 주석 닫힘)의 `}`까지 함께 버린다.
        rest = rest.slice(end + 2).replace(/^\}/, "");
        continue;
      }
      const open = rest.indexOf("/*");
      if (open === -1) {
        kept += rest;
        break;
      }
      // `{/*`(JSX 주석 열림)의 `{`도 함께 버린다.
      kept += rest.slice(0, open).replace(/\{\s*$/, "");
      rest = rest.slice(open + 2);
      inBlock = true;
    }
    if (kept.trimStart().startsWith("//")) continue;
    out.push(kept);
  }
  return out.join("\n");
};

/**
 * 저장소의 모든 `.tsx` — 파일 목록을 손으로 적는 가드는 **새 파일을 놓친다.**
 * "이 형태가 어디에도 없어야 한다"류 가드는 반드시 이것을 돌아야 한다.
 */
function tsxFiles(): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next" || e.name === ".git") continue;
        walk(p);
      } else if (e.name.endsWith(".tsx")) {
        out.push(p);
      }
    }
  };
  for (const root of ["app", "components"]) walk(root);
  return out.sort();
}

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

  /**
   * `updateProfile`은 발신 정보 저장 전용이 아니다 — 설정 화면의 플랜 카드가
   * `update({ plan })`으로, Gmail 연결 흐름이 `update({ gmailConnected })`로 같은 mutation을
   * 쓴다. 인자를 보지 않고 도장을 찍으면 **플랜 버튼 한 번으로 ①단계가 완료된다.**
   * `ensureProfile`을 막아 봐야 자동 완료가 다른 문으로 들어오는 것이다.
   */
  it("updateProfile은 발신 정보 인자가 왔을 때만 도장을 찍는다", () => {
    const src = readCode("convex/profiles.ts");
    // 무조건 찍는 형태가 아니어야 한다.
    expect(src).not.toMatch(/^\s*profileConfirmedAt: Date\.now\(\),$/m);
    expect(src).toMatch(/confirmsSenderIdentity\(args\) \? \{ profileConfirmedAt/);
    // 판정은 발신 아이덴티티 3필드만 본다. plan·gmailConnected·boilerplate는 아니다.
    const fn = src.slice(
      src.indexOf("function confirmsSenderIdentity"),
      src.indexOf("export const updateProfile"),
    );
    for (const f of ["companyName", "senderName", "contactEmail"]) {
      expect(fn, f).toContain(`args.${f} !== undefined`);
    }
    for (const f of ["plan", "gmailConnected", "boilerplate"]) {
      expect(fn, f).not.toContain(`args.${f}`);
    }
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


  /**
   * 캠페인·매칭·발송은 `campaigns.list`(클라이언트 축을 존중)로 계산한다.
   * `usage.getAnalytics`는 `activeClientId`를 무시하고 항상 `by_user`로 조회하므로,
   * 온보딩이 거기 얹히면 에이전시 모드에서 축 불일치를 상속한다.
   */
  it("getMyChecklist는 캠페인 집계를 하지 않는다 — 대시보드의 campaigns.list를 쓴다", () => {
    const src = readCode("convex/onboarding.ts");
    expect(src).not.toContain("getAnalytics");
    expect(src).not.toMatch(/query\("campaigns"\)/);
    /*
      체크리스트는 이미 구독 중인 데이터를 prop으로 받는다.
      prop 이름 문자열(`/campaigns,/`)을 보면 안 된다 — 구조분해에 걸려서, 컴포넌트가
      `campaigns.list`를 **직접 구독하기 시작해도 통과한다**. 막으려는 것이 정확히
      그 상황이므로 `api.campaigns` 참조 자체를 금지한다.
    */
    expect(readCode("components/app/OnboardingChecklist.tsx")).not.toContain("api.campaigns");
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
      "senderBannerState",
      "parseSnoozedUntil",
    ]) {
      expect(lib, fn).toContain(`export function ${fn}`);
    }
    const cmp = read("components/app/OnboardingChecklist.tsx");
    expect(cmp).toContain("buildOnboardingChecklist");
    expect(cmp).toContain("toCampaignState");
  });

  it("대시보드가 체크리스트에 구독 중인 캠페인을 넘긴다", () => {
    // 원문 한 줄 일치로 두면 포매터가 줄을 나누는 순간 깨진다 — 태그와 prop만 본다.
    const src = readCode("app/(app)/dashboard/page.tsx");
    expect(src).toMatch(/<OnboardingChecklist[\s\S]{0,80}campaigns=\{campaigns\}/);
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
   * 진행률을 막대(색)로만 전달하면 안 된다.
   *
   * 처음에는 막대를 `aria-hidden` 장식으로 두고 보이는 "n/m" 텍스트에만 의존했다 —
   * `Progress`에 `role="progressbar"`가 없어서, 거기 역할만 붙이면 기존 사용처 3곳이
   * **이름 없는 progressbar**가 되기 때문이었다. `Progress`가 `label`을 필수로 받게 되면서
   * 그 제약이 사라졌으므로 막대도 이름을 갖는다. 보이는 텍스트는 그대로 남긴다 —
   * 색·막대만으로 전달하지 않기 위한 것이므로 중복이 아니다.
   */
  it("진행률이 보이는 텍스트로 전달된다", () => {
    const src = readCode("components/app/OnboardingChecklist.tsx");
    expect(src).toMatch(/\{doneCount\}\/\{totalCount\}/);
    // 막대를 다시 장식으로 감추면 안 된다 — 이제 이름이 있다.
    expect(src).not.toMatch(/aria-hidden="true"[\s\S]{0,80}<Progress/);
    expect(src).toMatch(/<Progress[\s\S]{0,160}label=/);
  });

  it("완료 여부를 색·아이콘만으로 전달하지 않는다", () => {
    expect(read("components/app/OnboardingChecklist.tsx")).toMatch(/sr-only/);
  });

  /**
   * 단계를 두 개의 `<ol>`로 쪼개면 번호가 각각 1부터 다시 시작해, 스크린리더가
   * "1 of 3" 다음에 다시 "1 of 2"를 읽는다 — "5단계 중 어디"라는 정보가 마크업에서 사라진다.
   */
  it("단계 목록이 하나의 <ol>이다", () => {
    const src = readCode("components/app/OnboardingChecklist.tsx");
    expect(src.match(/<ol[ >]/g) ?? []).toHaveLength(1);
    // 정본 순서 그대로 렌더한다(계정 공통을 따로 모으지 않는다).
    expect(src).toMatch(/steps\.map\(\(step\) =>/);
  });

  /**
   * 링크 목록으로 훑는 스크린리더 사용자에게 "이동, 이동, 확인"만 남으면 어느 단계인지
   * 알 수 없다(WCAG 2.4.9 — 링크 목적을 링크 텍스트만으로 알 수 있어야 한다).
   */
  it("단계 링크 이름에 단계 라벨이 들어간다", () => {
    expect(read("components/app/OnboardingChecklist.tsx")).toMatch(
      /aria-label=\{`\$\{step\.label\}/,
    );
  });

  /** 도달할 수 없는 분기는 읽는 사람에게 없는 상태가 있다고 잘못 알린다. */
  it("도달 불가 분기를 두지 않는다", () => {
    // ③④⑤는 항상 counted에 들어가므로 counted.length === 0은 참이 될 수 없다.
    expect(readCode("components/app/OnboardingChecklist.tsx")).not.toContain(
      "counted.length === 0",
    );
  });
});

describe("에이전시 클라이언트 축", () => {
  /**
   * ①② 는 사용자 축(`profiles`/`gmailAccounts`/`smtpAccounts`에 `agencyClientId` 없음),
   * ③④⑤ 는 클라이언트 축(`campaigns.list`가 `activeClientId` 존중)이다.
   * 한 진행률에 섞으면 클라이언트를 전환할 때 숫자의 의미가 붕괴한다.
   */
  it("클라이언트 컨텍스트에서 계정 공통 단계를 진행률에서 뺀다", () => {
    const src = readCode("lib/onboarding.ts");
    expect(src).toMatch(/counted = steps\.filter\(\(s\) => !s\.accountScoped\)/);
  });

  it("진행률에서 빠진 단계도 '다음 할 일'에서는 사라지지 않는다", () => {
    // nextStep을 counted에서 찾으면 계정 공통 미완료가 영구히 숨는다.
    expect(readCode("lib/onboarding.ts")).toMatch(/nextStep: steps\.find/);
  });

  /**
   * ⚠️ 진행률에서 빼는 것과 **화면에서 없애는 것**은 다르다.
   *
   * `allDone`이 `counted`만 봤다면 클라이언트 축 3단계를 마친 순간 카드가 사라지고,
   * 대시보드에서는 배너도 스스로를 끄므로 "발신 수단 미연결"을 아무도 말하지 않는다.
   * `record_only` 발송은 발신 계정을 요구하지 않으므로 도달 가능한 조합이다.
   */
  it("allDone은 계정 공통 단계까지 본다", () => {
    expect(readCode("lib/onboarding.ts")).toMatch(/allDone: steps\.every\(/);
  });

  /**
   * `activeClientId` 존재만으로 축을 판정하면 `campaigns.list`와 어긋난다 — 클라이언트
   * 문서 삭제·멤버십 박탈 시 그 쿼리는 조용히 사용자 축으로 떨어지지만 `activeClientId`는
   * 남는다. 그 상태에서 "(이 클라이언트) n/3"이라고 적으면 라벨과 집계 대상이 달라진다.
   */
  it("축 판정을 campaigns.list와 같은 헬퍼로 한다", () => {
    for (const f of ["convex/campaigns.ts", "convex/onboarding.ts"]) {
      expect(readCode(f), f).toContain("resolveActiveClientScope");
      // 자기만의 판정을 다시 만들면 두 쿼리가 갈린다.
      expect(readCode(f), f).not.toMatch(/if \(profile\?\.activeClientId\)/);
    }
    expect(readCode("convex/lib/agencyAuth.ts")).toMatch(
      /export async function resolveActiveClientScope/,
    );
  });

  it("대시보드도 같은 축 판정을 쓴다 — 세 번째 사본을 만들지 않는다", () => {
    const src = readCode("app/(app)/dashboard/page.tsx");
    expect(src).toMatch(/onboarding\?\.isClientScoped/);
    expect(src).not.toContain("profile?.profile?.activeClientId");
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
    expect(read("components/app/SenderBanner.tsx")).toContain("senderBannerState");
  });

  /**
   * ⚠️ 임계값이 "발신 계정 행이 있는가"가 아니라 **"기자에게 메일이 나가는가"**여야 한다.
   *    행 존재로 판정하면 Gmail 전용 사용자와 SMTP가 고장 난 사용자 — 실제로 발송이
   *    막히는 두 상태 — 가 아무 경고도 못 받고, 이 기능이 없애려던 실패 경로(발송을
   *    눌러야 알게 됨)가 그대로 남는다.
   */
  it("Gmail 전용·SMTP 오류도 경고 대상이다", () => {
    const src = readCode("lib/onboarding.ts");
    // 배너 판정 함수 안만 본다 — `senderKind !== "none"`은 체크리스트 ②의 완료 판정으로는
    // 정당하다(연결 자체는 됐으므로). 배너 임계값으로 쓰는 것만 금지 대상이다.
    const fn = src.slice(src.indexOf("export function senderBannerState"));
    expect(fn).toMatch(/senderKind === "gmail"/);
    expect(fn).toMatch(/smtpStatus === "error"/);
    expect(fn).not.toMatch(/senderKind !== "none"/);
  });

  /**
   * 대시보드에서 감추는 것은 `blocked`뿐이다. `blocked`는 ②가 미완료라 체크리스트가
   * 반드시 렌더되지만, `partial`·`check`는 ②가 완료(경고)여서 `allDone`이 참일 수 있다 →
   * 체크리스트가 사라진 자리에서 배너가 말해야 한다.
   */
  it("대시보드 제외가 blocked에만 적용된다", () => {
    const src = readCode("lib/onboarding.ts");
    expect(src).toMatch(/pathname\.startsWith\("\/settings"\)/);
    expect(src).toMatch(/tone === "blocked" && pathname === "\/dashboard"/);
  });

  /**
   * 서버 렌더에서는 `localStorage`를 읽을 수 없다. 마운트 전에 스누즈 상태를 모른 채
   * 렌더하면 하이드레이션 불일치가 나고, 닫아 둔 배너가 매 새로고침마다 깜빡인다.
   */
  it("마운트 후에만 렌더한다 — localStorage를 서버에서 읽을 수 없다", () => {
    expect(readCode("lib/onboarding.ts")).toMatch(/if \(!mounted\) return null/);
    expect(readCode("components/app/SenderBanner.tsx")).toMatch(
      /mounted: snoozedUntil !== null/,
    );
  });

  /**
   * `localStorage` 접근은 사파리 프라이빗 모드 등에서 던진다 → 배너 하나 때문에 앱 셸이
   * 죽는다. 컴포넌트에서 직접 만지지 않고 `lib`의 감싼 함수만 쓴다 — 그래야 던지는
   * 상황을 스텁으로 실제 테스트할 수 있다(`lib/onboarding.test.ts`).
   */
  it("컴포넌트가 localStorage를 직접 만지지 않는다", () => {
    const src = readCode("components/app/SenderBanner.tsx");
    expect(src).not.toContain("localStorage");
    expect(src).toContain("readSnoozedUntil");
    expect(src).toContain("writeSnoozedUntil");
  });

  it("닫기는 영구 숨김이 아니라 24시간 스누즈다", () => {
    expect(readCode("lib/onboarding.ts")).toMatch(
      /SENDER_BANNER_SNOOZE_MS = 24 \* 60 \* 60 \* 1000/,
    );
    // 영구 숨김이면 발송이 안 되는 이유를 영구히 모른 채 쓰게 된다.
    expect(readCode("components/app/SenderBanner.tsx")).toMatch(
      /Date\.now\(\) \+ SENDER_BANNER_SNOOZE_MS/,
    );
  });

  /** 고정 키를 쓰면 한 브라우저를 공유하는 다른 계정이 스누즈를 상속한다. */
  it("스누즈 키가 사용자별로 나뉜다", () => {
    expect(readCode("lib/onboarding.ts")).toMatch(
      /export function senderBannerSnoozeKey\(scopeKey: string\)/,
    );
    expect(readCode("components/app/SenderBanner.tsx")).toContain("scopeKey");
  });

  it("닫기 버튼에 접근 가능한 이름이 있다", () => {
    // 아이콘만 있는 버튼은 낭독할 이름이 없다.
    expect(read("components/app/SenderBanner.tsx")).toMatch(/aria-label="24시간 동안 숨기기"/);
  });
});


describe("Progress 접근성", () => {
  const src = readCode("components/ui/Progress.tsx");

  it("progressbar 역할과 값을 노출한다", () => {
    expect(src).toMatch(/role="progressbar"/);
    expect(src).toMatch(/aria-valuenow=\{Math\.round\(/);
    expect(src).toMatch(/aria-valuemin=\{0\}/);
    expect(src).toMatch(/aria-valuemax=\{100\}/);
  });

  /**
   * ⚠️ `label`은 **필수 prop**이어야 한다.
   *
   * optional로 두면 "진행률 50%"처럼 무엇의 진행률인지 알 수 없는 낭독이 생긴다 —
   * 역할이 없던 이전 상태보다 나쁘다. 필수로 두면 새 호출부가 빠뜨리는 순간 타입 오류다.
   */
  it("label이 필수 prop이다", () => {
    expect(src).toMatch(/^\s*label: string;$/m);
    expect(src).not.toMatch(/label\?: string/);
    expect(src).toMatch(/aria-label=\{label\}/);
  });

  /**
   * 모든 호출부가 label을 준다. 타입 검사로도 걸리지만, 여기서 잡으면 "무엇의 진행률인지"를
   * 실제로 구별되는 문구로 지었는지까지 확인할 수 있다.
   */
  it("호출부 4곳이 서로 구별되는 이름을 준다", () => {
    const sites: Array<[string, RegExp]> = [
      ["components/app/UsageMeter.tsx", /label="이번 달 발송 사용량"/],
      // 목록 안이라 항목을 구별할 수 있어야 한다 — 고정 문구면 전부 같은 이름이 된다.
      ["app/(app)/media-kit/page.tsx", /label=\{`\$\{k\.name\} 완성도`\}/],
      ["app/(app)/media-kit/page.tsx", /label="편집 중인 미디어킷 완성도"/],
      ["components/app/OnboardingChecklist.tsx", /온보딩 진행률/],
    ];
    for (const [file, re] of sites) {
      expect(readCode(file), `${file} ${re}`).toMatch(re);
    }
  });

  it("Progress를 쓰는 곳은 모두 label을 넘긴다", () => {
    for (const f of [
      "components/app/UsageMeter.tsx",
      "app/(app)/media-kit/page.tsx",
      "components/app/OnboardingChecklist.tsx",
    ]) {
      const s = readCode(f);
      const uses = s.match(/<Progress[\s\S]*?\/>/g) ?? [];
      expect(uses.length, f).toBeGreaterThan(0);
      for (const u of uses) expect(u, `${f}: ${u}`).toContain("label=");
    }
  });
});

describe("탐색 접근성", () => {
  it("활성 내비게이션 링크에 aria-current가 있다", () => {
    const src = readCode("components/app/Sidebar.tsx");
    // `false`를 주면 `aria-current="false"`가 남는다 — undefined여야 속성이 사라진다.
    expect(src).toMatch(/aria-current=\{active \? "page" : undefined\}/);
  });

  it("내비게이션 landmark에 이름이 있다", () => {
    // 데스크톱·모바일 nav가 둘 다 있다(동시에 렌더되지는 않는다).
    const src = readCode("components/app/Sidebar.tsx");
    expect(src.match(/<nav aria-label="주요 메뉴"/g) ?? []).toHaveLength(2);
  });

  /**
   * 매 화면마다 내비게이션 탭 8개를 지나야 본문에 닿는 문제.
   * `tabIndex={-1}`이 없으면 해시만 바뀌고 포커스는 문서 처음에 남는다.
   */
  it("건너뛰기 링크와 main#main이 있다", () => {
    const src = readCode("components/app/AppShell.tsx");
    expect(src).toMatch(/href="#main"/);
    expect(src).toMatch(/id="main"/);
    expect(src).toMatch(/tabIndex=\{-1\}/);
    /*
      display:none으로 감추면 포커스를 받을 수 없다 → transform으로 화면 밖에 둔다.
      **오프스크린 클래스도 함께 단정한다** — 그것만 지우면 모든 화면 좌상단에 버튼이
      상시 노출되는데 `focus:translate-y-0`만 보는 가드는 초록이다.
    */
    expect(src).toMatch(/-translate-y-20/);
    expect(src).toMatch(/focus:translate-y-0/);
    expect(src).not.toMatch(/href="#main"[\s\S]{0,120}hidden/);
    // 브랜드 배경에 흰색을 박으면 다크 모드에서 대비가 2.58:1로 떨어진다 → 토큰을 쓴다.
    expect(src).toMatch(/bg-brand[^"]*text-brand-foreground/);
    expect(src).not.toMatch(/href="#main"[\s\S]{0,200}text-white/);
  });

  /**
   * 실제 테마는 `document.documentElement`의 클래스에 있고 `useEffect` 이후에만 읽을 수
   * 있다. 마운트 전에 아이콘을 그리면 다크 모드 사용자에게 반대 아이콘이 한 프레임 보인다.
   */
  it("ThemeToggle이 마운트 전에는 아이콘을 그리지 않는다", () => {
    const src = readCode("components/ThemeToggle.tsx");
    expect(src).toMatch(/if \(!mounted\)/);
    /*
      자리를 비워 두면 아이콘이 나타날 때 옆 요소가 밀린다.
      `aria-hidden="true"` 존재만 보면 안 된다 — Sun·Moon 아이콘도 그 속성을 갖게 되어
      플레이스홀더를 지워도 통과한다. 버튼과 **같은 크기 상수**를 쓰는지 본다.
    */
    expect(src).toMatch(/const BOX = /);
    expect(src.match(/\$\{BOX\}/g) ?? []).toHaveLength(2);
    // 토글 상태는 이름이 아니라 aria-pressed로 알린다. 이름이 매번 바뀌면 같은 버튼인지 모른다.
    expect(src).toMatch(/aria-label="다크 모드"/);
    expect(src).toMatch(/aria-pressed=\{dark\}/);
  });
});

describe("버튼처럼 보이는 링크", () => {
  /**
   * ⚠️ `<Link>` 안에 `<Button>`을 넣으면 `<a>` 안에 `<button>`이 들어간다 — 무효 HTML이고
   *    포커스 스톱이 둘로 늘어난다(Tab 두 번, 스크린리더가 링크와 버튼을 각각 읽는다).
   *    저장소 전체에서 이 형태가 사라져야 한다.
   */
  /**
   * 파일 목록을 손으로 적지 않는다 — 배열에 없는 **새 파일**이 같은 실수를 하면 빠져나간다.
   * 저장소의 tsx 전체를 훑는다.
   */
  it("Link 안에 Button을 넣은 곳이 없다", () => {
    const offenders: string[] = [];
    for (const f of tsxFiles()) {
      // 같은 줄(`<Link href="x"><Button>`)과 다음 줄, 둘 다 잡는다.
      if (/<Link[^>]*>\s*<Button[\s/>]/.test(readCode(f))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * 랜딩 CTA는 손으로 쓴 클래스 문자열이었다 — `focus-visible:ring`이 없어서 **키보드
   * 사용자가 지금 어디 있는지 볼 수 없었다.** `buttonClasses`가 그 링을 포함한다.
   */
  it("랜딩 CTA가 buttonClasses를 쓴다", () => {
    const src = readCode("app/page.tsx");
    /*
      "bg-brand 문자열이 없다"로 쓰면 안 된다 — "가장 인기" 배지처럼 CTA가 아닌 요소도
      브랜드 색을 쓴다. 검사 대상은 **CTA 링크**다: `/signin`으로 가는 모든 Link가
      buttonClasses를 쓰는지 본다.
    */
    const ctas = src.match(/<Link\s+href="\/signin"[\s\S]{0,400}?>/g) ?? [];
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) expect(cta, cta).toContain("buttonClasses");
  });

  /**
   * `buttonClasses`가 포커스 링을 담당한다 — 랜딩 CTA가 손으로 쓴 클래스였을 때 링이
   * 없었던 원인이 이것이다.
   *
   * ⚠️ "프리미티브 한 곳에서만 정의된다"고 쓰면 안 된다 — 사실이 아니다. `Input`·`Toast`도
   *    각자 `focus-visible:ring-2`를 쓴다(포커스 가능한 프리미티브가 여러 개이므로 당연하다).
   *    검사할 것은 "**화면 파일**이 링을 손으로 쓰지 않는다"다.
   */
  it("포커스 링은 프리미티브가 담당하고 화면이 직접 쓰지 않는다", () => {
    expect(readCode("components/ui/Button.tsx")).toMatch(/focus-visible:ring-2/);
    const offenders = tsxFiles()
      .filter((f) => !f.startsWith("components/ui/"))
      .filter((f) => /focus-visible:ring-2/.test(readCode(f)));
    expect(offenders).toEqual([]);
  });
});

describe("heading 순서", () => {
  /**
   * `EmptyState`의 기본값 `h3`은 섹션 heading(`h2`) 안에 있을 때만 맞다.
   * `PageHeader`(h1) 바로 아래에 두면 h2를 건너뛴다.
   */
  it("EmptyState가 heading 레벨을 받는다", () => {
    const src = readCode("components/app/bits.tsx");
    expect(src).toMatch(/as: Heading = "h3"/);
    expect(src).toMatch(/<Heading className=/);
  });

  it("PageHeader 직하의 EmptyState는 h2를 지정한다", () => {
    for (const f of [
      "app/(app)/campaigns/page.tsx",
      "app/(app)/journalists/page.tsx",
      "app/(app)/media-kit/page.tsx",
      "app/(app)/replies/page.tsx",
    ]) {
      expect(readCode(f), f).toMatch(/<EmptyState[\s\S]{0,200}as="h2"/);
    }
  });

  it("섹션 heading 안의 EmptyState는 기본값을 쓴다", () => {
    // 대시보드의 EmptyState는 <h2>최근 캠페인</h2> 아래라 h3이 맞다.
    expect(readCode("app/(app)/dashboard/page.tsx")).not.toMatch(
      /<EmptyState[\s\S]{0,200}as="h2"/,
    );
  });
});

describe("화면에 남는 상태 알림", () => {
  /**
   * ⚠️ 라이브 리전 3원칙 — 셋 다 지켜야 실제로 낭독된다.
   *   ① 항상 마운트(내용과 함께 삽입되면 변화를 감지하지 못한다)
   *   ② `display:none`으로 감추지 않는다(숨겨진 리전에 들어온 내용은 낭독되지 않는다)
   *   ③ 그래서 `sr-only`(position:absolute) — 부모의 `space-y-*`에 빈 여백도 만들지 않는다
   */
  const LIVE_REGIONS: Array<[string, string]> = [
    ["app/(app)/campaigns/[id]/page.tsx", "sendNote"],
    ["app/(app)/campaigns/new/page.tsx", "note"],
    ["app/(app)/campaigns/new/page.tsx", "kitNote"],
  ];

  for (const [file, state] of LIVE_REGIONS) {
    it(`${file}: ${state}가 라이브 리전으로 낭독된다`, () => {
      const src = readCode(file);
      expect(src).toMatch(
        new RegExp(`<p role="status" className="sr-only">\\s*\\{${state} \\?\\? ""\\}`),
      );
    });
  }

  it("조건부로 삽입되는 라이브 리전이 없다", () => {
    for (const [file] of LIVE_REGIONS) {
      // `{x && <p role="status">…` 형태는 컨테이너가 내용과 함께 삽입되는 것이다.
      expect(readCode(file), file).not.toMatch(/&&\s*\(?\s*<p role="(status|alert)"/);
    }
  });

  it("라이브 리전을 display:none으로 감추지 않는다", () => {
    for (const [file] of LIVE_REGIONS) {
      expect(readCode(file), file).not.toMatch(/role="(status|alert)"[^>]*empty:hidden/);
    }
  });

  /**
   * 성공만 낭독하고 실패가 침묵하면, 스크린리더 사용자는 **성공한 경우에만** 결과를 듣는다.
   * `campaigns/[id]`의 `sendError`는 발송·예약·초안 생성 실패를 전부 받는 자리다.
   */
  it("실패도 낭독된다 — assertive로", () => {
    for (const [f, state] of [
      ["app/(app)/campaigns/new/page.tsx", "error"],
      ["app/(app)/campaigns/[id]/page.tsx", "sendError"],
      ["app/(app)/campaigns/[id]/page.tsx", "variantError"],
    ] as const) {
      expect(readCode(f), `${f} ${state}`).toMatch(
        new RegExp(`<p role="alert" className="sr-only">\\s*\\{${state} \\?\\? ""\\}`),
      );
    }
  });

  /**
   * 라이브 리전은 **DOM 변경**으로 발화한다. 같은 결과를 두 번 만들면 텍스트 노드가
   * 그대로여서 아무것도 낭독되지 않는다 — 버튼을 눌렀는데 반응이 없는 것이 된다.
   * 재실행 전에 상태를 비워야 반드시 한 번은 변경이 일어난다.
   */
  it("재실행 시 알림 상태를 초기화한다", () => {
    const src = readCode("app/(app)/campaigns/new/page.tsx");
    const fn = src.slice(src.indexOf("async function onPolish"), src.indexOf("async function onSubmit"));
    for (const s of ["setError(null)", "setNote(null)", "setLint(null)"]) {
      expect(fn, s).toContain(s);
    }
  });

  /**
   * 라이브 리전으로 **낭독되는** 문구는 반드시 정규화를 거쳐야 한다.
   * 그러지 않으면 스크린리더가 `[CONVEX A(aiActions:enhance)] Uncaught Error: …`를 읽는다.
   */
  it("낭독되는 오류 문구가 정규화를 거친다", () => {
    const src = readCode("app/(app)/campaigns/new/page.tsx");
    expect(src).not.toMatch(/setError\(err instanceof Error \? err\.message/);
    expect(src.match(/setError\(toUserMessage\(err, /g) ?? []).toHaveLength(2);
  });
});

describe("모바일에서 사라지던 정보", () => {
  /**
   * `hidden sm:block`이었다 — 한도에 걸린 사용자가 작은 화면에서는 **발송이 막힌 이유를
   * 볼 수 없었다.** 발송 불가의 가장 흔한 원인인데 그 정보가 화면에서 사라지는 것이다.
   */
  it("UsageMeter가 좁은 화면에서 숨지 않는다", () => {
    const src = readCode("components/app/UsageMeter.tsx");
    // 좁은 화면 전용 배지 + 넓은 화면 전용 막대, 둘 다 있어야 한다.
    expect(src).toMatch(/sm:hidden/);
    expect(src).toMatch(/hidden w-44 sm:block/);
    /*
      배지만 보면 "7/10"이 무엇인지 알 수 없다 — 라벨이 **보이는 글자**여야 한다.
      `title`로 대신하면 안 된다: 이 배지는 좁은 화면(대개 터치 기기) 전용인데
      `title`은 hover가 필요해 정작 대상 기기에서 볼 수 없다.
    */
    expect(src).toMatch(/>발송 </);
    expect(src).not.toMatch(/title=\{`이번 달 발송/);
  });

  /**
   * 표를 그대로 두면 숨는 컬럼 때문에 **"회신 3"만 남고 그 3이 무엇 중 3인지 알 수 없다.**
   * 전환 기준이 서로 다르다: 캠페인은 `sm`, 기자는 `lg`(가장 늦게 숨는 컬럼이
   * `lg:table-cell`이라 `sm` 기준이면 640~1024px에서 정보가 계속 사라진다 — 태블릿 세로).
   */
  const LIST_PAGES: Array<[string, string]> = [
    ["app/(app)/campaigns/page.tsx", "sm"],
    ["app/(app)/journalists/page.tsx", "lg"],
  ];

  for (const [file, bp] of LIST_PAGES) {
    it(`${file}: ${bp} 미만에서 카드로 바뀐다`, () => {
      const src = readCode(file);
      expect(src).toMatch(new RegExp(`className="space-y-2 ${bp}:hidden"`));
      expect(src).toMatch(new RegExp(`hidden[^"]*${bp}:block`));
    });

    it(`${file}: 표에 숨는 컬럼이 남아 있지 않다`, () => {
      // 카드로 전환했으므로 컬럼을 감출 이유가 없다 — 감춘 채로 두면 두 벌을 관리하게 된다.
      expect(readCode(file), file).not.toMatch(/table-cell/);
    });

    it(`${file}: 표에 이름과 열 방향이 있다`, () => {
      const src = readCode(file);
      expect(src).toMatch(/<caption className="sr-only">/);
      expect(src).toMatch(/scope="col"/);
    });

    /**
     * ⚠️ 두 벌 마크업의 **표류**가 이 변경의 최대 유지보수 위험이다.
     *
     * 구조만 검사하면(카드 존재·표 존재·숨는 컬럼 부재) 표에 컬럼을 하나 추가하고 카드를
     * 방치해도 전부 통과한다 — 좁은 화면에서 그 정보가 다시 사라지는데 가드는 초록이다.
     * 표의 열 이름 집합과 카드의 라벨 집합이 같은지 본다.
     */
    it(`${file}: 카드와 표가 같은 항목을 보여 준다`, () => {
      const src = readCode(file);
      const ths = [...src.matchAll(/scope="col"[^>]*>\s*([^<]+?)\s*</g)].map((m) => m[1]);
      // 카드의 항목 라벨: `<dt …>라벨</dt>` 또는 배열 리터럴의 `["라벨", 값]`.
      const dts = [...src.matchAll(/<dt[^>]*>\s*([^<{]+?)\s*</g)].map((m) => m[1]);
      const tuples = [...src.matchAll(/\[\s*"([^"]+)",\s*c\./g)].map((m) => m[1]);
      const cardLabels = new Set([...dts, ...tuples]);

      expect(ths.length, "표 열 이름을 못 읽었다").toBeGreaterThan(0);
      expect(cardLabels.size, "카드 라벨을 못 읽었다").toBeGreaterThan(0);

      // 표에만 있고 카드에 없는 항목 = 좁은 화면에서 사라지는 정보.
      // 카드가 라벨 없이 보여 주는 항목(캠페인명·매체 등 제목 자리)은 제외 대상이므로
      // 화면별 예외를 명시한다 — 예외를 늘리려면 그 항목이 카드에서 어떻게 보이는지 적어야 한다.
      const shownWithoutLabel: Record<string, string[]> = {
        // 캠페인명은 카드 제목, 상태는 제목 옆 배지.
        "app/(app)/campaigns/page.tsx": ["캠페인", "상태"],
        // 기자 코드는 카드 제목, 매체는 그 아래 줄, 신뢰도는 우측 배지.
        "app/(app)/journalists/page.tsx": ["기자", "매체", "신뢰도"],
      };
      const exempt = new Set(shownWithoutLabel[file] ?? []);
      const missing = ths.filter((t) => !cardLabels.has(t) && !exempt.has(t));
      expect(missing, `카드에서 빠진 항목: ${missing.join(", ")}`).toEqual([]);
    });
  }

  /**
   * 탭이 8개(관리자 9개)라 좁은 화면에서는 반드시 잘린다. 잘린 자리가 그냥 끝난 것처럼
   * 보이면 남은 탭을 찾지 못한다.
   */
  it("MobileNav에 스크롤 가능 힌트가 있다", () => {
    const src = readCode("components/app/Sidebar.tsx");
    expect(src).toMatch(/overflow-x-auto/);
    expect(src).toMatch(/bg-gradient-to-l from-card/);
    // 마스크가 탭을 가로막으면 안 된다.
    expect(src).toMatch(/pointer-events-none/);
  });
});


describe("빌드 CSS 오염", () => {
  /**
   * Tailwind v4는 gitignore되지 않은 파일 전부에서 클래스 후보를 뽑는다 — 문서가 클래스
   * 이름을 **설명하기만 해도** 아무도 쓰지 않는 규칙이 빌드 CSS에 들어간다.
   * 실제로 검토 문서가 언급한 `-top-full`이 CSS에 들어가 "코드가 그 클래스를 쓴다"는
   * 오해를 만들었다. `docs/`는 클래스 이름을 자주 인용하므로 제외해 둔다.
   */
  it("마크다운을 클래스 스캔 대상에서 뺀다", () => {
    expect(read("app/globals.css")).toMatch(/@source not "\.\.\/\*\*\/\*\.md";/);
  });

  /**
   * modifier 없는 유틸리티를 `buttonClasses`의 `className`으로 넘기면 안 되는 경우가 있다.
   * `ring-offset-*`처럼 BASE가 `focus-visible:` modifier로 이미 지정한 속성은, modifier 없이
   * 덮으려 하면 `tailwind-merge`가 충돌로 보지 않아 둘 다 남고 특이도에서 BASE가 이긴다.
   */
  it("focus 링 오프셋을 덮을 때 modifier를 함께 쓴다", () => {
    const src = readCode("app/page.tsx");
    expect(src).toMatch(/focus-visible:ring-offset-deep/);
    // modifier 없는 형태가 className에 들어가면 조용히 무효가 된다.
    expect(src).not.toMatch(/className: "[^"]*(?<!:)ring-offset-deep/);
  });
});
