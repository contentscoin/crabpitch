import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * 예약 발송 백업 크론 — scheduler.runAt 누락/재시작 대비.
 * 매분 due queued 캠페인을 확정한다.
 */
const crons = cronJobs();

crons.interval("process due scheduled sends", { minutes: 1 }, internal.drafts.processDueSends);

export default crons;
