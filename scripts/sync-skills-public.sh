#!/usr/bin/env bash
# skills-public/ → 형제 디렉터리 crabpitch-skill 동기화
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/skills-public"
DEST="${CRABPITCH_SKILL_DIR:-$ROOT/../crabpitch-skill}"

if [[ ! -d "$SRC" ]]; then
  echo "missing $SRC" >&2
  exit 1
fi
if [[ ! -d "$DEST" ]]; then
  echo "대상 없음: $DEST" >&2
  echo "CRABPITCH_SKILL_DIR 로 공개 스킬 repo 경로를 지정하거나, ../crabpitch-skill 을 체크아웃하세요." >&2
  exit 1
fi

# rsync 없이도 동작하도록 find+cp
# PUBLISH.md 는 공개 repo에 넣지 않음
while IFS= read -r -d '' file; do
  rel="${file#"$SRC"/}"
  if [[ "$rel" == "PUBLISH.md" ]]; then
    continue
  fi
  mkdir -p "$DEST/$(dirname "$rel")"
  cp -a "$file" "$DEST/$rel"
done < <(find "$SRC" -type f -print0)

# 소스에 없는 스킬/문서는 유지(삭제하지 않음) — 안전 기본값
echo "synced: $SRC → $DEST"
