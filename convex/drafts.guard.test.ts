import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 발송 확정 경로 구조 가드.
 *
 * 컴플라이언스 게이트(파일럿 승인·수신거부 재대조·7일 쿨다운·표현 규정·캠페인당 상한·
 * 월 한도)는 발송을 확정하는 **모든** 경로에서 걸려야 한다. 경로마다 로직을 따로 두면
 * 하나가 반드시 샌다 — 실제로 두 번 샜다:
 *   ① 크론 백업 경로가 수신거부 재대조를 빠뜨린 채 돌고 있었다.
 *   ② Gmail 초안 생성 경로가 확정 로직을 따로 들고 있어 쿨다운·표현 규정·상한을 통째로
 *      건너뛰었다. Gmail 연결 사용자에게는 그게 기본 경로였다.
 *
 * 그래서 네 경로가 공통 함수를 통과하는지를 소스 수준에서 고정한다. 런타임 통합 테스트
 * 하네스(convex-test)가 없는 상태에서 이 불변식을 지킬 수 있는 가장 직접적인 방법이다.
 * 다섯 번째 경로가 생기거나 누군가 공통 함수를 우회하면 여기서 깨진다.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, "drafts.ts"), "utf-8");
const GMAIL_SOURCE = readFileSync(join(HERE, "gmailActions.ts"), "utf-8");
const GMAIL_ACCOUNTS_SOURCE = readFileSync(join(HERE, "gmailAccounts.ts"), "utf-8");
const SMTP_SOURCE = readFileSync(join(HERE, "smtpActions.ts"), "utf-8");
const SMTP_ACCOUNTS_SOURCE = readFileSync(join(HERE, "smtpAccounts.ts"), "utf-8");

/** 외부 호출이 끼어 있어 선별 → 호출 → 확정으로 나뉘는 경로들. */
const EXTERNAL_SEND_PATHS = [
  { label: "Gmail 초안 생성", source: GMAIL_SOURCE },
  { label: "SMTP 직접 발송", source: SMTP_SOURCE },
] as const;

/** `export const <name> = ...` 부터 다음 최상위 export 직전까지를 잘라낸다. */
function exportBlock(name: string): string {
  const start = SOURCE.indexOf(`export const ${name} =`);
  expect(start, `${name} 를 찾지 못했습니다`).toBeGreaterThan(-1);
  const rest = SOURCE.slice(start + 1);
  const nextExport = rest.indexOf("\nexport const ");
  return nextExport === -1 ? rest : rest.slice(0, nextExport);
}

/**
 * 선별·확정을 **한 트랜잭션에서** 끝내는 경로.
 *
 * 둘 다 메일을 보내지 않는 기록 전용 경로다(`sendCampaign`은 `recordOnly` 동의 필수,
 * `executeScheduledSend`는 `sendMode: "record_only"` 예약의 실행부).
 * 외부 전송 수단은 호출이 중간에 끼어 선별 → 호출 → 확정 3단계로 나뉜다.
 *
 * ⚠️ `processDueSends`는 여기 없다 — 이제 확정하지 않고 수단별 액션을 **디스패치**한다.
 *    예전에는 여기서 바로 확정해서, 발신 수단과 무관하게 "메일 0통 + sent 기록"이 됐다.
 */
const SEND_PATHS = ["sendCampaign", "executeScheduledSend"] as const;

/**
 * 초안 확정 코드의 흔적 — 초안을 sent로 바꾸면서 발송 시각을 찍는 패치.
 *
 * 단순히 `status: "sent"` 를 찾으면 **캠페인** 상태 정리까지 걸린다. 그건 확정이 아니라
 * 확정 결과를 반영하는 코드이고, 선별 단계에도 정상적으로 존재한다.
 */
const DRAFT_CONFIRM = /status: "sent",\s*\n\s*sentAt:/;

