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
    // 프리미티브가 없어서 4곳이 각자 Loader2를 넣고 있었다.
    for (const f of [
      "components/app/AiProviderKeys.tsx",
      "app/(app)/settings/page.tsx",
    ]) {
      expect(read(f), f).not.toMatch(/Loader2/);
      expect(read(f), f).not.toMatch(/animate-spin/);
    }
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

describe("폼 검증", () => {
  it("FormField가 aria 연결을 담당한다", () => {
    const src = read("components/ui/FormField.tsx");
    // children을 함수로 받는다 — Input/Textarea/native select가 섞여 있어
    // cloneElement로 주입하면 타입이 깨진다.
    expect(src).toMatch(/children: \(id: string, describedBy: string \| undefined\)/);
    expect(src).toMatch(/role="alert"/);
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
