/**
 * 보도자료 전문 첨부 파일.
 *
 * 피치 메일은 기자가 30초 안에 읽고 판단하는 짧은 글이라 보도자료 전문을 담지 않는다.
 * 그런데 전문이 **아무 데도 실리지 않으면** 기자는 "자료를 준비했습니다"라는 문장만
 * 받고 정작 자료를 받지 못한다. 실제 발송 메일이 그랬다.
 *
 * 그래서 전문은 첨부로 나간다. 형식은 **플레인 텍스트**다:
 *  - HTML 첨부는 스팸 필터가 흔히 잡는다. 발신은 사용자 본인 계정이라 평판을 태울 수 없다.
 *  - PDF는 한글 폰트를 번들해야 해서 액션 번들이 몇 MB 늘어난다. 얻는 것에 비해 비싸다.
 *  - 텍스트는 어디서나 열리고, 기자가 기사로 옮길 때 **복사·붙여넣기가 그대로 된다**.
 */

/** 첨부 파일 본문 조립에 필요한 보도자료 필드만 추린 형태. */
export interface PressReleaseFileSource {
  title: string;
  headlines?: string[];
  subheads?: string[];
  body: string;
  keyTakeaways?: string[];
  quote?: string;
  spokesName?: string;
  spokesTitle?: string;
  numbers?: string;
  links?: string[];
  faq?: Array<{ q: string; a: string }>;
  embargoAt?: number;
}

/** 문의처에 들어갈 발신자 정보. */
export interface PressReleaseFileSender {
  companyName?: string;
  senderName?: string;
  contactEmail?: string;
}

/** 파일명·엠바고 표기에 쓰는 날짜(YYYY-MM-DD / YYYY년 M월 D일 HH:MM). */
function ymd(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function stamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 파일명 안전화.
 *
 * 제목은 사용자가 자유롭게 쓴 문자열이라 `/`·개행·제어문자가 들어올 수 있다. 그대로
 * 파일명에 넣으면 메일 클라이언트마다 다르게 깨지거나 헤더가 잘린다. 길이도 제한한다 —
 * 일부 클라이언트가 긴 파일명을 중간에서 자른다.
 *
 * ⚠️ **날짜를 넣지 않는다.** 메일 본문은 초안 생성 시점에 파일명을 적고 첨부는 발송
 *    시점에 만들어진다. 파일명에 날짜가 들어가면 초안을 오늘 만들고 내일 보낼 때
 *    본문이 가리키는 파일명과 실제 첨부 이름이 어긋난다. 배포일은 파일 **안에** 적는다.
 */
export function pressReleaseFilename(title: string): string {
  const safe = title
    // 개행·제어문자는 파일명뿐 아니라 메일 헤더 자체를 깨뜨린다(헤더 인젝션 경로다).
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .replace(/[ .]+$/, "");
  return `보도자료_${safe || "제목없음"}.txt`;
}

/** 인용문 화자 — 「이름 + 직함」. 이름이 이미 직함으로 끝나면 겹쳐 쓰지 않는다. */
function speaker(src: PressReleaseFileSource): string {
  const name = src.spokesName?.trim();
  const title = src.spokesTitle?.trim() || "대표";
  if (!name) return title;
  return name.endsWith(title) ? name : `${name} ${title}`;
}

function section(heading: string, lines: string[]): string[] {
  return lines.length ? ["", `【${heading}】`, ...lines] : [];
}

/**
 * 보도자료 전문 텍스트.
 *
 * 배포 관행대로 헤더(구분·배포일·엠바고) → 제목·부제 → 요약 → 본문 → 인용 → 수치 →
 * 자료 → Q&A → 문의처 → 종료 표기 순서다. **없는 항목은 제목째 빠진다** — 빈
 * 「【인용】」 머리만 남으면 자료를 급조한 티가 난다.
 */
export function buildPressReleaseFile(
  src: PressReleaseFileSource,
  sender: PressReleaseFileSender,
  now: number,
): string {
  const headline = src.headlines?.[0]?.trim() || src.title;
  const lines: string[] = ["[보도자료]"];

  if (src.embargoAt) {
    lines.push(`엠바고: ${stamp(src.embargoAt)} 이후 보도 요청`);
  } else {
    lines.push("배포: 즉시 보도 가능");
  }
  lines.push(`배포일: ${ymd(now)}`);
  if (sender.companyName) lines.push(`발신: ${sender.companyName}`);

  lines.push("", "─".repeat(46), "", headline);
  for (const sub of src.subheads ?? []) {
    const s = sub.trim();
    if (s) lines.push(`- ${s}`);
  }
  lines.push("", "─".repeat(46));

  lines.push(
    ...section(
      "핵심 요약",
      (src.keyTakeaways ?? []).map((t) => t.trim()).filter(Boolean).map((t) => `· ${t}`),
    ),
  );

  lines.push("", "【본문】", "", src.body.trim());

  const quote = src.quote?.trim();
  lines.push(...section("인용", quote ? [`${speaker(src)}는 "${quote}"라고 밝혔습니다.`] : []));

  const numbers = src.numbers?.trim();
  lines.push(...section("주요 수치", numbers ? [numbers] : []));

  lines.push(
    ...section(
      "관련 자료",
      (src.links ?? []).map((l) => l.trim()).filter(Boolean).map((l) => `· ${l}`),
    ),
  );

  const faq = (src.faq ?? []).filter((f) => f.q.trim() && f.a.trim());
  lines.push(
    ...section(
      "예상 질문",
      faq.flatMap((f) => [`Q. ${f.q.trim()}`, `A. ${f.a.trim()}`, ""]).slice(0, -1),
    ),
  );

  const contact = [sender.senderName, sender.contactEmail].filter(Boolean).join(" / ");
  lines.push(...section("문의", contact ? [contact] : []));

  lines.push("", "─".repeat(46), "끝.");

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/**
 * 첨부 1건 — 파일명과 내용.
 *
 * BOM을 붙인다. Windows 메모장이 BOM 없는 UTF-8 텍스트를 완성형으로 잘못 읽어 한글이
 * 깨지는 사례가 아직 남아 있고, 이 첨부의 수신자는 대부분 Windows를 쓴다.
 */
export function buildPressReleaseAttachment(
  src: PressReleaseFileSource,
  sender: PressReleaseFileSender,
  now: number,
): { filename: string; text: string } {
  return {
    filename: pressReleaseFilename(src.title),
    text: `\uFEFF${buildPressReleaseFile(src, sender, now)}`,
  };
}
