# 공개 저장소로 게시하기 (contentscoin/crabpitch-skill)

이 폴더(`skills-public/`)는 **공개 저장소 [`contentscoin/crabpitch-skill`](https://github.com/contentscoin/crabpitch-skill)** 의 소스이며,
**이미 게시돼 있습니다** (PUBLISH.md 자신은 게시 대상에서 제외).
(과거 문서의 `crabpitch-skills` 표기는 폐기 — 실제 remote는 **단수** `crabpitch-skill`.)

> ⚠️ **Pro 스킬 팩(`skills-pro/`)은 유료 구독자 전용 — 절대 이 공개 repo에 올리지 않습니다.**

## 동기화 (권장)

모노레포에서 공개 팩을 갱신한 뒤:

```bash
# crabpitch 루트에서
pnpm sync:skills-public
```
(Claude 세션에서는 `add_repo`로 붙여 대신 푸시할 수 있습니다.)

스크립트가 `skills-public/` 내용을 형제 체크아웃된 `../crabpitch-skill` 로 복사합니다
(`PUBLISH.md` 는 공개 repo에 포함하지 않음).

수동 동기화:
```bash
# PUBLISH.md 제외하고 복사
cp -a skills-public/README.md skills-public/LICENSE ../crabpitch-skill/
cp -a skills-public/skills ../crabpitch-skill/
cp -a skills-public/docs ../crabpitch-skill/
```
또는 `pnpm sync:skills-public`

## 최초 게시 / 재푸시

공개 repo가 이미 있으면:
```bash
cd ../crabpitch-skill
git add -A
git commit -m "chore: sync skills-public from crabpitch"
git push origin main
```

새 repo를 만들 경우 이름은 반드시 **`crabpitch-skill`**(단수)로 맞춥니다.

## 구성
```
README.md            팩 소개 + 플랫폼별 사용법 + 두 원칙(PII·Gmail 언론홍보)
LICENSE              MIT
skills/
  press-release-writer/SKILL.md
  media-kit-builder/SKILL.md
  journalist-outreach/SKILL.md
  reply-handler/SKILL.md
docs/
  PRIVACY.md         기자 개인정보 보호 원칙
  GMAIL-SETUP.md     Gmail '언론홍보' 라벨 구조·워크플로우
```
