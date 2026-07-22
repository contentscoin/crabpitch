import type { Metadata } from "next";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "크랩피치 — 말만 하면, 알맞은 기자에게 보도자료가 갑니다",
  description:
    "홍보팀도, 월 수백만 원 대행사도 없이. 1인 창업가·소상공인을 위한 AI 언론 배포 도구. 보도자료 작성부터 기자 매칭·개인화 메일·답장 응대까지 대화 한 번으로.",
};

// 초기 페인트 전 테마 적용(플래시 방지)
const themeScript = `(function(){try{var t=localStorage.getItem('crabpitch-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="ko" suppressHydrationWarning>
        <head>
          <link
            rel="stylesheet"
            href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
          />
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        </head>
        <body>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
