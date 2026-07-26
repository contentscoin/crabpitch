import Link from "next/link";
import {
  ShieldCheck,
  Target,
  Sparkles,
  MessageSquareReply,
  Search,
  PenLine,
  Send,
  Check,
  Plug,
  KeyRound,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PLANS, COMPARE_ROWS, STEPS } from "@/lib/brand";
import {
  CRABPITCH_SKILL_REPO_URL,
  MCP_TOOLS,
} from "@/lib/mcpGuide";
import { cn } from "@/lib/utils";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* NAV */}
      <nav className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2 text-lg font-extrabold">
            <span className="text-xl">🦀</span> 크랩피치
          </div>
          <div className="hidden items-center gap-7 text-sm font-medium text-foreground-muted md:flex">
            <a href="#how" className="hover:text-brand">작동 방식</a>
            <a href="#mcp" className="hover:text-brand">내 AI</a>
            <a href="#compare" className="hover:text-brand">대행사 비교</a>
            <a href="#price" className="hover:text-brand">요금제</a>
            <a href="#platform" className="hover:text-brand">플랫폼</a>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/signin"
              className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-brand-foreground shadow-sm transition-colors hover:bg-brand-hover"
            >
              무료로 시작
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header className="hero-glow">
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-20 sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-soft px-3.5 py-1.5 text-[13px] font-bold text-brand">
            🦀 기자 매칭 · 내 AI로 초안까지
          </span>
          <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.15] sm:text-5xl md:text-[3.4rem]">
            말만 하면,<br />
            <span className="text-gradient-brand">알맞은 기자에게</span> 보도자료가 갑니다.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-foreground-muted">
            홍보팀도, 월 수백만 원 대행사도 없이. 1인 창업가와 소상공인을 위한 AI 언론 배포 도구.
            웹앱에서 배포하거나, 이미 쓰는 Claude·ChatGPT·Gemini에서 기자 찾기와 메일 초안을 이어 가세요.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/signin"
              className="rounded-md bg-brand px-6 py-3.5 text-base font-bold text-brand-foreground shadow-md transition-all hover:bg-brand-hover hover:-translate-y-0.5"
            >
              무료로 첫 배포 시작
            </Link>
            <a
              href="#mcp"
              className="rounded-md border border-border bg-card px-6 py-3.5 text-base font-bold text-foreground transition-colors hover:bg-surface"
            >
              내 AI로 쓰는 법
            </a>
          </div>
          <p className="mt-4 text-[13px] text-muted">
            ✓ 신용카드 불필요 &nbsp;·&nbsp; ✓ 내 Gmail로 직접 발송 &nbsp;·&nbsp; ✓ 내 AI 연결은 Solo부터
          </p>
        </div>
      </header>

      {/* PROBLEM */}
      <Section>
        <Eyebrow>왜 필요한가</Eyebrow>
        <SecTitle>언론 노출, 세 곳에서 막힙니다</SecTitle>
        <SecDesc>
          대행사는 월 200만~500만 원. 1인·소상공인에겐 현실적이지 않습니다. 그래서 대부분 포기하거나,
          정제 안 된 기자 명단에 똑같은 메일을 뿌리고 스팸 처리됩니다.
        </SecDesc>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { n: "문제 1", t: "누구에게 보낼지 모른다", d: "내 주제를 실제로 다루는 현역 기자를 찾지 못합니다. 오래된 엑셀 명단은 이미 부서를 옮긴 기자투성이입니다." },
            { n: "문제 2", t: "어떻게 쓸지 모른다", d: "기자는 하루 수백 통을 받고 3초 안에 판단합니다. 버려지지 않는 메일 프레임을 모릅니다." },
            { n: "문제 3", t: "그 다음을 모른다", d: "답장이 와도 언제 어떤 톤으로 응대할지, 인터뷰 요청과 수신거부를 어떻게 처리할지 막막합니다." },
          ].map((c) => (
            <div key={c.n} className="rounded-lg border border-border bg-card p-6 shadow-card">
              <div className="text-[13px] font-bold text-brand">{c.n}</div>
              <h3 className="mt-2 text-lg font-bold">{c.t}</h3>
              <p className="mt-2 text-sm text-foreground-muted">{c.d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* HOW */}
      <Section id="how" muted>
        <Eyebrow>작동 방식</Eyebrow>
        <SecTitle>대화 한 번, 네 단계로 끝</SecTitle>
        <SecDesc>
          AI 에이전트가 검증된 기자 지식그래프와 당신의 Gmail을 연결해 실행 루프 전체를 돌립니다.
        </SecDesc>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => {
            const Icon = [Search, Target, PenLine, Send][i];
            return (
              <div key={s.n} className="relative rounded-lg border border-border bg-card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-deep text-deep-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-4 text-[13px] font-bold text-brand">STEP {s.n}</div>
                <h3 className="mt-1 text-base font-bold">{s.title}</h3>
                <p className="mt-2 text-sm text-foreground-muted">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* 내 AI */}
      <Section id="mcp">
        <Eyebrow>내 AI에서</Eyebrow>
        <SecTitle>쓰는 Claude·ChatGPT·Gemini에서 바로 이어 가세요</SecTitle>
        <SecDesc>
          새 AI를 배울 필요 없습니다. 연결 키만 한 번 붙이면, 평소 채팅에서 기자 찾기·메일 초안·회신
          분류를 요청할 수 있습니다. 실제 발송은 웹앱의 내 Gmail에서만 합니다.
        </SecDesc>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            {MCP_TOOLS.map((tool) => (
              <div
                key={tool.name}
                className="rounded-lg border border-border bg-card px-5 py-4 shadow-card"
              >
                <div className="text-base font-bold text-foreground">{tool.title}</div>
                <p className="mt-2 text-sm text-foreground-muted">{tool.description}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-surface p-6">
              <div className="flex items-center gap-2 text-brand">
                <KeyRound className="h-5 w-5" />
                <span className="text-sm font-extrabold">3단계</span>
              </div>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-foreground-muted">
                <li>
                  로그인 후 <b className="text-foreground">내 AI</b>에서 연결 키를 만듭니다.
                </li>
                <li>연결 주소를 복사해 Claude·ChatGPT·Gemini·Cursor에 붙여넣습니다.</li>
                <li>채팅에서 「기자 찾아줘」「메일 초안 만들어줘」라고 말합니다.</li>
              </ol>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <div className="flex items-center gap-2 text-brand">
                <Plug className="h-5 w-5" />
                <span className="text-sm font-extrabold">안심하고 쓰세요</span>
              </div>
              <ul className="mt-3 space-y-2 text-sm text-foreground-muted">
                <li>
                  기자 실명·이메일은 AI에 안 나옵니다 —{" "}
                  <b className="text-foreground">기자 코드</b>만
                </li>
                <li>
                  발송은 <b className="text-foreground">웹앱 + 내 Gmail</b>에서만
                </li>
                <li>
                  연결은 <b className="text-foreground">Solo / Growth / Agency</b>에서
                </li>
              </ul>
              <div className="mt-5">
                <Link
                  href="/signin"
                  className="inline-flex rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-brand-foreground hover:bg-brand-hover"
                >
                  로그인하고 연결하기
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* COMPARE */}
      <Section id="compare" muted>
        <Eyebrow>포지셔닝</Eyebrow>
        <SecTitle>홍보 대행사와 무엇이 다른가</SecTitle>
        <SecDesc>
          월 수백만 원 대행사는 예산 있는 기업의 것입니다. 크랩피치는 <b>같은 실행(매칭→작성→발송→응대)</b>을
          1인·소상공인이 직접, <b>100분의 1 비용</b>으로 돌리게 합니다. 기자 관계도 대행사가 아닌 내 것이 됩니다.
        </SecDesc>
        <div className="mt-9 overflow-hidden rounded-lg border border-border shadow-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="bg-deep px-4 py-4 text-left font-bold text-deep-foreground">구분</th>
                <th className="bg-deep px-4 py-4 text-left font-bold text-deep-foreground">홍보 대행사</th>
                <th className="bg-brand px-4 py-4 text-left font-bold text-brand-foreground">크랩피치</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((r, i) => (
                <tr key={r.feat} className={i % 2 ? "bg-surface" : "bg-card"}>
                  <td className="border-t border-border px-4 py-3.5 font-semibold">{r.feat}</td>
                  <td className="border-t border-border px-4 py-3.5 text-foreground-muted">{r.agency}</td>
                  <td className="border-t border-border bg-brand-soft/60 px-4 py-3.5 font-semibold text-foreground">
                    {r.us}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* PRICING */}
      <Section id="price">
        <Eyebrow>요금제</Eyebrow>
        <SecTitle>첫 성공은 무료로, 규모는 합리적으로</SecTitle>
        <SecDesc>
          대행사의 100분의 1 가격. 무료로 &lsquo;언론에 한 번 실리는 경험&rsquo;부터 시작하세요. 연간 결제 시 2개월 무료.
        </SecDesc>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={cn(
                "flex flex-col rounded-xl border bg-card p-6 shadow-card",
                p.popular ? "border-2 border-brand shadow-lg" : "border-border",
              )}
            >
              {p.popular && (
                <span className="mb-2.5 w-fit rounded-full bg-brand px-2.5 py-1 text-[11px] font-extrabold text-brand-foreground">
                  가장 인기
                </span>
              )}
              <div className="text-base font-extrabold">{p.name}</div>
              <div className="mt-0.5 min-h-8 text-[13px] text-muted">{p.who}</div>
              <div className="mt-3 text-3xl font-extrabold">
                {p.price}
                <span className="text-sm font-semibold text-muted">{p.unit}</span>
              </div>
              <ul className="mt-4 flex flex-col gap-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-foreground-muted">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signin"
                className={cn(
                  "mt-6 rounded-md py-2.5 text-center text-sm font-bold transition-colors",
                  p.popular
                    ? "bg-brand text-brand-foreground hover:bg-brand-hover"
                    : "border border-border bg-surface text-foreground hover:bg-surface-2",
                )}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-foreground-muted">
          단발성 이용은 종량제로 — 발송 100통당 <b>9,000원</b> · 미디어킷 PDF 1건 <b>5,000원</b>
        </p>
      </Section>

      {/* COMPLIANCE */}
      <Section>
        <div className="flex flex-col gap-5 rounded-xl bg-deep p-8 text-deep-foreground sm:flex-row sm:items-start sm:gap-6">
          <ShieldCheck className="h-8 w-8 shrink-0 text-brand" />
          <div>
            <h3 className="text-xl font-bold">스팸이 아니라, 정밀 피치입니다</h3>
            <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-deep-foreground/80">
              모든 발송은 <b>사용자 승인 게이트</b>를 거치고, 메일에는 <b>수신거부 문구</b>가 기본 삽입됩니다.
              동일 기자 7일 내 재발송을 막고, 수신거부 회신은 <b>억제 리스트</b>에 영구 등록됩니다. 발송은
              회사 서버가 아닌 <b>당신의 Gmail</b>로 나가 신뢰를 지킵니다. 내 AI 연결에서도
              기자 실명·이메일은 나오지 않으며, 무작위 대량발송보다 근거 있는 소량 정밀 발송이 실제로 더 잘 실립니다.
            </p>
          </div>
        </div>
      </Section>

      {/* PLATFORMS */}
      <Section id="platform" muted>
        <Eyebrow>어디서든</Eyebrow>
        <SecTitle>웹앱이든, 내 AI든 — 같은 피치</SecTitle>
        <SecDesc>
          대시보드에서 끝까지 돌리거나, 평소 쓰는 AI 채팅에서 초안을 잡고 웹앱에서만 발송하세요.
        </SecDesc>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              i: <Sparkles className="h-5 w-5 text-brand" />,
              t: "Claude",
              d: "연결 주소를 붙인 뒤, 채팅에서 기자 찾기·메일 초안을 요청하세요. 발송은 웹앱 Gmail로.",
            },
            {
              i: <MessageSquareReply className="h-5 w-5 text-brand" />,
              t: "ChatGPT",
              d: "커스텀 GPT나 커넥터에 연결 주소를 등록하면 같은 흐름으로 초안을 잡을 수 있습니다.",
            },
            {
              i: <Target className="h-5 w-5 text-brand" />,
              t: "Gemini",
              d: "Gem에 연결을 추가하고, Workspace Gmail·웹앱 발송과 함께 이어 쓰세요.",
            },
          ].map((p) => (
            <div key={p.t} className="rounded-lg border border-border bg-card p-6 shadow-card">
              <div className="mb-3">{p.i}</div>
              <b className="text-base">{p.t}</b>
              <p className="mt-2 text-sm text-foreground-muted">{p.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-foreground-muted">
          로그인 후 <b>내 AI</b>에서 연결 키를 만들고 바로 시작할 수 있습니다.
        </p>
      </Section>

      {/* FINAL CTA */}
      <Section>
        <div
          className="rounded-2xl px-6 py-14 text-center text-white"
          style={{ background: "linear-gradient(120deg, #12314f, #0b2338)" }}
        >
          <h2 className="text-3xl font-extrabold">오늘, 첫 보도자료를 알맞은 기자에게</h2>
          <p className="mt-3 text-lg text-white/75">무료로 첫 언론 노출을 경험하세요. 카드 등록 없이 시작합니다.</p>
          <Link
            href="/signin"
            className="mt-7 inline-block rounded-md bg-brand px-7 py-3.5 text-base font-bold text-brand-foreground transition-colors hover:bg-brand-hover"
          >
            🦀 무료로 시작하기
          </Link>
        </div>
      </Section>

      {/* FOOTER */}
      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-3 px-6 text-[13px] text-muted sm:flex-row">
          <div>
            <div className="flex items-center gap-2 text-base font-extrabold text-foreground">🦀 크랩피치</div>
            <p className="mt-2 max-w-xl text-xs leading-relaxed">
              1인·소상공인을 위한 언론 배포 도구입니다. 기자 실명·이메일은 화면과 AI 응답에
              노출하지 않으며, 발송은 사용자 승인 후에만 진행합니다.
            </p>
            <p className="mt-2 text-xs">
              <a
                href={CRABPITCH_SKILL_REPO_URL}
                className="underline underline-offset-2 hover:text-brand"
                target="_blank"
                rel="noreferrer"
              >
                공개 스킬
              </a>
              {" · "}
              <a
                href="https://github.com/contentscoin/crabpitch"
                className="underline underline-offset-2 hover:text-brand"
                target="_blank"
                rel="noreferrer"
              >
                앱 저장소
              </a>
            </p>
          </div>
          <div className="shrink-0">© 2026 CrabPitch · 1인·소상공인을 위한 언론 배포</div>
        </div>
      </footer>
    </main>
  );
}

/* ── 섹션 헬퍼 ── */
function Section({
  children,
  id,
  muted,
}: {
  children: React.ReactNode;
  id?: string;
  muted?: boolean;
}) {
  return (
    <section id={id} className={cn("py-16 sm:py-20", muted && "bg-surface")}>
      <div className="mx-auto max-w-6xl px-6">{children}</div>
    </section>
  );
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-extrabold uppercase tracking-wide text-brand">{children}</span>;
}
function SecTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-2 text-3xl font-extrabold">{children}</h2>;
}
function SecDesc({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 max-w-2xl text-[17px] text-foreground-muted">{children}</p>;
}
