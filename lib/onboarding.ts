/**
 * 온보딩 체크리스트 · 발신 수단 배너 판정 — 순수 함수.
 *
 * 화면에 인라인으로 쓰지 않고 분리하는 이유: 이 저장소에는 렌더 테스트 하네스가 없다
 * (`vitest` `environment: "node"`, jsdom 미설치). 판정 규칙이 컴포넌트 안에 있으면
 * 검증할 방법이 없다.
 *
 * ⚠️ 판정 축이 두 개로 갈린다는 것이 이 파일의 핵심 제약이다:
 *   - ①② (프로필·발신 수단) → **사용자 축**. `profiles`·`gmailAccounts`·`smtpAccounts`에
 *     `agencyClientId`가 없어 클라이언트별로 다를 수 없다.
 *   - ③④⑤ (캠페인·매칭·발송) → **클라이언트 축**. `campaigns.list`가 활성 클라이언트를
 *     존중하므로 클라이언트를 바꾸면 리셋된다.
 *   섞으면 에이전시 모드에서 진행률의 의미가 붕괴한다. 그래서 클라이언트 컨텍스트에서는
 *   ③④⑤만 세고(`n/3`) ①②는 "계정 공통"으로 표시해 진행률에서 뺀다.
 *
 * ⚠️ 단, **진행률에서 빼는 것과 화면에서 없애는 것은 다르다.** `allDone`은 계정 공통까지
 *    포함해 판정한다 — 그러지 않으면 클라이언트 축 3단계를 마친 사용자에게서 "발신 수단
 *    미연결" 안내가 통째로 사라진다(배너는 대시보드에서 스스로를 끄므로 아무도 말하지 않게 된다).
 */

/** 발신 수단 종류. `smtp`만 기자 메일함으로 실제 메일이 나간다. */
export type SenderKind = "smtp" | "gmail" | "none";

/**
 * SMTP 마지막 연결 결과.
 *
 * `unverified`가 별도 상태인 이유: `smtpAccounts`는 접속 정보를 저장할 때 `lastStatus`를
 * `undefined`로 되돌린다(이전 테스트 결과가 더 이상 유효하지 않으므로). 즉 "저장됐지만
 * 한 번도 붙어 본 적 없는" 계정이 존재하며, 이것을 `ok`와 같이 취급하면
 * "기자에게 실제 메일이 나갑니다"라고 **단정할 근거가 없는데 단정**하게 된다.
 */
export type SmtpStatus = "ok" | "error" | "unverified";

/** 서버가 판정해 주는 부분(`convex/onboarding.getMyChecklist`). */
export interface OnboardingServerState {
  profileDone: boolean;
  senderKind: SenderKind;
  /** `senderKind !== "smtp"`이면 null. */
  smtpStatus: SmtpStatus | null;
  /** 캠페인 집계가 클라이언트 축인가 — `campaigns.list`와 **같은 판정**이어야 한다. */
  isClientScoped: boolean;
}

/** 클라이언트에서 `campaigns.list`로 계산하는 부분. */
export interface OnboardingCampaignState {
  count: number;
  anyMatched: boolean;
  anySent: boolean;
}

export type OnboardingStepId = "profile" | "sender" | "campaign" | "match" | "send";

export interface OnboardingStep {
  id: OnboardingStepId;
  label: string;
  description: string;
  done: boolean;
  href: string;
  /** 완료로 표시하되 경고 톤 — 예: Gmail만 연결(초안까지만 가능). */
  warn?: boolean;
  /**
   * 진행률에서 제외되는 단계 — 클라이언트별로 나뉘지 않는 계정 공통 설정.
   * 에이전시 클라이언트 컨텍스트에서 ①②가 여기 해당한다.
   */
  accountScoped?: boolean;
}

export interface OnboardingChecklist {
  /** ①②③④⑤ 정본 순서. 화면도 이 순서로 렌더한다(번호가 어긋나지 않게). */
  steps: OnboardingStep[];
  /** 진행률 계산 대상(= `accountScoped`가 아닌 것). */
  counted: OnboardingStep[];
  doneCount: number;
  totalCount: number;
  /** 다음에 해야 할 단계 — 이것만 CTA를 강조한다. */
  nextStep: OnboardingStep | null;
  /** **모든** 단계를 마쳤는가. true면 체크리스트를 렌더하지 않는다. */
  allDone: boolean;
}

/**
 * ② 발신 수단 단계의 문구.
 *
 * Gmail 연결만으로는 기자에게 메일이 나가지 않는다 — `schema.ts`의 `sendModeValidator`
 * 주석: "`gmail_drafts`는 발송이 아니라 Gmail 초안 생성이다… 실제 메일이 나가는 것은
 * `smtp`뿐". 완료로 표시하되 그 사실을 문구로 알린다.
 */
