/**
 * 서버 오류 → 사용자 문구.
 *
 * ⚠️ **도메인 한글 문구는 그대로 통과시킨다.** 이 저장소의 서버 오류 메시지는 이미 사용자용
 *    한글이다(파일럿 게이트 안내, 예약 수단 미연결, 자리표시자 오타 목록 등). 일괄적으로
 *    "오류가 발생했습니다"로 덮으면 사용자가 무엇을 해야 하는지 알려 주는 정보가 사라진다.
 *    이 함수가 하는 일은 **Convex 런타임이 덧붙이는 껍데기를 벗기는 것**뿐이다.
 */

export const DEFAULT_ERROR_MESSAGE = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/**
 * Convex 클라이언트가 붙이는 접두들.
 *
 * 실제 형태 예:
 *   [Request ID: 1a2b3c] Server Error
 *   Uncaught Error: 발신 수단이 연결되지 않았습니다.
 *       at handler (../convex/drafts.ts:455:13)
 */
const PREFIXES: RegExp[] = [
  /^\[Request ID:\s*[^\]]*\]\s*/,
  /^Server Error\s*/,
  /^Uncaught\s+(Error|ConvexError):\s*/,
];

/** 스택 프레임 라인 — 이 줄부터는 사용자에게 의미가 없다. */
const STACK_LINE = /^at\s/;

function stripPrefixes(line: string): string {
  let out = line;
  // 접두가 겹쳐 붙는 경우가 있어(`[Request ID: x] Server Error`) 변화가 없을 때까지 반복한다.
  for (let guard = 0; guard < PREFIXES.length + 1; guard += 1) {
    let changed = false;
    for (const re of PREFIXES) {
      const next = out.replace(re, "");
      if (next !== out) {
        out = next;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out.trim();
}

export function toUserMessage(e: unknown): string {
  // ① Error가 아니면 문자열일 때만 그 값을 쓴다.
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!raw.trim()) return DEFAULT_ERROR_MESSAGE;

  // ② 줄 단위로 나눠 공백 제거.
  const lines = raw.split("\n").map((l) => l.trim());

  // ④ 스택 라인 이후는 버린다.
  const stackAt = lines.findIndex((l) => STACK_LINE.test(l));
  const body = stackAt === -1 ? lines : lines.slice(0, stackAt);

  // ③ 접두 제거 후 ⑤ 남은 첫 줄을 쓴다.
  //    껍데기만 있는 줄(`[Request ID: x] Server Error`)은 제거 후 빈 문자열이 되어 걸러진다.
  const meaningful = body.map(stripPrefixes).filter((l) => l.length > 0);

  // ⑥ 그 외에는 원문을 그대로 통과시킨다.
  return meaningful[0] ?? DEFAULT_ERROR_MESSAGE;
}
