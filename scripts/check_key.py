#!/usr/bin/env python3
"""인증키가 보조금24 공공서비스 API(data.go.kr 15113968)에 유효한지 검사한다.

- 키는 .env 의 DATA_GO_KR_SERVICE_KEY 에서만 읽는다.
- 키 값은 어떤 경우에도 출력하지 않는다. 상태코드·오류코드·판정만 출력한다.
- 인코딩/디코딩 키 혼용, 헤더/쿼리 방식 차이를 한꺼번에 시험해 "어느 방식이 열리는지"를 알려준다.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://api.odcloud.kr/api/gov24/v3/serviceList"

# 오류 코드별 원인·조치 (2026-09-02 실측 코드표)
ADVICE = {
    -401: "키 누락 — .env 의 DATA_GO_KR_SERVICE_KEY 값이 비어 있거나 파라미터가 빠졌다. 값을 채운다.",
    -4: "미등록 키 — 이 키의 계정에 데이터셋 15113968 활용신청이 없거나 오타다. data.go.kr 마이페이지 > 활용신청 현황에 15113968 이 있는지 확인하고, 없으면 활용신청(자동승인) 후 다시 실행한다. 방금 신청했다면 몇 분 뒤 재시도.",
    -3: "등록되지 않은 서비스 — 옛 v1 주소를 부르고 있다. 이 스크립트는 v3 를 쓰므로 여기서 나오면 API 측 변경 가능성이 있다. data.go.kr 공지를 확인한다.",
}


def load_key():
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    key = os.environ.get("DATA_GO_KR_SERVICE_KEY", "")
    if not key and os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("DATA_GO_KR_SERVICE_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
    return key


def attempt(label, url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read().decode("utf-8", "replace")
            status = r.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        status = e.code
    except Exception as e:  # 네트워크 오류
        print(f"[{label}] NETWORK ERROR: {type(e).__name__}")
        return None
    summary = {}
    try:
        j = json.loads(body)
        for k in ("totalCount", "currentCount", "page", "perPage", "matchCount", "code", "msg", "message"):
            if k in j:
                summary[k] = j[k]
        if isinstance(j.get("data"), list):
            summary["data_len"] = len(j["data"])
            if j["data"]:
                summary["first_record_fields"] = sorted(j["data"][0].keys())
    except Exception:
        summary["raw_head"] = body[:120].replace("\n", " ")
    print(f"[{label}] HTTP {status} {json.dumps(summary, ensure_ascii=False)}")
    return status, summary


def main():
    key = load_key()
    if not key or key.startswith("여기에"):
        print("FAIL: .env 에 DATA_GO_KR_SERVICE_KEY 가 없다. .env.example 을 복사해 값을 채운 뒤 다시 실행.")
        return 2
    print(f"키 길이: {len(key)}자, '%' 포함 여부: {'%' in key} (포함되면 인코딩 키일 가능성)")
    q = "page=1&perPage=1&returnType=JSON"
    results = {}
    # 1) 디코딩 키를 그대로 쿼리에 (urlencode 가 알아서 인코딩)
    results["query-decoded"] = attempt(
        "query-decoded", f"{BASE}?{q}&serviceKey={urllib.parse.quote(key, safe='')}"
    )
    # 2) 인코딩 키를 그대로 쿼리에 (이미 인코딩된 값이라 그대로 붙임)
    results["query-as-is"] = attempt("query-as-is", f"{BASE}?{q}&serviceKey={key}")
    # 3) Authorization 헤더 방식
    results["header-infuser"] = attempt(
        "header-infuser", f"{BASE}?{q}", headers={"Authorization": f"Infuser {key}"}
    )
    ok = [k for k, v in results.items() if v and v[0] == 200 and v[1].get("data_len", 0) >= 1]
    if ok:
        print(f"PASS: 유효한 키. 열리는 방식 = {ok}")
        return 0
    codes = {v[1].get("code") for v in results.values() if v}
    print("FAIL: 어떤 방식으로도 200+데이터를 받지 못했다.")
    for code in sorted(c for c in codes if c is not None):
        print(f"원인: {ADVICE.get(code, f'알 수 없는 오류 코드 {code} — 응답 msg 를 보고 data.go.kr 문의')}")
    if not codes:
        print("원인: 응답 본문에 오류 코드가 없다. 네트워크·프록시·DNS 를 먼저 확인한다.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
