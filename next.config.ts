import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 기존 패키지 자산(skills/, dist/, demo/, *.md)은 앱 번들에서 제외되어야 하므로
  // 별도 설정 없이 App Router가 app/ 이하만 라우팅한다.
  eslint: {
    // 배포 파이프라인에서 lint로 빌드를 막지 않는다(품질은 typecheck로 별도 보장).
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