function senderStepText(
  kind: SenderKind,
  smtpStatus: SmtpStatus | null,
): { description: string; warn: boolean } {
  if (kind === "smtp") {
    if (smtpStatus === "error") {
      return { description: "마지막 연결이 실패했습니다 — 설정에서 확인하세요.", warn: true };
    }
    if (smtpStatus === "ok") {
      return { description: "기자에게 실제 메일이 나갑니다.", warn: false };
    }
    // `unverified` — 저장만 된 상태. 붙는다고 단정할 근거가 없다.
    return { description: "저장됐지만 연결을 아직 확인하지 않았습니다.", warn: true };
  }
  if (kind === "gmail") {
    return {
      description:
        "Gmail 연결은 초안 생성까지만 가능합니다. 실제 발송에는 SMTP 연결이 필요합니다.",
      warn: true,
    };
  }
  return { description: "연결하지 않으면 메일이 나가지 않습니다.", warn: false };
}

export function buildOnboardingChecklist(
  server: OnboardingServerState,
  campaigns: OnboardingCampaignState,
): OnboardingChecklist {
  const sender = senderStepText(server.senderKind, server.smtpStatus);

  const steps: OnboardingStep[] = [
    {
      id: "profile",
      label: "발신 정보 저장",
      description: "회사명·보내는 사람·회신 주소를 저장하세요.",
      done: server.profileDone,
      href: "/settings",
      // 에이전시 모드에서는 클라이언트와 무관한 계정 공통 설정이다.
      accountScoped: server.isClientScoped,
    },
    {
      id: "sender",
      label: "발신 수단 연결",
      description: sender.description,
      done: server.senderKind !== "none",
      warn: sender.warn,
      href: "/settings",
      accountScoped: server.isClientScoped,
    },
    {
      id: "campaign",
      label: "첫 캠페인 만들기",
      description: "보도자료를 쓰면 캠페인이 만들어집니다.",
      done: campaigns.count > 0,
      href: "/campaigns/new",
    },
    {
      id: "match",
      label: "기자 매칭 실행",
      description: "주제에 맞는 기자를 찾습니다.",
      done: campaigns.anyMatched,
      href: "/campaigns",
    },
    {
      id: "send",
      // ⚠️ "첫 발송"이 아니라 "첫 발송 **기록**"이다. `campaigns.list`의 `sentCount`는
      //    `record_only`(메일 0통 + sent 기록) 경로를 포함하고, 현재 데이터로는 구분할 수
      //    없다(`emailDrafts`에 발송 수단이 없고 즉시 발송은 `sendMode`를 저장하지 않는다).
      //    구분할 수 없는 것을 구분한 척하는 라벨을 쓰지 않는다.
      label: "첫 발송 기록",
      description: "크랩피치 밖에서 보낸 건도 포함됩니다.",
      done: campaigns.anySent,
      href: "/campaigns",
    },
  ];

  const counted = steps.filter((s) => !s.accountScoped);

  return {
    steps,
    counted,
    doneCount: counted.filter((s) => s.done).length,
    totalCount: counted.length,
    // 다음 한 걸음만 강조한다. 계정 공통 단계도 미완료면 먼저 안내해야 하므로
    // `steps` 전체에서 찾는다(진행률에서만 빠지는 것이다).
    nextStep: steps.find((s) => !s.done) ?? null,
    // ⚠️ `counted`가 아니라 `steps` 전체를 본다. 클라이언트 축만 보면 ①② 미완료 상태에서
    //    카드가 사라지고, 대시보드에서는 배너도 스스로를 끄므로 아무도 알려 주지 않는다.
    allDone: steps.every((s) => s.done),
  };
}

/** `campaigns.list` 결과 → 판정 입력. 필드 이름을 한 곳에서만 알게 한다. */
export function toCampaignState(
  campaigns: Array<{ matchCount: number; sentCount: number }> | undefined,
): OnboardingCampaignState | null {
  if (campaigns === undefined) return null;
  return {
    count: campaigns.length,
    anyMatched: campaigns.some((c) => c.matchCount > 0),
    anySent: campaigns.some((c) => c.sentCount > 0),
  };
}

/* ── 발신 수단 배너 ─────────────────────────────────────────── */

/**
 * 배너 톤.
 *
 * ⚠️ 임계값이 "발신 계정 행이 있는가"가 아니라 **"기자에게 메일이 나가는가"**다.
 *    행 존재로 판정하면 Gmail만 연결한 사용자와 SMTP가 고장 난 사용자 — 실제로 발송이
 *    막히는 두 상태 — 가 아무 경고도 못 받는다. 초안을 다 만들고 발송을 누른 뒤에야
 *    막히는 실패 경로가 그대로 남는 것이다.
 */
