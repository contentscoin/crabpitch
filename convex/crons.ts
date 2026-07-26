import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * 예약 발송 백업 크론 — scheduler.runAt 누락/재시작 대비.
 * 매분 due queued 캠페인을 확정한다.
 */
const crons = cronJobs();

crons.interval("process due scheduled sends", { minutes: 1 }, internal.drafts.processDueSends);

/**
 * 기자단 팩 동기화 — 일 1회.
 * 팩 갱신은 "새 시리즈 발행" 패턴이라 분 단위로 볼 이유가 없고, 실패·결손 팩은
 * 다음 주기에 자연히 재시도된다(팩 단위 커밋 + packSyncRuns 기록).
 */
crons.daily(
  "sync journalist packs",
  { hourUTC: 18, minuteUTC: 30 }, // KST 03:30 — 트래픽이 가장 적은 시간
  internal.opencrabActions.syncPacksInternal,
  {},
);

export default crons;
