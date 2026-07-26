# 공개 저장소로 게시하기 (contentscoin/crabpitch-skill)

이 폴더(`skills-public/`)는 공개 저장소 **[`contentscoin/crabpitch-skill`](https://github.com/contentscoin/crabpitch-skill)** 로
**이미 게시돼 있습니다** (PUBLISH.md 자신은 게시 대상에서 제외). 이 폴더를 수정하면 아래 절차로 공개 repo에 동기화하세요.

## 동기화 절차
```bash
git clone https://github.com/contentscoin/crabpitch-skill.git
rsync -a --delete --exclude PUBLISH.md --exclude .git skills-public/ crabpitch-skill/
cd crabpitch-skill
git add -A && git commit -m "sync: skills-public 변경 반영" && git push origin main
```
(Claude 세션에서는 `add_repo`로 붙여 대신 푸시할 수 있습니다.)

> ⚠️ **Pro 스킬 팩(`skills-pro/`)은 유료 구독자 전용 — 절대 이 공개 repo에 올리지 않습니다.**

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
