#!/usr/bin/env bash
# PLAN §9.3 — 배포물(public/)에 인증키·API 호출 흔적이 없는지 검사한다.
# 키 값은 어떤 경우에도 이 스크립트의 출력에 나타나지 않는다.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC_DIR="$ROOT/public"
ENV_FILE="$ROOT/.env"

FAIL=0

if [ ! -d "$PUBLIC_DIR" ]; then
  echo "FAIL: public/ 디렉터리가 없다."
  exit 1
fi

# 1) .env 의 키 원문·URL 인코딩 형태가 public/ 안에 있는지 검사한다.
if [ -f "$ENV_FILE" ]; then
  KEY="$(python3 - "$ENV_FILE" <<'PY'
import sys
path = sys.argv[1]
key = ""
with open(path, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line.startswith("DATA_GO_KR_SERVICE_KEY="):
            key = line.split("=", 1)[1].strip().strip('"').strip("'")
print(key)
PY
)"
  if [ -z "$KEY" ] || [[ "$KEY" == 여기에* ]]; then
    echo "안내: .env 에 키 값이 채워지지 않아 1단계(원문 키 검사)는 건너뛴다."
  else
    ENC_KEY="$(python3 - "$KEY" <<'PY'
import sys
import urllib.parse
print(urllib.parse.quote(sys.argv[1], safe=""))
PY
)"
    RAW_HITS="$(grep -rlF -- "$KEY" "$PUBLIC_DIR" 2>/dev/null | wc -l | tr -d ' ')"
    ENC_HITS="$(grep -rlF -- "$ENC_KEY" "$PUBLIC_DIR" 2>/dev/null | wc -l | tr -d ' ')"
    if [ "$RAW_HITS" != "0" ] || [ "$ENC_HITS" != "0" ]; then
      echo "FAIL: public/ 에서 인증키(원문 또는 URL 인코딩 형태)가 발견됐다."
      FAIL=1
    fi
  fi
else
  echo "안내: .env 가 없어 1단계(원문 키 검사)는 건너뛴다."
fi

# 2) 브라우저(앱 코드)가 API를 직접 호출하는 코드가 없는지 검사한다.
#    public/data/*.json 은 검사 대상에서 제외한다 — fetch_snapshot.py 가 만드는 meta.json/snapshot.json 은
#    PLAN §6 AC-7(출처 표시) 요구에 따라 meta.source 필드에 "api.odcloud.kr gov24 v3" 라는 출처 문구를
#    합법적으로 담는다(호출 코드가 아니라 데이터 산출물 안의 텍스트 인용). 이 검사의 목적은
#    "브라우저 코드가 API를 부르지 않음"의 증거이므로 앱 코드(HTML/JS/CSS 등)만 본다.
CODE_FILES="$(find "$PUBLIC_DIR" -type f -not -path "$PUBLIC_DIR/data/*" 2>/dev/null)"
ODCLOUD_HITS=0
SERVICEKEY_HITS=0
if [ -n "$CODE_FILES" ]; then
  ODCLOUD_HITS="$(printf '%s\n' "$CODE_FILES" | xargs grep -l "odcloud.kr" 2>/dev/null | wc -l | tr -d ' ')"
  SERVICEKEY_HITS="$(printf '%s\n' "$CODE_FILES" | xargs grep -l "serviceKey" 2>/dev/null | wc -l | tr -d ' ')"
fi

if [ "$ODCLOUD_HITS" != "0" ]; then
  echo "FAIL: public/ 앱 코드(data/ 제외)에 odcloud.kr 문자열이 발견됐다 (${ODCLOUD_HITS}개 파일)."
  FAIL=1
fi
if [ "$SERVICEKEY_HITS" != "0" ]; then
  echo "FAIL: public/ 앱 코드(data/ 제외)에 serviceKey 문자열이 발견됐다 (${SERVICEKEY_HITS}개 파일)."
  FAIL=1
fi

if [ "$FAIL" = "0" ]; then
  echo "OK"
  exit 0
fi
exit 1
