# 크랩피치 Pro 스킬 팩 (skills-pro/) — 유료 구독자 전용

무료 4종(작성→매칭→발송→회신)이 "첫 게재"를 만들었다면, Pro 5종은 **반복·규모·자동화**를 만든다.
기획서 6장 유료 축(발송 규모·자동화·성과추적)과 요금제 기능표에 1:1로 대응한다.

> 배포 정책: 이 팩의 `.skill`은 **유료 구독자에게만** 전달한다(공개 repo 미게시).
> 무료 팩(`skills/`, 공개판 `contentscoin/crabpitch-skill`)과 달리 저장소 비공개를 유지할 것.

## 스킬 5종 × 요금제 매핑

| 스킬 | 플랜 | 하는 일 | 기획서 근거 |
|---|---|---|---|
| `campaign-report` | **Solo 이상** | 캠페인 성과 집계(발송·회신율·게재율) + 게재 확인 + 개선 제안 + 기자 관계 스코어 | 6.3 "성과 리포트" |
| `interview-prep` | **Solo 이상** | 인터뷰 일정 조율(캘린더)·예상 질문·답변 브리지·모의 인터뷰·사후 팔로업 | "답장 응대" 고도화 · 9장 3차 |
| `follow-up-scheduler` | **Growth 이상** | 무응답 기자 팔로업(D+7 규칙)·발송 타이밍·예약 리마인더·엠바고 | 6.3 "예약·반복 발송" |
| `competitor-coverage` | **Growth 이상** | 경쟁사 언론 노출 수집·커버리지 갭·뉴스재킹 앵글·신규 기자 타깃 발굴 | 6.3 "경쟁사 비교" |
| `agency-multi-client` | **Agency** | 클라이언트별 라벨 격리·이해충돌 관리·2단계 승인·화이트라벨 주간 리포트 | 6.3 "멀티 클라이언트·화이트라벨" |

## 무료 4종과의 연결 (파이프라인)

```
media-kit-builder ─┐
press-distribution ┼─ 발송 ──→ reply-handler ─┬─ ①인터뷰 ──→ interview-prep (Solo+)
                   │                          └─ ④게재 ────→ campaign-report (Solo+)
                   ├─ 무응답 D+7 ────────────────────────────→ follow-up-scheduler (Growth+)
                   └─ 다음 캠페인 기획 ←── competitor-coverage (Growth+)
Agency 전체 운영 ←──────────────────────────── agency-multi-client (Agency)
```

## 공통 원칙 (무료 팩과 동일 — Pro라고 예외 없음)

1. **PII 비노출** — 기자 실명·이메일·연락처는 화면/리포트/캘린더 제목에 절대 출력하지 않는다.
   익명 코드(`기자 #A3F1`) + 매체 + beat로만. 실명·이메일은 **실제 발송/초대 시점**에만 주입.
2. **Gmail `언론홍보` 라벨** — 모든 배포·회신·집계는 `언론홍보` 라벨 그룹 안에서.
   캠페인 단위는 `언론홍보/캠페인/{캠페인명}`, Agency는 `언론홍보/{클라이언트}/…`.
3. **컴플라이언스** — 승인 없는 실발송 금지 · 수신거부 문구 필수 · 동일 기자 7일 내 재발송 금지
   (팔로업은 D+7 이후, 캠페인당 총 접촉 2회 상한) · 수신거부는 억제 리스트 영구 등록.

## 설치

무료 팩과 동일: 각 `SKILL.md`를 Claude/Cowork 스킬로 추가하거나(`dist/*.skill`),
GPT/Gemini에는 본문을 Instructions로 붙여넣는다. Gmail·Google Calendar MCP 연결 시 완전 자동화.

## `.skill` 재빌드

```bash
for d in skills/*/ skills-pro/*/; do n=$(basename "$d"); [ -f "$d/SKILL.md" ] && (cd "$d" && zip -q -j "../../dist/$n.skill" SKILL.md); done
```