/** 선별 함수를 잘라낸다 — 최상위 `async function` 경계로 자른다. */
function fnBlock(name: string): string {
  const start = SOURCE.indexOf(`async function ${name}`);
  expect(start, `${name} 를 찾지 못했습니다`).toBeGreaterThan(-1);
  const rest = SOURCE.slice(start + 1);
  const boundary = [rest.indexOf("\nasync function "), rest.indexOf("\nexport const ")].filter(
    (i) => i !== -1,
  );
  return boundary.length ? rest.slice(0, Math.min(...boundary)) : rest;
}

describe("발송 확정 경로", () => {
  it("선별·확정 함수는 각각 한 곳에만 정의된다", () => {
    expect(SOURCE.match(/async function selectSendableDrafts/g) ?? []).toHaveLength(1);
    expect(SOURCE.match(/async function confirmSent/g) ?? []).toHaveLength(1);
    expect(SOURCE.match(/async function finalizeCampaignSend/g) ?? []).toHaveLength(1);
  });

  for (const path of SEND_PATHS) {
    it(`${path}는 공통 함수를 통과한다`, () => {
      expect(exportBlock(path)).toContain("finalizeCampaignSend(");
    });
  }

  for (const path of SEND_PATHS) {
    it(`${path}는 발송 확정을 직접 수행하지 않는다`, () => {
      const block = exportBlock(path);
      // 게이트를 건너뛰고 초안을 sent로 바꾸거나 사용량을 올리는 코드가 경로 안에 있으면 안 된다.
      expect(block).not.toMatch(DRAFT_CONFIRM);
      expect(block).not.toContain("bumpSends(");
    });
  }

  it("선별 함수가 다섯 가지 게이트를 모두 호출한다", () => {
    const block = fnBlock("selectSendableDrafts");
    expect(block).toContain("needsPilotApproval(");
    expect(block).toContain("filterSuppressed(");
    expect(block).toContain("partitionByCooldown(");
    expect(block).toContain("checkEmailCompliance(");
    expect(block).toContain("campaignSendCap");
  });

  it("선별 함수는 아무것도 확정하지 않는다", () => {
    const block = fnBlock("selectSendableDrafts");
    expect(block).not.toMatch(DRAFT_CONFIRM);
    expect(block).not.toContain("bumpSends(");
  });

  it("초안을 sent로 바꾸고 사용량을 올리는 곳은 confirmSent 하나뿐이다", () => {
    // 이 파일 전체에서 확정 코드가 두 번 이상 나오면 경로 하나가 게이트를 우회한 것이다.
    expect(SOURCE.match(/status: "sent",\r?\n\s+sentAt:/g) ?? []).toHaveLength(1);
    expect(SOURCE.match(/await bumpSends\(/g) ?? []).toHaveLength(1);
    expect(fnBlock("confirmSent")).toContain("await bumpSends(");
  });

  /**
   * 예약 실행이 **실제로 메일을 보내는지**.
   *
   * 예약 경로는 오랫동안 발신 수단과 무관하게 초안 상태만 sent로 바꿨다. 실행 함수가
   * internalMutation이라 fetch·nodemailer가 구조적으로 불가능했기 때문이다. SMTP를
   * 연결해 두고 예약해도 기자에게 한 통도 나가지 않았고, 초안은 sent로 잠겨 복구도 안 됐다.
   */
  describe("예약 발송 디스패치", () => {
    it("예약은 수단을 받아 저장한다 — 실행 시점에 추론하지 않는다", () => {
      const block = exportBlock("scheduleCampaign");
      expect(block).toContain("sendMode");
      // 실행 시점에 "계정이 없어서 0통"으로 끝나지 않도록 예약 단계에서 연결을 검증한다.
      expect(block).toContain("smtpAccounts");
      expect(block).toContain("gmailAccounts");
    });

    it("크론 백업은 확정하지 않고 디스패치한다", () => {
      const block = exportBlock("processDueSends");
      expect(block).toContain("scheduleSendDispatch(");
      // 여기서 직접 확정하면 실발송 수단을 건너뛴 채 sent가 된다.
      expect(block).not.toContain("finalizeCampaignSend(");
      expect(block).not.toMatch(DRAFT_CONFIRM);
    });

    /**
     * 상호배제 지점은 **한 곳**이어야 한다.
     *
     * 처음에는 크론 안에서만 클레임을 찍었다. 그러면 정상 경로(`scheduler.runAt`)는
     * 크론을 거치지 않아 클레임이 없고, 그 액션이 SMTP 루프를 도는 수십 초 사이 크론이
     * 같은 캠페인을 다시 디스패치해 **같은 기자에게 두 번** 보냈다. 선별은 초안에 락을
     * 걸지 않으므로 두 액션이 같은 목록을 받는다.
     */
    it("클레임은 dispatchedAt을 쓰는 유일한 지점이다", () => {
      // 클레임 본체 외의 곳에서 dispatchedAt에 시각을 찍으면 경로별로 규칙이 갈라진다.
      expect(SOURCE.match(/dispatchedAt: now/g) ?? []).toHaveLength(1);
      expect(fnBlock("claimSend")).toContain("dispatchedAt: now");
    });

    it("클레임이 예약의 유효성까지 판정한다", () => {
      const block = fnBlock("claimSend");
      // 종료 상태 — 남아 있던 잡이 늦게 깨어난 경우.
      expect(block).toMatch(/status === "sent" \|\| campaign\.status === "done"/);
      // 즉시 발송으로 앞질렀거나 시각을 바꿔 재예약했으면 이 잡은 사용자가 원한 게 아니다.
      // 스케줄 잡은 취소할 수 없으므로 실행 측 대조가 유일한 방어다.
      expect(block).toMatch(/campaign\.scheduledSendAt !== scheduledSendAt/);
      expect(block).toContain("DISPATCH_STALE_MS");
    });

    it("모든 디스패치 대상이 예약 시각을 대조 토큰으로 받는다", () => {
      // 토큰이 없으면 낡은 잡을 구분할 수 없다.
      expect(fnBlock("scheduleSendDispatch")).toMatch(/args = \{ campaignId, userId, scheduledSendAt \}/);
      expect(exportBlock("executeScheduledSend")).toContain("claimSend(");
    });

    it("예약을 되돌릴 수단이 있다", () => {
      // 실발송 예약을 걸고 취소할 수 없으면 사용자는 시각이 지나기를 기다릴 수밖에 없다.
      const block = exportBlock("cancelSchedule");
      expect(block).toMatch(/scheduledSendAt: undefined/);
      expect(block).toMatch(/status: "review"/);
    });

    it("확정은 예약 실행 흔적을 정리한다", () => {
      // 남겨 두면 재시도로 성공한 캠페인에 성공 표시와 실패 배너가 함께 뜨고,
      // 남은 시도 횟수가 다음 예약을 첫 실패에 상한으로 밀어 넣는다.
      const block = fnBlock("confirmSent");
      expect(block).toMatch(/lastSendError: undefined/);
      expect(block).toMatch(/sendAttempts: undefined/);
      expect(block).toMatch(/dispatchedAt: undefined/);
    });

    it("전체 테이블 스캔 없이 예약 시각 인덱스로 좁힌다", () => {
      expect(exportBlock("processDueSends")).toContain('withIndex("by_scheduled"');
    });

    it("디스패치는 수단별 액션으로 갈라진다", () => {
      const block = fnBlock("scheduleSendDispatch");
      expect(block).toContain("internal.smtpActions.sendCampaignInternal");
      expect(block).toContain("internal.gmailActions.pushCampaignInternal");
      expect(block).toContain("internal.drafts.executeScheduledSend");
    });

    it("레거시 예약(수단 미기록)은 기록 전용으로 처리한다", () => {
      // 사용자가 동의하지 않은 실발송으로 승격시키면 안 된다.
      expect(exportBlock("processDueSends")).toMatch(/sendMode \?\? "record_only"/);
    });
  });

  it("쿨다운 조회는 사용자 축 인덱스만 쓴다(교차 테넌트 스캔 차단)", () => {
    expect(SOURCE).toContain('withIndex("by_user_journalist"');
    // 사용자 축 없는 전역 기자 인덱스를 쓰면 다른 사용자의 발송 이력이 판정에 섞인다.
    expect(SOURCE).not.toContain('withIndex("by_journalist"');
  });
});

/**
 * 외부 전송 수단 경로 가드 (Gmail 초안 생성 · SMTP 직접 발송).
 *
 * Gmail 경로는 연결 사용자에게 **기본 경로**다. 예전에는 수신거부 재대조만 하고 쿨다운·표현
 * 규정·상한·월 한도를 건너뛰었다 — 확정 로직을 이 경로가 따로 들고 있었기 때문이다.
 * 이제 선별은 `selectForExternalSend`, 확정은 `confirmExternalSent`로 drafts.ts를 통과한다.
 *
 * SMTP는 그 뒤에 붙은 두 번째 전송 수단이다. **수단이 늘어난 것이지 규칙이 늘어난 게 아니다** —
 * 같은 두 함수를 통과하는지 여기서 고정한다. 세 번째 수단이 생겨도 이 목록에 추가하면 된다.
 */
describe("외부 전송 수단 경로", () => {
  for (const { label, source } of EXTERNAL_SEND_PATHS) {
    it(`${label}: 선별·확정 모두 drafts.ts를 통과한다`, () => {
      expect(source).toContain("internal.drafts.selectForExternalSend");
      expect(source).toContain("internal.drafts.confirmExternalSent");
    });

    it(`${label}: 액션 안에서 초안을 직접 확정하지 않는다`, () => {
      expect(source).not.toContain('status: "sent"');
      expect(source).not.toContain("bumpSends(");
    });

    it(`${label}: 보류를 조용히 삼키지 않는다`, () => {
      expect(source).toContain("counts.blockedPilot");
      expect(source).toContain("pilotGateMessage(");
    });

    it(`${label}: 제외 사유를 사용자에게 알린다`, () => {
      // 조용히 줄어든 건수만큼 사용자는 "왜 3건만 나갔지"를 되묻게 된다.
      expect(source).toContain("excludedSummary(");
    });

    /**
     * 예약 실행용 진입점이 있어야 한다.
     *
     * public action은 `getAuthUserId`로 userId를 얻으므로 스케줄러 실행 시점(인증
     * 컨텍스트 없음)에는 쓸 수 없다. 그래서 예약 발송이 실발송에 도달하지 못했다.
     */
    it(`${label}: userId를 받는 internalAction 진입점을 노출한다`, () => {
      expect(source).toContain("internalAction(");
      // 인자 목록 전체를 정규식으로 고정하면 포매팅·인자 추가로 쉽게 깨진다.
      expect(source).toContain('userId: v.id("users")');
    });

    it(`${label}: 예약 실행 진입부에서 클레임을 통과한다`, () => {
      // 클레임 없이 발송하면 크론과 겹쳐 같은 기자에게 두 번 나간다.
      expect(source).toContain("internal.drafts.claimScheduledSend");
    });

    it(`${label}: 발송 본문이 한 곳에만 있다 — 진입점만 둘로 나뉜다`, () => {
      // 본문을 복제하면 게이트가 한쪽에서만 갱신된다.
      expect(source.match(/internal\.drafts\.selectForExternalSend/g) ?? []).toHaveLength(1);
      expect(source.match(/internal\.drafts\.confirmExternalSent/g) ?? []).toHaveLength(1);
    });

    it(`${label}: 예약 실행 실패를 삼키지 않고 기록한다`, () => {
      // 예약 실행 시점에는 사용자가 화면에 없다 — throw로 끝나면 아무도 모른다.
      expect(source).toContain("internal.drafts.recordScheduledSendFailure");
    });
  }

  for (const [label, source] of [
    ["gmailAccounts", GMAIL_ACCOUNTS_SOURCE],
    ["smtpAccounts", SMTP_ACCOUNTS_SOURCE],
  ] as const) {
    it(`${label}에는 확정 로직이 남아 있지 않다`, () => {
      // 게이트를 우회하는 두 번째 확정 경로가 되살아나면 여기서 깨진다.
      expect(source).not.toContain('status: "sent"');
      expect(source).not.toContain("bumpSends(");
    });
  }

  it("선별 mutation은 공통 선별 함수만 쓴다", () => {
    expect(exportBlock("selectForExternalSend")).toContain("selectSendableDrafts(");
  });

  it("확정 mutation은 공통 확정 함수만 쓴다", () => {
    expect(exportBlock("confirmExternalSent")).toContain("confirmSent(");
  });

  it("선별·확정 mutation은 전송 수단별로 늘어나지 않는다", () => {
    // 수단마다 mutation을 하나씩 만들면 그중 하나가 반드시 게이트를 빠뜨린다.
    expect(SOURCE.match(/export const selectFor\w+Send =/g) ?? []).toHaveLength(1);
    expect(SOURCE.match(/export const confirm\w*Sent =/g) ?? []).toHaveLength(1);
  });
});

/**
 * SMTP 자격증명 가드.
 *
 * Gmail 앱 비밀번호는 IMAP까지 열려 있어 DB 유출만으로 과거 메일이 통째로 읽힌다.
 * 평문으로 새는 경로가 생기면 여기서 깨진다.
 */
describe("SMTP 자격증명", () => {
  it("비밀번호는 봉인해서 저장한다", () => {
    expect(SMTP_ACCOUNTS_SOURCE).toContain("sealSecret(");
    expect(SMTP_ACCOUNTS_SOURCE).toContain("passwordSealed");
  });

  it("저장 경로에서 복호화하지 않는다", () => {
    // 원문이 필요한 곳은 실제로 SMTP에 접속하는 액션 하나뿐이다.
    expect(SMTP_ACCOUNTS_SOURCE).not.toContain("openSecret(");
  });

  it("클라이언트로 나가는 쿼리에 비밀번호 필드가 없다", () => {
    const start = SMTP_ACCOUNTS_SOURCE.indexOf("export const getConnection =");
    expect(start).toBeGreaterThan(-1);
    const block = SMTP_ACCOUNTS_SOURCE.slice(start, SMTP_ACCOUNTS_SOURCE.indexOf("\nexport const saveAccount"));
    expect(block).not.toContain("passwordSealed");
    expect(block).not.toContain("password");
  });
});

describe("파일럿 게이트", () => {
  it("판정 로직은 lib/pilotGate 단일 소스만 쓴다", () => {
    expect(SOURCE).toContain('from "./lib/pilotGate"');
    // 임계값을 경로마다 다시 적으면 하나가 반드시 어긋난다.
    expect(SOURCE).not.toContain("PILOT_GATE_MIN_DRAFTS =");
  });

  it("공통 선별 함수가 게이트를 통과한다", () => {
    expect(fnBlock("selectSendableDrafts")).toContain("needsPilotApproval(");
  });

  for (const path of ["sendCampaign", "scheduleCampaign"] as const) {
    it(`${path}는 조용히 0통으로 끝내지 않고 사유를 던진다`, () => {
      const block = exportBlock(path);
      expect(block).toContain("needsPilotApproval(");
      expect(block).toContain("pilotGateMessage(");
    });
  }

  // 외부 전송 경로(Gmail·SMTP)의 보류 처리는 위 "외부 전송 수단 경로"에서 함께 고정한다.
});
