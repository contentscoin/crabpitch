/**
 * 온보딩 체크리스트 판정 — 순수 함수.
 *
 * 화면에 인라인으로 쓰지 않고 분리하는 이유: 이 저장소에는 렌더 테스트 하네스가 없다
 * (`vitest` `environment: "node"`, jsdom 미설치). 판정 규칙이 컴포넌트 안에 있으면
 * 검증할 방법이 없다.
 *
 * ⚠️ 판정 축이 두 개로 갈린다는 것이 이 파일의 핵심 제약이다:
 *   - ①② (프로필·발신 수단) → **사용자 축**. `profiles`·`gmailAccounts`·`smtpAccounts`에
 *     `agencyClientId`가 없어 클라이언트별로 다를 수 없다.
 *   - ③④⑤ (캠페인·매칭·발송) → **클라이언트 축**. `campaigns.list`가 `activeClientId`를
 *     존중하므로 클라이언트를 바꾸면 리셋된다.
 *   섞으면 에이전시 모드에서 진행률의 의미가 붕괴한다. 그래서 클라이언트 컨텍스트에서는
 *   ③④⑤만 세고(`n/3`) ①②는 "계정 공통"으로 분리한다.
 */

/** 발신 수단 종류. `smtp`만 기자 메일함으로 실제 메일이 나간다. */
export type SenderKind = "smtp" | "gmail" | "none";

/** 서버가 판정해 주는 부분(`convex/onboarding.getMyChecklist`). */
export interface OnboardingServerState {
  profileDone: boolean;
  senderKind: SenderKind;
  /** SMTP 마지막 연결이 실패했는가 — "저장됐다 ≠ 붙는다". */
  senderNeedsCheck: boolean;
  /** 에이전시 클라이언트 컨텍스트가 설정돼 있는가. */
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
  /** 완료로 표시하되 경고 톤 — Gmail은 초안 생성까지만 가능하다. */
  warn?: boolean;
  /**
   * 진행률에서 제외되고 "계정 공통 설정"으로 분리되는 단계.
   * 에이전시 클라이언트 컨텍스트에서 ①②가 여기 해당한다.
   */
  accountScoped?: boolean;
}

export interface OnboardingChecklist {
  steps: OnboardingStep[];
  /** 진행률 계산에 쓰이는 단계(= `accountScoped`가 아닌 것). */
  counted: OnboardingStep[];
  doneCount: number;
  totalCount: number;
  /** 다음에 해야 할 단계 — 이것만 CTA를 강조한다. */
  nextStep: OnboardingStep | null;
  /** 셀 단계를 모두 마쳤는가. true면 체크리스트를 렌더하지 않는다. */
  allDone: boolean;
}

/**
 * ② 발신 수단 단계의 문구.
 *
 * Gmail 연결만으로는 기자에게 메일이 나가지 않는다 — `schema.ts`의 `sendModeValidator`
 * 주석: "`gmail_drafts`는 발송이 아니라 Gmail 초안 생성이다… 실제 메일이 나가는 것은
 * `smtp`뿐". 완료로 표시하되 그 사실을 문구로 알린다.
 */
function senderStepText(kind: SenderKind, needsCheck: boolean): { description: string; warn: boolean } {
  if (kind === "smtp") {
    return needsCheck
      ? {
          description: "마지막 연결이 실패했습니다 — 설정에서 확인하세요.",
          warn: true,
        }
      : { description: "기자에게 실제 메일이 나갑니다.", warn: false };
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
  const sender = senderStepText(server.senderKind, server.senderNeedsCheck);

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
  const doneCount = counted.filter((s) => s.done).length;

  return {
    steps,
    counted,
    doneCount,
    totalCount: counted.length,
    // 다음 한 걸음만 강조한다. 계정 공통 단계도 미완료면 먼저 안내해야 하므로
    // `steps` 전체에서 찾는다(진행률에서만 빠지는 것이다).
    nextStep: steps.find((s) => !s.done) ?? null,
    allDone: doneCount === counted.length,
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

/* ── 발신 수단 미연결 배너 ──────────────────────────────────── */

export const SENDER_BANNER_SNOOZE_KEY = "crabpitch-sender-banner-snoozed-until";
export const SENDER_BANNER_SNOOZE_MS = 24 * 60 * 60 * 1000;

/**
 * 배너를 띄울지 판정.
 *
 * `/dashboard`를 제외하는 이유: `senderKind === "none"`이면 ②가 미완료이므로 체크리스트가
 * **항상** 렌더된다 → 같은 말을 두 곳에서 하게 된다.
 * `/settings`를 제외하는 이유: 이미 고칠 수 있는 화면에 와 있으면 배너가 방해다.
 *
 * @param mounted 서버 렌더에서는 `localStorage`를 읽을 수 없다. 마운트 후에만 true.
 */
export function shouldShowSenderBanner(input: {
  senderKind: SenderKind | null;
  pathname: string;
  mounted: boolean;
  snoozedUntil: number;
  now: number;
}): boolean {
  const { senderKind, pathname, mounted, snoozedUntil, now } = input;
  if (!mounted) return false;
  if (senderKind !== "none") return false;
  if (pathname.startsWith("/settings")) return false;
  if (pathname === "/dashboard") return false;
  return snoozedUntil < now;
}

/** 스누즈 값 파싱 — 손상된 값은 "스누즈 안 됨"으로 본다. */
export function parseSnoozedUntil(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
