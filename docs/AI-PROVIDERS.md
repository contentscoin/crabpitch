# AI 프로바이더 연동 — 유저 자신의 LLM만 사용 (BYO)

크랩피치는 **자체 LLM·공용 API 키를 제공하지 않습니다.** 유저가 자신의 LLM을 쓰는
경로는 두 가지입니다:

1. **MCP·스킬 (기본·권장)** — 유저가 이미 구독 OAuth로 로그인돼 있는 본인의
   ChatGPT·Claude·Gemini 채팅/CLI에 크랩피치를 연결합니다. LLM 실행은 유저 쪽에서
   일어나고, 크랩피치는 기자 매칭·메일 템플릿·회신 분류 **도구**를 제공합니다
   (`docs/MCP-SETUP.md`). 참고: 3사 모두 서드파티 SaaS가 유저의 구독 계정을 OAuth로
   위임받아 서버에서 대신 호출하는 공식 경로는 제공하지 않습니다 — 그래서 이 방향이
   "OAuth로 유저 자신의 LLM을 쓰는" 유일한 구조입니다.
2. **본인 API 키(BYOK, 선택·고급)** — 웹 화면 안에서 「AI로 다듬기」를 쓰고 싶은
   유저만 본인 API 키를 등록합니다. 이 문서의 나머지는 이 경로의 구현을 다룹니다.

크랩피치의 웹 내 AI 실행(보도자료 다듬기 `polishPressRelease`, 메일 개인화
`enhanceCampaignDrafts`)은 **세 프로바이더 공용 추상화** 위에서 동작합니다.

```
UI (campaigns/new · campaigns/[id] · /ai)
  └─ convex/aiActions.ts ("use node" — 실제 fetch)
       └─ convex/aiKeys.ts (키 해석: 사용자 BYOK 전용)
            └─ convex/lib/llm.ts (순수 TS: 요청 생성·응답 파싱 — 키 없이 테스트 가능)
```

## 프로바이더와 기본 모델

| 프로바이더 | 기본 모델 | 사용자 키 발급 |
|---|---|---|
| Anthropic (Claude) | `claude-opus-5` | platform.claude.com/settings/keys |
| OpenAI (GPT) | `gpt-5.1` | platform.openai.com/api-keys |
| Google (Gemini) | `gemini-2.5-pro` | aistudio.google.com/apikey |

모델은 키 등록 시 프로바이더별로 오버라이드할 수 있습니다(`userAiKeys.model`).

## 키 해석 규칙 (BYOK 전용)

1. **사용자 본인 키만** (`userAiKeys` 테이블) — `/ai` 페이지에서 등록. 프로필의
   `preferredLlmProvider`(「기본으로 사용」)가 있으면 그 프로바이더 우선.
   서버 환경변수 폴백은 **없습니다** — SaaS 공용 LLM 키를 두지 않는 것이 제품 원칙.
2. 등록된 키가 없으면 `mode: "skipped"` — 템플릿 초안을 그대로 쓰고, UI는 폼을
   덮어쓰지 않으며 `/ai`로 유도합니다.

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
