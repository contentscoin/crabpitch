/**
 * 한국어 조사 자동 선택.
 *
 * 메일 본문에 `은(는)`·`이(가)` 같은 리터럴이 그대로 나가고 있었다. 실제 발송 메일에서
 * 「(주)더에이치클럽/FMG은(는) …」이 기자에게 도착했다. 사람이 쓴 메일이 아니라는 게
 * 첫 줄에서 드러나는 표기다.
 *
 * 받침 판정 기준
 *  - 한글 음절: 유니코드 조합식으로 종성 인덱스를 본다(정확).
 *  - 숫자: 마지막 자리를 한국어로 읽었을 때의 받침(영·일·삼·육·칠·팔에 받침이 있다).
 *  - 로마자: **한 글자씩 읽는 이름** 기준(FMG → 에프엠지). 약어가 회사명에 흔한 이
 *    앱에서는 이 관행이 맞는다. 단어로 읽는 이름(Google → 구글)은 원리상 알 수 없다.
 *  - 그 외 문자(한자·기호 등): 판정 불가.
 *
 * 판정 불가일 때는 **받침 없음 쪽**을 쓴다. `은(는)` 같은 병기는 어떤 경우에도
 * 쓰지 않는다 — 둘 중 하나가 틀린 것보다 병기가 항상 어색하다.
 */

/** 로마자를 한 글자씩 읽었을 때 받침으로 끝나는 것 — 엘·엠·엔·아르. */
const LATIN_WITH_FINAL = new Set(["l", "m", "n", "r"]);

/** 마지막 자리 숫자를 한국어로 읽었을 때 받침이 있는 것 — 영·일·삼·육·칠·팔. */
const DIGITS_WITH_FINAL = new Set(["0", "1", "3", "6", "7", "8"]);

/** 조사 선택에 쓸 마지막 글자. 닫는 괄호·따옴표·마침표 등은 발음되지 않으므로 건너뛴다. */
function pronouncedLastChar(word: string): string | undefined {
  const trimmed = word.trim();
  for (let i = trimmed.length - 1; i >= 0; i--) {
    const ch = trimmed[i]!;
    if (!/[)\]}>」』"'”’\s.,·…!?~-]/.test(ch)) return ch;
  }
  return undefined;
}

/**
 * 종성(받침) 판정.
 *
 * `undefined`는 "없다"가 아니라 **"모른다"**다. 호출부가 둘을 구분할 수 있어야
 * `으로/로`처럼 ㄹ 예외가 있는 조사를 안전하게 처리할 수 있다.
 */
export function finalConsonant(word: string): "none" | "rieul" | "other" | undefined {
  const ch = pronouncedLastChar(word);
  if (ch === undefined) return undefined;

  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    if (jong === 0) return "none";
    return jong === 8 ? "rieul" : "other"; // 8 = ㄹ
  }
  if (/[0-9]/.test(ch)) {
    if (!DIGITS_WITH_FINAL.has(ch)) return "none";
    // 일(1)·칠(7)·팔(8)은 ㄹ 받침이다 — 「1로」가 맞고 「1으로」는 틀리다.
    return ch === "1" || ch === "7" || ch === "8" ? "rieul" : "other";
  }
  if (/[a-zA-Z]/.test(ch)) {
    const lower = ch.toLowerCase();
    if (!LATIN_WITH_FINAL.has(lower)) return "none";
    return lower === "l" || lower === "r" ? "rieul" : "other";
  }
  return undefined;
}

export type JosaPair = "은는" | "이가" | "을를" | "과와" | "으로로" | "이라라";

/** 받침 있음 / 없음 순서. `으로로`는 ㄹ 받침이 '없음' 쪽을 따른다. */
const FORMS: Record<JosaPair, [withFinal: string, withoutFinal: string]> = {
  은는: ["은", "는"],
  이가: ["이", "가"],
  을를: ["을", "를"],
  과와: ["과", "와"],
  으로로: ["으로", "로"],
  이라라: ["이라", "라"],
};

/**
 * 단어에 맞는 조사를 고른다.
 *
 * 판정 불가(한자·기호로 끝나는 등)면 받침 없음 형태를 쓴다. 확률적으로도 그쪽이 흔하고,
 * 무엇보다 `은(는)` 병기를 부활시키지 않는다.
 */
export function josa(word: string, pair: JosaPair): string {
  const [withFinal, withoutFinal] = FORMS[pair];
  const kind = finalConsonant(word);
  if (kind === undefined || kind === "none") return withoutFinal;
  // ㄹ 받침 뒤에서는 '으로'가 아니라 '로'다(서울로 · 1로).
  if (kind === "rieul" && pair === "으로로") return withoutFinal;
  return withFinal;
}

/** `단어 + 조사`를 한 번에 — 호출부에서 가장 많이 쓰는 형태. */
export function withJosa(word: string, pair: JosaPair): string {
  return `${word}${josa(word, pair)}`;
}
