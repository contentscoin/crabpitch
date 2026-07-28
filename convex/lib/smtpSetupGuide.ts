/**
 * 메일 발송 설정 안내 — MCP 클라이언트(Claude·ChatGPT 등)가 사용자를 끝까지 데려가게 한다.
 *
 * "설정에서 연결하세요"로 끝내면 사용자는 앱 비밀번호가 뭔지, 왜 계정 비밀번호가 안 되는지,
 * 네이버는 왜 연결이 거부되는지 모른 채 막힌다. 제공자별로 **밟아야 할 순서**를 준다.
 *
 * ⚠️ 이 모듈은 비밀번호를 **받지도 돌려주지도 않는다.** MCP 도구 인자에 비밀번호를 두면
 *    자격증명이 대화 기록에 남는다 — 우리 DB보다 통제가 약한 곳이다. 입력은 반드시
 *    사용자가 웹 설정 화면에서 직접 한다.
 */

import { detectSmtpProvider, type SmtpProviderId } from "./smtpProviders";

export interface MailSetupStatus {
  connected: boolean;
  email?: string;
  providerLabel?: string;
  /** 마지막 연결 확인 결과 — 저장됐다는 것과 실제로 붙는다는 것은 다르다. */
  lastStatus?: "ok" | "error";
  lastError?: string;
}

export interface MailSetupGuide {
  /** 사용자가 실제로 입력할 화면. 안내의 종착지는 언제나 여기다. */
  settingsUrl: string;
  connection: {
    connected: boolean;
    email?: string;
    provider?: string;
    verified: boolean;
    problem?: string;
  };
  provider?: {
    id: SmtpProviderId;
    label: string;
    host: string;
    port: number;
    security: "SSL" | "STARTTLS";
    note?: string;
    setupUrl?: string;
  };
  steps: string[];
  /** 에이전트가 반드시 지켜야 할 것 — 비밀번호를 대화로 받지 않는다. */
  cautions: string[];
}

/** 제공자별로 사용자가 밟아야 하는 순서. 마지막은 언제나 연결 테스트다. */
function providerSteps(id: SmtpProviderId, settingsUrl: string): string[] {
  const enter = `${settingsUrl} 의 '발신 메일 (SMTP)'에서 이메일과 비밀번호를 입력합니다.`;
  const verify = "'저장하고 연결 확인'을 눌러 실제로 붙는지 확인합니다.";
  switch (id) {
    case "gmail":
      return [
        "Google 계정에서 2단계 인증을 켭니다(앱 비밀번호는 2단계 인증이 켜져 있어야 발급됩니다).",
        "https://myaccount.google.com/apppasswords 에서 앱 비밀번호를 발급받습니다.",
        `${enter} 비밀번호 칸에는 계정 비밀번호가 아니라 **앱 비밀번호**를 넣습니다.`,
        verify,
      ];
    case "naver":
      return [
        "네이버 메일 > 환경설정 > POP3/IMAP 설정에서 'IMAP/SMTP 사용'을 '사용함'으로 바꿉니다(기본값은 꺼져 있습니다).",
        enter,
        verify,
      ];
    case "daum":
      return [
        "다음 메일 > 환경설정 > IMAP/POP3에서 사용 설정을 켭니다.",
        enter,
        verify,
      ];
    case "outlook":
      return [enter, verify];
    default:
      return [
        "회사 메일이라면 관리자에게 SMTP 서버 주소와 포트를 확인합니다(보통 mail.도메인 또는 smtp.도메인, 587 또는 465).",
        `${enter} 서버 주소가 자동으로 채워지지 않으면 '서버 직접 설정'을 펼쳐 입력합니다.`,
        verify,
      ];
  }
}

/**
 * 안내를 만든다.
 *
 * `email`은 **선택**이다. 주면 제공자별 절차까지 좁혀 주고, 없으면 어디서 시작하는지만
 * 알려 준다. 이메일을 모른다고 안내를 거부하면 사용자는 아무것도 얻지 못한다.
 */
export function buildMailSetupGuide(opts: {
  email?: string;
  status: MailSetupStatus;
  settingsUrl: string;
}): MailSetupGuide {
  const { status, settingsUrl } = opts;
  const email = opts.email?.trim() || status.email;
  const preset = email ? detectSmtpProvider(email) : null;

  const cautions = [
    "비밀번호·앱 비밀번호를 이 대화에 붙여넣지 마세요. 대화 기록에 남습니다. 입력은 설정 화면에서 직접 하세요.",
    "CrabPitch는 비밀번호를 암호화해 보관하며, 발송하는 순간에만 복호화합니다.",
  ];

  // 이미 붙는 상태면 절차를 다시 늘어놓지 않는다 — 할 일이 없다고 말해 주는 게 안내다.
  if (status.connected && status.lastStatus === "ok") {
    return {
      settingsUrl,
      connection: {
        connected: true,
        email: status.email,
        provider: status.providerLabel,
        verified: true,
      },
      ...(preset
        ? {
            provider: {
              id: preset.id,
              label: preset.label,
              host: preset.host,
              port: preset.port,
              security: preset.secure ? ("SSL" as const) : ("STARTTLS" as const),
              note: preset.credentialNote,
              setupUrl: preset.setupUrl,
            },
          }
        : {}),
      steps: [
        `${status.email} 로 발송할 준비가 이미 끝났습니다. 추가 설정은 필요하지 않습니다.`,
        "발송은 CrabPitch 웹앱에서 캠페인을 열고 승인 단계를 거쳐야 진행됩니다.",
      ],
      cautions,
    };
  }

  const steps = providerSteps(preset?.id ?? "custom", settingsUrl);
  // 저장은 됐는데 확인에 실패한 상태 — 처음부터가 아니라 '고치기'가 필요하다.
  if (status.connected) {
    steps.unshift(
      status.lastStatus === "error"
        ? `현재 ${status.email} 설정이 저장돼 있지만 연결에 실패했습니다: ${status.lastError ?? "원인 미확인"}`
        : `현재 ${status.email} 설정이 저장돼 있으나 아직 연결을 확인하지 않았습니다.`,
    );
  }

  return {
    settingsUrl,
    connection: {
      connected: status.connected,
      email: status.email,
      provider: status.providerLabel,
      verified: status.lastStatus === "ok",
      problem: status.lastStatus === "error" ? status.lastError : undefined,
    },
    ...(preset
      ? {
          provider: {
            id: preset.id,
            label: preset.label,
            host: preset.host,
            port: preset.port,
            security: preset.secure ? ("SSL" as const) : ("STARTTLS" as const),
            note: preset.credentialNote,
            setupUrl: preset.setupUrl,
          },
        }
      : {}),
    steps,
    cautions,
  };
}
