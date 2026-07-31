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
 * Convex 클라이언트가 붙이는 접두.
 *
 * ⚠️ 정본은 설치된 패키지다 — `node_modules/convex/dist/esm/browser/logging.js`의
 *    `createHybridErrorStacktrace`:
 *
 *        return `[CONVEX ${prefix}(${udfPath})] ${result.errorMessage}
 *          Called by client`;
 *
 *    즉 실제로 오는 첫 줄은 이렇게 생겼다:
 *        [CONVEX M(smtpActions:sendCampaign)] Uncaught Error: 발신 수단이 연결되지 않았습니다.
 *
 *    처음에는 `[Request ID: …] Server Error` 형태를 가정했는데 **그 문자열은 이 클라이언트에
 *    존재하지 않는다**(패키지 전체 검색 결과 0건). 가정으로 만든 규칙은 초록 테스트를 만들고
 *    실제 형태에 대해서는 아무것도 보장하지 않는다. 접두를 추가할 일이 생기면 반드시
 *    `node_modules/convex`에서 생성 지점을 먼저 확인할 것.
 */
const PREFIXES: RegExp[] = [
  // [CONVEX M(mod:fn)] / [CONVEX Q(...)] / [CONVEX A(...)] — UDF 경로가 사용자에게 새는 지점.
  /^\[CONVEX\s[^\]]*\]\s*/,
  /^Uncaught\s+(Error|ConvexError):\s*/,
  // 자체 호스팅·프록시 환경에서 붙는 형태도 함께 벗긴다(있으면 무해, 없으면 no-op).
  /^Server Error\s*/,
];

/** 사용자에게 의미가 없는 줄 — 이 줄부터 뒤는 버린다. */
const NOISE_LINE = [
  /^at\s/, // 스택 프레임
  /^Called by client$/, // createHybridErrorStacktrace가 덧붙이는 꼬리
];

function stripPrefixes(line: string): string {
  let out = line;
  // 접두가 겹쳐 붙는다(`[CONVEX M(x)] Uncaught Error: …`). 변화가 없을 때까지 반복한다.
  for (let guard = 0; guard <= PREFIXES.length; guard += 1) {
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

  // ③ 소음 줄 이후는 버린다.
  const noiseAt = lines.findIndex((l) => NOISE_LINE.some((re) => re.test(l)));
  const body = noiseAt === -1 ? lines : lines.slice(0, noiseAt);

  // ④ 접두 제거 후 ⑤ 남은 첫 줄을 쓴다.
  //    껍데기만 있는 줄은 제거 후 빈 문자열이 되어 걸러진다.
  const meaningful = body.map(stripPrefixes).filter((l) => l.length > 0);

  // ⑥ 그 외에는 원문을 그대로 통과시킨다.
  return meaningful[0] ?? DEFAULT_ERROR_MESSAGE;
}
