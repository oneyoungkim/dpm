#!/bin/zsh
# 보조 수집: 깃허브 서버의 접속을 막는 커뮤니티(에펨코리아·개드립)의 인기글 목록만
# 이 컴퓨터에서 읽어, 저장소 릴리스 `local-feed` 의 첨부 파일(trends-local.json)로 올린다.
# 깃허브의 순위 집계(.github/workflows/trends.yml)가 그 파일을 받아 직접 못 읽은 곳을 메운다.
#
# 한국에 있는 컴퓨터에서 2시간마다 돌린다(집계가 KST 홀수 시 정각이라 짝수 시 30분쯤이 알맞다).
# 필요한 것: 이 저장소 복제본(npm ci 끝난 것), gh 로그인(저장소에 쓸 수 있는 계정).
# 저장소 파일은 읽기만 하고 아무것도 고치지 않는다. 기록은 ~/Library/Logs/gak-trends-feed.log.
#
#   손으로 돌리기:  zsh scripts/trends/local-feed.sh
#   올리지 않고 보기: zsh scripts/trends/local-feed.sh --dry

set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO="oneyoungkim/dpm"
TAG="local-feed"
ASSET="trends-local.json"
SOURCES="fmkorea,dogdrip"
REPO_DIR="${0:A:h:h:h}"
LOG="$HOME/Library/Logs/gak-trends-feed.log"
DRY=0
[[ "${1:-}" == "--dry" ]] && DRY=1

# 터미널에서 손으로 돌릴 때는 화면에, launchd 가 부를 때는 기록 파일에 쓴다
if [[ ! -t 1 ]]; then
  mkdir -p "${LOG:h}"
  # 기록이 500KB 를 넘으면 하나만 남기고 돌린다
  if [[ -f "$LOG" ]] && (( $(stat -f%z "$LOG") > 512000 )); then mv -f "$LOG" "$LOG.1"; fi
  exec >>"$LOG" 2>&1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 보조 수집 시작"

cd "$REPO_DIR" || { echo "  저장소 폴더로 못 들어감 → 끝"; exit 0; }
if [[ ! -x node_modules/.bin/tsx ]]; then
  echo "  node_modules 가 없음(npm ci 가 도는 중일 수 있음) → 이번은 건너뜀"
  exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
OUT="$WORK/$ASSET"

node_modules/.bin/tsx scripts/trends/run.ts --only "$SOURCES" --feed-out "$OUT"
code=$?
if (( code != 0 )) || [[ ! -s "$OUT" ]]; then
  echo "  수집 실패(종료 코드 $code) → 올리지 않음. 지난 수집본은 3시간이 지나면 집계가 알아서 버린다"
  exit 0
fi

if (( DRY )); then
  echo "  (dry) 올리지 않음: $(wc -c <"$OUT" | tr -d ' ')바이트"
  exit 0
fi

if gh release upload "$TAG" "$OUT" --repo "$REPO" --clobber; then
  echo "  올림: $(wc -c <"$OUT" | tr -d ' ')바이트"
else
  echo "  올리기 실패(gh 로그인이나 릴리스 $TAG 를 확인)"
fi
