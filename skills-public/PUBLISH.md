# 공개 저장소로 게시하기 (contentscoin/crabpitch-skills)

이 폴더(`skills-public/`)는 그대로 **공개 저장소 `contentscoin/crabpitch-skills`** 가 되도록 준비돼 있습니다.
(세션 통합 토큰은 새 repo 생성 권한이 없어 자동 생성이 안 됩니다. 아래 중 하나로 게시하세요.)

## 방법 A — GitHub에서 빈 repo 만들고 푸시 (권장)
1. github.com → **New repository** → 이름 `crabpitch-skills`, **Public**, README/gitignore/license **추가 안 함**.
2. 로컬에서 이 폴더만 새 저장소로 푸시:
```bash
cd skills-public
git init -b main
git add -A
git commit -m "feat: 크랩피치 공개 스킬 팩 (보도문·미디어킷·기자배포·회신 + Gmail 언론홍보 + PII 보호)"
git remote add origin https://github.com/contentscoin/crabpitch-skills.git
git push -u origin main
```

## 방법 B — 빈 repo만 만들어 두고 알려주기
github.com에서 위처럼 빈 public repo만 만들고 알려주시면, 세션에서 `add_repo`로 붙여 파일을 대신 푸시해 드립니다.

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
