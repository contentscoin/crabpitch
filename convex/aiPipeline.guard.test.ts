import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AI 개인화 파이프라인 구조 가드.
 *
 * 여기서 고정하는 불변식들은 **여러 파일에 걸쳐 있어서** 단위 테스트로는 잡히지 않는다.
 * 한 파일에서 인자 하나를 빠뜨리면 타입 오류도 없이(기본값이 있으므로) 조용히 퇴행한다.
 * 실제로 있었던 사고:
 *   ① 초안에 골격(preset) 기록이 없어 AI가 모든 초안을 표준 7블록 규칙으로 다듬었다.
 *      '초간결'을 고른 사용자의 4~5줄 메일이 프롬프트가 요구한 600~800자로 부풀려졌다.
 *   ② 다듬기 후 컴플라이언스를 다시 검사하지 않아, 승인 화면 배지가 다듬기 **이전**
 *      상태를 가리켰다. 사용자는 틀린 정보 위에서 발송을 승인했다.
 *   ③ BYOK API 키가 평문 컬럼에 저장됐다(SMTP 비밀번호는 봉인되는데 한쪽만).
 *
 * convex-test 하네스가 없는 상태에서 이 불변식을 지킬 수 있는 가장 직접적인 방법이다.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(HERE, p), "utf-8");

const DRAFTS = read("drafts.ts");
const AI_ACTIONS = read("aiActions.ts");
const AI_KEYS = read("aiKeys.ts");
const SCHEMA = read("schema.ts");
const ENHANCE = read("lib/anthropicEnhance.ts");
const COMPLIANCE = read("lib/emailCompliance.ts");
const TEMPLATES = read("emailTemplates.ts");

/** `export const <name> = ...` 부터 다음 최상위 export 직전까지. */
function exportBlock(source: string, name: string): string {
  const start = source.indexOf(`export const ${name} =`);
  expect(start, `${name} 를 찾지 못했습니다`).toBeGreaterThan(-1);
  const rest = source.slice(start + 1);
  const next = rest.indexOf("\nexport const ");
  return next === -1 ? rest : rest.slice(0, next);
}

describe("골격(templateKind)이 생성 → 저장 → AI까지 이어진다", () => {
  it("초안 스키마에 골격 컬럼이 있다", () => {
    expect(SCHEMA).toContain("templateKind");
  });

  it("초안 생성이 골격을 레코드에 남긴다", () => {
    const block = exportBlock(DRAFTS, "generateForCampaign");
    expect(block).toContain("templateKind");
    // 커스텀 템플릿과 프리셋은 규범이 다르므로 구분해서 남겨야 한다.
    expect(block).toMatch(/custom \? "custom" : presetId/);
  });

  it("AI 개인화용 조회가 골격을 함께 돌려준다", () => {
    const block = exportBlock(DRAFTS, "listDraftsForEnhance");
    // returns 밸리데이터와 실제 row 조립 **양쪽**에 있어야 한다. 한쪽만 있으면
    // Convex가 런타임에 거부하거나(밸리데이터 누락) 값이 조용히 사라진다(row 누락).
    expect(block).toMatch(/templateKind: v\.optional\(emailTemplateKindValidator\)/);
    expect(block).toMatch(/templateKind: d\.templateKind/);
  });

  it("AI 액션이 골격과 원본 본문을 프롬프트·파서에 모두 넘긴다", () => {
    const block = exportBlock(AI_ACTIONS, "enhanceCampaignDrafts");
    // 원본 본문을 넘기지 않으면 분량 지시가 입력 길이와 무관해진다.
    expect(block).toMatch(/emailEnhanceSystemPrompt\(kind, d\.body\)/);
    expect(block).toMatch(/parseEnhanceEmailResult\([^)]*kind\)/);
    // 레거시 초안(골격 기록 없음)은 표준으로 폴백해야 한다.
    expect(block).toMatch(/templateKind \?\? "standard"/);
  });

  it("다듬기 결과가 원본과 같으면 성공으로 집계하지 않는다", () => {
    const block = exportBlock(AI_ACTIONS, "enhanceCampaignDrafts");
    // 폐기된 건을 updates에 담으면 "N건 개인화했습니다"라면서 한 글자도 안 바뀐다.
    expect(block).toMatch(/next\.subject === d\.subject && next\.body === d\.body/);
    expect(block).toContain("rejected");
  });

  it("분량 규범이 원본 대비 배수로만 정의된다(절대 글자수 표 금지)", () => {
    // 절대값 표를 두면 갓 생성된 초안이 자기 목표를 위반한다(실측 152~708자).
    expect(ENHANCE).toContain("EMAIL_BODY_SCALE");
    expect(ENHANCE).toContain("enhanceLengthBand");
    expect(COMPLIANCE).not.toMatch(/export const EMAIL_BODY_TARGETS/);
    // 게이트는 원본을 모르므로 절대 상한만 본다.
    expect(COMPLIANCE).toContain("EMAIL_BODY_CHAR_MAX");
  });
});

