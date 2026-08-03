import { describe, expect, it } from "vitest";
import {
  buildPressReleaseAttachment,
  buildPressReleaseFile,
  pressReleaseFilename,
  type PressReleaseFileSource,
} from "./pressReleaseFile";

const NOW = Date.UTC(2026, 7, 3, 6, 0, 0);

const FULL: PressReleaseFileSource = {
  title: "크랩피치, MCP 채팅에서 기자 발송까지 지원",
  headlines: ["크랩피치, 채팅에서 기자 발송까지 연다"],
  subheads: ["매칭부터 발송까지 한 흐름", "발송 직전 확인은 사람이"],
  body: "PR 자동화 서비스 크랩피치가 MCP 연동을 확장했다.\n\n발송 파이프라인 전 구간이 도구로 열렸다.",
  keyTakeaways: ["도구 16종", "발송 전 사용자 확인 필수"],
  quote: "마지막 확인은 사람이 하도록 설계했습니다.",
  spokesName: "홍길동",
  spokesTitle: "대표",
  numbers: "MCP 도구 16종",
  links: ["https://crabpitch.com/press"],
  faq: [{ q: "언제 쓸 수 있나요?", a: "지금 바로 가능합니다." }],
};

const SENDER = {
  companyName: "(주)더에이치클럽/FMG",
  senderName: "신태수",
  contactEmail: "pr@example.com",
};

describe("buildPressReleaseFile", () => {
  it("보도자료 전문이 모두 실린다 — 메일 본문에서 빠진 내용이 여기 있다", () => {
    const out = buildPressReleaseFile(FULL, SENDER, NOW);
    expect(out).toContain("크랩피치, 채팅에서 기자 발송까지 연다");
    expect(out).toContain("발송 파이프라인 전 구간이 도구로 열렸다.");
    expect(out).toContain("매칭부터 발송까지 한 흐름");
    expect(out).toContain("MCP 도구 16종");
    expect(out).toContain("https://crabpitch.com/press");
    expect(out).toContain("언제 쓸 수 있나요?");
  });

  it("헤드라인 1안을 제목으로 쓰고, 없으면 title로 떨어진다", () => {
    expect(buildPressReleaseFile(FULL, SENDER, NOW)).toContain(
      "크랩피치, 채팅에서 기자 발송까지 연다",
    );
    const noHeadline = buildPressReleaseFile({ ...FULL, headlines: [] }, SENDER, NOW);
    expect(noHeadline).toContain("크랩피치, MCP 채팅에서 기자 발송까지 지원");
  });

  it("화자는 「이름 직함」 순서다", () => {
    expect(buildPressReleaseFile(FULL, SENDER, NOW)).toContain("홍길동 대표는 \"");
  });

  it("이름이 이미 직함으로 끝나면 겹쳐 쓰지 않는다", () => {
    const out = buildPressReleaseFile({ ...FULL, spokesName: "김대표" }, SENDER, NOW);
    expect(out).toContain("김대표는 \"");
    expect(out).not.toContain("김대표 대표는");
  });

  it("없는 항목은 머리글째 빠진다 — 빈 섹션을 남기지 않는다", () => {
    const bare: PressReleaseFileSource = { title: "제목", body: "본문." };
    const out = buildPressReleaseFile(bare, {}, NOW);
    expect(out).toContain("【본문】");
    for (const heading of ["핵심 요약", "인용", "주요 수치", "관련 자료", "예상 질문", "문의"]) {
      expect(out).not.toContain(`【${heading}】`);
    }
  });

  it("엠바고가 있으면 최상단에 시각을 못 박고, 없으면 즉시 보도 가능이라고 쓴다", () => {
    const embargoed = buildPressReleaseFile({ ...FULL, embargoAt: NOW }, SENDER, NOW);
    expect(embargoed).toContain("엠바고:");
    expect(embargoed).toContain("이후 보도 요청");
    expect(embargoed).not.toContain("즉시 보도 가능");

    expect(buildPressReleaseFile(FULL, SENDER, NOW)).toContain("즉시 보도 가능");
  });

  it("문의처에 발신자와 연락 이메일이 들어간다", () => {
    const out = buildPressReleaseFile(FULL, SENDER, NOW);
    expect(out).toContain("신태수 / pr@example.com");
  });

  it("헤더 라벨이 겹치지 않는다 — 배포일과 발신 주체는 다른 항목이다", () => {
    const head = buildPressReleaseFile(FULL, SENDER, NOW).split("─")[0]!;
    expect(head).toContain("발신: (주)더에이치클럽/FMG");
    expect(head.match(/^배포:/gm) ?? []).toHaveLength(1);
  });

  it("빈 줄이 3줄 이상 이어지지 않는다", () => {
    expect(buildPressReleaseFile(FULL, SENDER, NOW)).not.toMatch(/\n{3,}/);
  });
});

describe("pressReleaseFilename", () => {
  it(".txt 파일명을 만든다", () => {
    expect(pressReleaseFilename("신제품 출시")).toBe("보도자료_신제품 출시.txt");
  });

  it("날짜를 넣지 않는다 — 초안 본문이 적은 파일명과 발송 시점 첨부가 어긋나면 안 된다", () => {
    const day1 = pressReleaseFilename("신제품 출시");
    const day2 = pressReleaseFilename("신제품 출시");
    expect(day1).toBe(day2);
    expect(day1).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("경로·헤더를 깨뜨리는 문자를 제거한다", () => {
    const name = pressReleaseFilename('신제품/출시: "A"\r\n<속보>');
    expect(name).not.toMatch(/[\\/:*?"<>|\r\n]/);
    expect(name.endsWith(".txt")).toBe(true);
  });

  it("제목이 길어도 파일명이 폭주하지 않는다", () => {
    const name = pressReleaseFilename("가".repeat(200));
    expect(name.length).toBeLessThanOrEqual(70);
  });

  it("제목이 통째로 걸러져도 파일명이 남는다", () => {
    expect(pressReleaseFilename("///")).toBe("보도자료_제목없음.txt");
  });
});

describe("buildPressReleaseAttachment", () => {
  it("Windows 메모장이 한글을 깨뜨리지 않도록 BOM을 붙인다", () => {
    const { text } = buildPressReleaseAttachment(FULL, SENDER, NOW);
    expect(text.charCodeAt(0)).toBe(0xfeff);
  });

  it("파일명과 내용을 함께 돌려준다", () => {
    const att = buildPressReleaseAttachment(FULL, SENDER, NOW);
    expect(att.filename).toMatch(/^보도자료_.+\.txt$/);
    expect(att.text).toContain("【본문】");
  });
});
