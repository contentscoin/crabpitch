# AI 프로바이더 연동 — GPT · Claude · Gemini 웹 직접 실행

크랩피치의 AI 실행(보도자료 다듬기 `polishPressRelease`, 메일 개인화
`enhanceCampaignDrafts`)은 **세 프로바이더 공용 추상화** 위에서 동작합니다.

```
UI (campaigns/new · campaigns/[id] · /ai)
  └─ convex/aiActions.ts ("use node" — 실제 fetch)
       └─ convex/aiKeys.ts (키 해석: 사용자 BYOK → 서버 env)
            └─ convex/lib/llm.ts (순수 TS: 요청 생성·응답 파싱 — 키 없이 테스트 가능)
```

## 프로바이더와 기본 모델

| 프로바이더 | 기본 모델 | 사용자 키 발급 | 서버 환경변수 |
|---|---|---|---|
| Anthropic (Claude) | `claude-opus-5` | platform.claude.com/settings/keys | `ANTHROPIC_API_KEY` |
| OpenAI (GPT) | `gpt-5.1` | platform.openai.com/api-keys | `OPENAI_API_KEY` |
| Google (Gemini) | `gemini-2.5-pro` | aistudio.google.com/apikey | `GEMINI_API_KEY` |

모델은 키 등록 시 프로바이더별로 오버라이드할 수 있습니다(`userAiKeys.model`).

## 키 해석 우선순위

1. **사용자 BYOK 키** (`userAiKeys` 테이블) — `/ai` 페이지에서 등록. 프로필의
   `preferredLlmProvider`(「기본으로 사용」)가 있으면 그 프로바이더 우선.
2. **서버 환경변수** — 운영자가 Convex 배포에 설정한 공용 키(폴백).
3. 둘 다 없으면 `mode: "skipped"` — 템플릿 초안을 그대로 쓰고, UI는 폼을 덮어쓰지 않으며
   `/ai`로 유도합니다.

선호 프로바이더가 불가하면 `anthropic → openai → gemini` 순서로 첫 가용 키를 씁니다
(`convex/lib/llm.ts:pickProvider`).

## 보안 원칙

- 키 원문은 **서버 함수에서만** 사용. 클라이언트에는 마스킹(`sk-ant…abcd`)만 반환
  (`aiKeys.status`).
- Gemini 키도 URL 쿼리가 아니라 **`x-goog-api-key` 헤더**로 전달(로그 유출 방지).
- 호출 성공/실패는 `lastStatus`/`lastError`로 키 행에 기록되어 `/ai`에서 진단 가능.

## 연결 테스트

`/ai` → 프로바이더 카드 → 「연결 테스트」는 `aiActions.testAiConnection`으로 초소형
호출을 보내 키·모델·네트워크를 한 번에 검증합니다.

## 새 프로바이더 추가 방법

1. `convex/lib/llm.ts` — `LlmProvider` 유니온, `LLM_PROVIDER_META`,
   `buildLlmRequest`/`parseLlmResponse`에 케이스 추가.
2. `convex/schema.ts` — `userAiKeys.provider` / `profiles.preferredLlmProvider` 유니온 확장.
3. `convex/aiKeys.ts` — `llmProviderValidator` 확장.
4. `convex/lib/llm.test.ts` — 요청/파싱 테스트 추가.

UI(`AiProviderKeysPanel`)는 `aiKeys.status`가 반환하는 목록을 그대로 렌더하므로 별도
수정이 필요 없습니다.
