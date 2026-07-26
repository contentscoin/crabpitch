import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 발송 확정 경로 구조 가드.
 *
 * 컴플라이언스 게이트(수신거부 재대조·7일 쿨다운·표현 규정·캠페인당 상한)는 발송을
 * 확정하는 **모든** 경로에서 걸려야 한다. 경로마다 로직을 따로 두면 하나가 반드시 샌다 —
 * 실제로 크론 백업 경로가 수신거부 재대조를 빠뜨린 채 돌고 있었다.
 *
 * 그래서 세 경로가 공통 함수를 통과하는지를 소스 수준에서 고정한다. 런타임 통합 테스트
 * 하네스(convex-test)가 없는 상태에서 이 불변식을 지킬 수 있는 가장 직접적인 방법이다.
 * 네 번째 경로가 생기거나 누군가 공통 함수를 우회하면 여기서 깨진다.
 */

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "drafts.ts"),
  "utf-8",
);

/** `export const <name> = ...` 부터 다음 최상위 export 직전까지를 잘라낸다. */
function exportBlock(name: string): string {
  const start = SOURCE.indexOf(`export const ${name} =`);
  expect(start, `${name} 를 찾지 못했습니다`).toBeGreaterThan(-1);
  const rest = SOURCE.slice(start + 1);
  const nextExport = rest.indexOf("\nexport const ");
  return nextExport === -1 ? rest : rest.slice(0, nextExport);
}

const SEND_PATHS = ["sendCampaign", "executeScheduledSend", "processDueSends"] as const;

describe("발송 확정 3경로", () => {
  it("공통 함수는 한 곳에만 정의된다", () => {
    const defs = SOURCE.match(/async function finalizeCampaignSend/g) ?? [];
    expect(defs).toHaveLength(1);
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
      expect(block).not.toContain('status: "sent", sentAt');
      expect(block).not.toContain("bumpSends(");
    });
  }

  it("공통 함수가 네 가지 게이트를 모두 호출한다", () => {
    const start = SOURCE.indexOf("async function finalizeCampaignSend");
    const block = SOURCE.slice(start, SOURCE.indexOf("\nexport const", start));
    expect(block).toContain("filterSuppressed(");
    expect(block).toContain("partitionByCooldown(");
    expect(block).toContain("checkEmailCompliance(");
    expect(block).toContain("campaignSendCap");
  });

  it("쿨다운 조회는 사용자 축 인덱스만 쓴다(교차 테넌트 스캔 차단)", () => {
    expect(SOURCE).toContain('withIndex("by_user_journalist"');
    // 사용자 축 없는 전역 기자 인덱스를 쓰면 다른 사용자의 발송 이력이 판정에 섞인다.
    expect(SOURCE).not.toContain('withIndex("by_journalist"');
  });
});
