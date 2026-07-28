/**
 * 메일 제공자 SMTP 프리셋 — 사용자가 host·port를 몰라도 되게 한다.
 *
 * 설정에서 사용자가 입력할 것은 **이메일과 비밀번호 둘뿐**이어야 한다.
 * 나머지는 도메인으로 판별한다. 국내 사용자는 아래 넷에 대부분 들어간다.
 *
 * ⚠️ 여기는 **순수 함수만** 둔다. 자격증명도 네트워크 호출도 다루지 않는다.
 *    발송 경로(`lib/smtp.ts`)와 분리해 두어야 프리셋 표를 테스트로 고정할 수 있다.
 */

export type SmtpProviderId = "gmail" | "naver" | "daum" | "outlook" | "custom";

export interface SmtpPreset {
  id: SmtpProviderId;
  label: string;
  host: string;
  port: number;
  /** true = 접속부터 TLS(465), false = STARTTLS 승격(587) */
  secure: boolean;
  /** 이 제공자를 쓰는 이메일 도메인 */
  domains: readonly string[];
  /**
   * 사용자가 별도 절차를 밟아야 하는 경우의 안내.
   * 없으면 계정 비밀번호를 그대로 쓴다.
   */
  credentialNote?: string;
  /** 그 절차를 밟는 정확한 페이지 — "설정에서 찾아보세요"와 체감이 다르다 */
  setupUrl?: string;
}

/**
 * ⚠️ 순서가 의미를 갖는다 — `custom`은 폴백이므로 마지막이다.
 * 도메인 목록은 소문자로만 적는다(비교 전에 입력을 소문자화한다).
 */
export const SMTP_PRESETS: readonly SmtpPreset[] = [
  {
    id: "gmail",
    label: "Gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    domains: ["gmail.com", "googlemail.com"],
    // 앱 비밀번호는 2단계 인증을 켠 계정만 발급받을 수 있다.
    // 계정 비밀번호를 넣으면 EAUTH로 떨어지는데, 사용자는 오타로 오해한다.
    credentialNote:
      "Gmail은 계정 비밀번호가 아니라 **앱 비밀번호**가 필요합니다. 2단계 인증을 먼저 켜야 발급됩니다.",
    setupUrl: "https://myaccount.google.com/apppasswords",
  },
  {
    id: "naver",
    label: "네이버 메일",
    host: "smtp.naver.com",
    port: 587,
    secure: false,
    domains: ["naver.com"],
    // 네이버는 SMTP가 기본 꺼져 있다. 켜지 않으면 ECONNREFUSED가 난다.
    credentialNote:
      "네이버 메일은 SMTP 사용이 기본으로 꺼져 있습니다. 환경설정에서 먼저 켜 주세요.",
    setupUrl: "https://mail.naver.com/option/imap",
  },
  {
    id: "daum",
    label: "다음 메일",
    host: "smtp.daum.net",
    port: 465,
    secure: true,
    domains: ["daum.net", "hanmail.net", "kakao.com"],
    credentialNote:
      "다음 메일도 IMAP/SMTP 사용 설정을 먼저 켜야 합니다.",
    setupUrl: "https://mail.daum.net/#/settings/imap",
  },
  {
    id: "outlook",
    label: "Outlook · Hotmail",
    host: "smtp-mail.outlook.com",
    port: 587,
    secure: false,
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
  },
];

/** 프리셋에 없는 도메인이 왔을 때의 기본값 — 회사 메일 대부분이 이 형태다. */
export const CUSTOM_SMTP_FALLBACK: SmtpPreset = {
  id: "custom",
  label: "직접 입력",
  host: "",
  port: 587,
  secure: false,
  domains: [],
};

/** `hong@Naver.com ` → `naver.com` */
export function emailDomain(email: string): string | null {
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 1 || at === email.trim().length - 1) return null;
  const domain = email.trim().toLowerCase().slice(at + 1);
  return domain.includes(".") ? domain : null;
}

/**
 * 이메일로 제공자를 판별한다.
 *
 * 못 찾으면 `custom`을 돌려준다 — null이 아니다. 호출부가 매번 분기하지 않도록
 * 항상 쓸 수 있는 값을 주고, 회사 도메인은 host만 사용자가 채우면 된다.
 */
export function detectSmtpProvider(email: string): SmtpPreset {
  const domain = emailDomain(email);
  if (!domain) return CUSTOM_SMTP_FALLBACK;
  for (const p of SMTP_PRESETS) {
    if (p.domains.includes(domain)) return p;
  }
  // 회사 도메인은 관례상 mail.{도메인}이 가장 흔하다. 확정이 아니라 **제안**이며
  // 연결 테스트가 실패하면 사용자가 고친다.
  return { ...CUSTOM_SMTP_FALLBACK, host: `mail.${domain}` };
}

/** id로 프리셋 조회 — 저장된 provider 문자열을 화면에 되살릴 때 쓴다. */
export function smtpPresetById(id: string): SmtpPreset {
  return SMTP_PRESETS.find((p) => p.id === id) ?? CUSTOM_SMTP_FALLBACK;
}

/**
 * SMTP 오류를 사용자가 할 일로 번역한다.
 *
 * `EAUTH`·`ECONNREFUSED`를 그대로 보여주면 사용자는 무엇을 고쳐야 할지 모른다.
 * 특히 Gmail의 EAUTH는 열에 아홉이 "앱 비밀번호가 아니라 계정 비밀번호를 넣은" 경우다.
 */
export function explainSmtpError(
  rawError: string,
  provider: SmtpProviderId,
): string {
  const e = rawError.toUpperCase();
  if (e.includes("EAUTH") || e.includes("535") || e.includes("AUTHENTICAT")) {
    if (provider === "gmail") {
      return "인증에 실패했습니다. Gmail은 계정 비밀번호가 아니라 앱 비밀번호가 필요합니다 — 2단계 인증을 켜고 앱 비밀번호를 발급해 다시 입력하세요.";
    }
    return "인증에 실패했습니다. 아이디와 비밀번호를 확인하세요.";
  }
  if (e.includes("ECONNREFUSED") || e.includes("ENOTFOUND")) {
    if (provider === "naver" || provider === "daum") {
      return "서버에 연결하지 못했습니다. 메일 환경설정에서 IMAP/SMTP 사용을 먼저 켜 주세요.";
    }
    return "서버에 연결하지 못했습니다. 주소와 포트를 확인하세요.";
  }
  if (e.includes("ETIMEDOUT") || e.includes("ESOCKET")) {
    return "연결이 시간 초과됐습니다. 사내망·방화벽이 SMTP 포트를 막고 있을 수 있습니다.";
  }
  if (e.includes("CERT") || e.includes("SELF_SIGNED")) {
    return "서버 인증서를 확인하지 못했습니다. 포트와 보안 설정(465/SSL, 587/STARTTLS)을 확인하세요.";
  }
  return rawError;
}