export type SenderBannerTone = "blocked" | "partial" | "check";

export interface SenderBannerState {
  tone: SenderBannerTone;
  message: string;
}

const BANNER_MESSAGE: Record<SenderBannerTone, string> = {
  blocked: "발신 수단이 연결되지 않았습니다. 초안은 만들 수 있지만 기자에게 메일은 나가지 않습니다.",
  partial:
    "Gmail만 연결돼 있습니다. Gmail은 초안 생성까지만 가능합니다 — 기자에게 실제로 보내려면 SMTP를 연결하세요.",
  check: "SMTP 마지막 연결이 실패했습니다. 지금 발송하면 실패할 수 있습니다.",
};

/**
 * 배너 상태 — 띄우지 않으려면 null.
 *
 * @param mounted 서버 렌더에서는 `localStorage`를 읽을 수 없다. 마운트 후에만 true.
 */
export function senderBannerState(input: {
  senderKind: SenderKind | null;
  smtpStatus: SmtpStatus | null;
  pathname: string;
  mounted: boolean;
  snoozedUntil: number;
  now: number;
}): SenderBannerState | null {
  const { senderKind, smtpStatus, pathname, mounted, snoozedUntil, now } = input;
  if (!mounted) return null;
  // 로딩 중에는 아무 주장도 하지 않는다.
  if (senderKind === null) return null;
  // 이미 고칠 수 있는 화면에 와 있으면 배너가 방해다.
  if (pathname.startsWith("/settings")) return null;

  const tone: SenderBannerTone | null =
    senderKind === "none"
      ? "blocked"
      : senderKind === "gmail"
        ? "partial"
        : smtpStatus === "error"
          ? "check"
          : // SMTP가 `ok` 또는 `unverified` — 알려진 고장이 아니다. 미검증까지 배너로
            // 계속 찌르면 정상 사용자에게 영구 경고가 된다(체크리스트가 문구로 알린다).
            null;
  if (tone === null) return null;

  /*
    대시보드에서는 `blocked`만 감춘다.

    `blocked`는 체크리스트 ②가 미완료라는 뜻이고, `allDone`이 모든 단계를 보므로
    체크리스트는 **반드시** 렌더된다 → 같은 말을 두 곳에서 하게 된다.
    반면 `partial`·`check`는 ②가 done(경고)이어서 `allDone`이 참일 수 있다 →
    체크리스트가 사라진 자리에서 배너가 말해야 한다.
  */
  if (tone === "blocked" && pathname === "/dashboard") return null;

  if (snoozedUntil >= now) return null;
  return { tone, message: BANNER_MESSAGE[tone] };
}

/* ── 스누즈 ─────────────────────────────────────────────────── */

export const SENDER_BANNER_SNOOZE_PREFIX = "crabpitch-sender-banner-snoozed-until";
export const SENDER_BANNER_SNOOZE_MS = 24 * 60 * 60 * 1000;

/**
 * 스누즈 저장 키 — **사용자별**로 나눈다.
 *
 * 고정 키를 쓰면 한 브라우저를 공유하는 다른 계정이 스누즈를 상속해, 발송이 안 되는
 * 이유를 24시간 동안 모른 채 쓰게 된다.
 */
export function senderBannerSnoozeKey(scopeKey: string): string {
  return `${SENDER_BANNER_SNOOZE_PREFIX}:${scopeKey}`;
}

/** 스누즈 값 파싱 — 손상된 값은 "스누즈 안 됨"으로 본다(경고를 띄우는 쪽으로 실패). */
export function parseSnoozedUntil(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 스누즈 읽기.
 *
 * `localStorage` 접근은 사파리 프라이빗 모드 등에서 **던진다**. 감싸지 않으면 앱 셸이
 * 죽는다 — 배너 하나 때문에 전체 화면을 잃는 것은 어떤 경우에도 맞지 않는다.
 */
export function readSnoozedUntil(scopeKey: string): number {
  try {
    return parseSnoozedUntil(globalThis.localStorage.getItem(senderBannerSnoozeKey(scopeKey)));
  } catch {
    // 못 읽으면 스누즈 없음으로 본다 → 경고가 뜬다(안전한 방향).
    return 0;
  }
}

/** 스누즈 쓰기. 실패해도 호출부가 이번 세션에서는 숨길 수 있게 조용히 넘어간다. */
export function writeSnoozedUntil(scopeKey: string, until: number): void {
  try {
    globalThis.localStorage.setItem(senderBannerSnoozeKey(scopeKey), String(until));
  } catch {
    // 저장 실패는 사용자에게 알릴 것이 없다 — 다음 진입에서 배너가 다시 뜰 뿐이다.
  }
}