describe("본문이 바뀌면 그에 딸린 판정도 함께 무효화된다", () => {
  it("다듬기 결과 반영이 컴플라이언스를 다시 검사한다", () => {
    const block = exportBlock(DRAFTS, "applyEnhancedDrafts");
    // 본문만 갈아치우고 판정을 그대로 두면 승인 화면이 낡은 배지를 보여 준다.
    expect(block).toContain("checkEmailCompliance");
    expect(block).toContain("complianceLevel");
  });

  it("다듬기 후 사람의 확인 기록을 무효화한다(파일럿 게이트)", () => {
    // 사람이 확인한 것은 다듬기 **이전** 문장이다. 기록을 남겨 두면 게이트가
    // 아무도 읽지 않은 본문에 대해 열린다.
    expect(exportBlock(DRAFTS, "applyEnhancedDrafts")).toMatch(/approvedAt: undefined/);
  });

  it("LLM 출력 파서가 규정 위반과 분량 이탈을 모두 원본으로 되돌린다", () => {
    expect(ENHANCE).toMatch(/check\.status === "fail"\) return fallback/);
    expect(ENHANCE).toMatch(/len > band\.max \|\| len < band\.min\) return fallback/);
  });
});

describe("메일이 나가지 않는 경로는 서버가 막는다", () => {
  it("기록 전용 발송은 명시적 동의 인자를 요구한다", () => {
    // 화면 경고만으로는 부족하다 — 이 경로는 메일 0통으로 초안을 sent로 잠그고
    // 월 한도까지 소모하며, 되돌릴 수 없다.
    const block = exportBlock(DRAFTS, "sendCampaign");
    expect(block).toContain("recordOnly");
    expect(block).toMatch(/recordOnly !== true/);
  });
});

describe("BYOK API 키는 평문으로 저장하지 않는다", () => {
  it("저장 경로가 봉인을 거치고 평문 컬럼을 비운다", () => {
    const block = exportBlock(AI_KEYS, "save");
    expect(block).toContain("sealSecret");
    expect(block).toContain("apiKeySealed");
    // 저장 문서의 `apiKey`에 넣는 값은 undefined **뿐**이어야 한다. 변수명이 바뀌어도
    // 성립하도록 부정 단정 대신 대입 값을 전수로 확인한다(`v.string()`은 인자 선언이므로 제외).
    const assignments = [...block.matchAll(/(?<![\w.])apiKey:\s*([^,\n]+)/g)]
      .map((m) => m[1]!.trim())
      .filter((val) => !val.startsWith("v."));
    expect(assignments).toEqual(["undefined"]);
  });

  it("해석 경로는 봉인 컬럼을 우선하고 레거시 평문을 폴백으로만 쓴다", () => {
    const block = exportBlock(AI_KEYS, "resolveForUser");
    expect(block).toContain("openSecret");
    expect(block).toMatch(/if \(row\.apiKeySealed\)/);
    expect(block).toMatch(/else if \(row\.apiKey\)/);
  });

  it("목록 조회는 키를 복호화하지 않는다 — 저장 시 만든 마스킹만 쓴다", () => {
    const block = exportBlock(AI_KEYS, "status");
    expect(block).toContain("keyMasked");
    expect(block).not.toContain("openSecret");
  });

  /**
   * 마스터 키 환경변수 이름은 세 파일이 **똑같이** 읽어야 한다.
   * 한쪽만 별칭을 추가하면 "둘 중 아무거나 설정하면 된다"고 믿은 배포에서
   * 다른 쪽이 조용히 전부 실패한다(실제로 리뷰에서 잡혔다).
   */
  it("봉인 마스터 키 환경변수를 SMTP 경로와 동일하게 읽는다", () => {
    const SMTP_ACCOUNTS = read("smtpAccounts.ts");
    const SMTP_ACTIONS = read("smtpActions.ts");
    for (const [label, src] of [
      ["aiKeys", AI_KEYS],
      ["smtpAccounts", SMTP_ACCOUNTS],
      ["smtpActions", SMTP_ACTIONS],
    ] as const) {
      expect(src, label).toContain("process.env.SMTP_ENCRYPTION_KEY");
      expect(src, label).not.toContain("SECRET_ENCRYPTION_KEY");
    }
    expect(read("integrations.ts")).not.toContain("SECRET_ENCRYPTION_KEY");
  });
});

describe("커스텀 템플릿 자리표시자 검증", () => {
  it("서버 저장 경로가 오타 키를 거부한다", () => {
    // 렌더러는 모르는 키를 원문 그대로 남긴다 — 막지 않으면 기자 메일에 리터럴이 실린다.
    expect(exportBlock(TEMPLATES, "save")).toContain("findUnknownPlaceholders");
  });
});
