#!/usr/bin/env python3
"""보조금24 공공서비스 API(data.go.kr 15113968 / api.odcloud.kr gov24 v3) 스냅샷 수집기.

근거: docs/PLAN.md §2(API 규격) §3(아키텍처) §5(함정 대응 규칙) §6(수용기준) §7(파일 구성) §9(검증).

- 키는 환경변수 DATA_GO_KR_SERVICE_KEY 또는 ../.env 에서만 읽는다(scripts/check_key.py 와 동일 규칙).
  키 값은 어떤 경우에도 출력하지 않는다 — 오류 메시지는 mask() 로 항상 걸러서 찍는다.
- serviceList / supportConditions / serviceDetail 세 오퍼레이션을 perPage=500 으로 전량 수집한다.
- 순수 함수(normalize_record, resolve_region, classify_deadline, count_check, diff_snapshots,
  classify_auth_error, check_fields, build_cond)는 네트워크 없이 임포트·테스트 가능하다
  (tests/test_fetch.py 가 이것들을 직접 호출한다).
- `--from-fixture PATH` 로 네트워크 없이 픽스처(raw pages 모양: {"serviceList":[...], "supportConditions":[...],
  "serviceDetail":[...]})에서 public/data/*.json 을 만든다. 이때 meta.sample=true.
"""
import argparse
import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(REPO_ROOT, "data")
PUBLIC_DATA_DIR = os.path.join(REPO_ROOT, "public", "data")

BASE = "https://api.odcloud.kr/api/gov24/v3"
ENDPOINTS = {
    "serviceList": f"{BASE}/serviceList",
    "supportConditions": f"{BASE}/supportConditions",
    "serviceDetail": f"{BASE}/serviceDetail",
}
PER_PAGE = 500
DAILY_LIMIT = 10000
WARN_THRESHOLD = int(DAILY_LIMIT * 0.8)  # 8000, PLAN §5 S-HHONHV

# PLAN §2 serviceList 필드 21종
REQUIRED_LIST_FIELDS = [
    "서비스ID", "지원유형", "서비스명", "서비스목적요약", "지원대상", "선정기준",
    "지원내용", "신청방법", "신청기한", "상세조회URL", "소관기관코드", "소관기관명",
    "부서명", "조회수", "소관기관유형", "사용자구분", "서비스분야", "접수기관",
    "전화문의", "등록일시", "수정일시",
]

# 17개 시도 정식명·약칭 표 (PLAN §5.3). public/regions.js 는 이 canonical 이름(값)을 그대로 쓴다.
REGION_ALIASES = {
    "서울": ["서울특별시", "서울"],
    "부산": ["부산광역시", "부산"],
    "대구": ["대구광역시", "대구"],
    "인천": ["인천광역시", "인천"],
    "광주": ["광주광역시", "광주"],
    "대전": ["대전광역시", "대전"],
    "울산": ["울산광역시", "울산"],
    "세종": ["세종특별자치시", "세종"],
    "경기": ["경기도", "경기"],
    "강원": ["강원특별자치도", "강원도", "강원"],
    "충북": ["충청북도", "충북"],
    "충남": ["충청남도", "충남"],
    "전북": ["전북특별자치도", "전라북도", "전북"],
    "전남": ["전라남도", "전남"],
    "경북": ["경상북도", "경북"],
    "경남": ["경상남도", "경남"],
    "제주": ["제주특별자치도", "제주"],
}
NATIONAL_ORG_TYPES = {"중앙행정기관", "공공기관"}

# PLAN §8 "변경 감지 필드" 옵션 2
CHANGE_WATCH_FIELDS = ["신청기한", "지원내용", "지원대상", "구비서류", "서비스명", "수정일시"]


# ---------------------------------------------------------------------------
# 키 로딩 — scripts/check_key.py 와 동일 규칙(환경변수 → ../.env). 키는 절대 출력하지 않는다.
# ---------------------------------------------------------------------------

def load_key():
    env_path = os.path.join(REPO_ROOT, ".env")
    key = os.environ.get("DATA_GO_KR_SERVICE_KEY", "")
    if not key and os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("DATA_GO_KR_SERVICE_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
    return key


def mask(text, key):
    """오류 문자열에서 키의 원문·URL 인코딩 형태를 모두 "***" 로 치환한다."""
    if not text:
        return text
    if key:
        text = text.replace(key, "***")
        try:
            text = text.replace(urllib.parse.quote(key, safe=""), "***")
        except Exception:
            pass
    return text


# ---------------------------------------------------------------------------
# 순수 함수 — 네트워크 없이 테스트 가능 (tests/test_fetch.py 대상)
# ---------------------------------------------------------------------------

def classify_auth_error(code):
    """PLAN §5.4 원인 분류. code 는 API 오류 응답의 code 필드(정수 또는 숫자 문자열)."""
    try:
        code = int(code)
    except (TypeError, ValueError):
        return f"알 수 없는 오류 코드: {code}"
    mapping = {
        -401: "인증키 누락 — 요청에 serviceKey 파라미터가 없음",
        -4: "등록되지 않은 인증키 — 미승인/오타/data.go.kr 15113968 활용신청 미완료. 마이페이지에서 활용신청 상태 확인",
        -3: "폐기된 API 경로(v1) 응답 — v3(api.odcloud.kr/api/gov24/v3) 사용 확인",
    }
    return mapping.get(code, f"알 수 없는 오류 코드: {code}")


def check_fields(first_record, required=None):
    """첫 페이지 첫 레코드가 21개 필드를 다 갖는지 검사한다. (ok, missing_fields) 반환."""
    required = required if required is not None else REQUIRED_LIST_FIELDS
    if not isinstance(first_record, dict):
        return False, list(required)
    missing = [f for f in required if f not in first_record]
    return (len(missing) == 0), missing


def count_check(total_count, received, unique_ids):
    """PLAN §5.2. 수신==totalCount 이고 고유==수신 이면 PASS, 아니면 FAIL."""
    # API 가 totalCount 를 문자열로 줄 수도 있으므로 정수로 정규화한다 (REVIEW-1 #1).
    try:
        total_int = int(str(total_count).strip())
    except (TypeError, ValueError):
        total_int = None
    status = "PASS" if (total_int is not None and received == total_int and unique_ids == received) else "FAIL"
    return {
        "status": status,
        "totalCount": total_int if total_int is not None else total_count,
        "received": received,
        "unique_ids": unique_ids,
    }


def resolve_region(org_type, org_name, aliases=None):
    """PLAN §5.3. 중앙행정기관/공공기관 → 전국. 그 외 소관기관명에서 시도명을 접두/포함 매칭.
    못 찾으면 None(미확정)."""
    aliases = aliases if aliases is not None else REGION_ALIASES
    if org_type in NATIONAL_ORG_TYPES:
        return "전국"
    name = org_name or ""
    if not name:
        return None
    # 긴 별칭을 먼저 검사해 짧은 이름의 우연한 부분일치를 피한다.
    for canon, alias_list in aliases.items():
        for alias in sorted(alias_list, key=len, reverse=True):
            if name.startswith(alias) or alias in name:
                return canon
    return None


_DATE_PATTERNS = [
    re.compile(r"(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})"),
    re.compile(r"(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일"),
]
_ALWAYS_WORDS = ("상시", "수시", "연중")


def classify_deadline(text):
    """PLAN §5(요구사항 5). (kind, iso_date_or_None) 반환. kind ∈ {"상시","기간","불명"}."""
    t = (text or "").strip()
    if not t or t in ("-", "0") or any(w in t for w in _ALWAYS_WORDS):
        return "상시", None
    best = None
    for pat in _DATE_PATTERNS:
        for m in pat.finditer(t):
            y, mo, d = m.groups()
            try:
                dt = datetime.date(int(y), int(mo), int(d))
            except ValueError:
                continue
            best = dt  # 범위 표기(YYYY~YYYY)는 뒤쪽(종료일)을 마감일로 본다
    if best is not None:
        return "기간", best.isoformat()
    return "불명", None


def _truthy_cond(v):
    if isinstance(v, str):
        return v.strip() not in ("", "0", "N", "n", "false", "False")
    return bool(v)


def build_cond(raw_cond):
    """supportConditions 원본 레코드에서 참(truthy)인 JA* 키만 남긴다.
    JA0110/JA0111(연령 시작/종료)은 값이 존재하면 정수로 보존한다."""
    cond = {}
    for k, v in (raw_cond or {}).items():
        if k == "서비스ID":
            continue
        if k in ("JA0110", "JA0111"):
            if v is not None and v != "":
                try:
                    cond[k] = int(v)
                except (TypeError, ValueError):
                    pass
            continue
        if _truthy_cond(v):
            cond[k] = v
    return cond


def normalize_record(list_record, detail_by_id=None, cond_by_id=None):
    """serviceList 레코드 + serviceDetail/supportConditions 조인 → 화면용 압축 레코드."""
    detail_by_id = detail_by_id or {}
    cond_by_id = cond_by_id or {}
    sid = list_record.get("서비스ID")
    detail = detail_by_id.get(sid) or {}
    raw_cond = cond_by_id.get(sid) or {}

    out = dict(list_record)  # 21개 필드 그대로 보존
    out["구비서류"] = detail.get("구비서류", "")
    out["온라인신청사이트URL"] = detail.get("온라인신청사이트URL", "")
    out["공무원확인구비서류"] = detail.get("공무원확인구비서류", "")
    out["본인확인필요구비서류"] = detail.get("본인확인필요구비서류", "")

    out["cond"] = build_cond(raw_cond)

    user_type_raw = list_record.get("사용자구분") or ""
    out["user_types"] = [s.strip() for s in user_type_raw.split("||") if s.strip()]

    out["region"] = resolve_region(list_record.get("소관기관유형"), list_record.get("소관기관명"))

    kind, iso_date = classify_deadline(list_record.get("신청기한"))
    out["deadline_kind"] = kind
    if iso_date:
        out["deadline_date"] = iso_date

    return out


def diff_snapshots(prev, new, watch_fields=None):
    """서비스ID 기준 신규/변경/소멸. prev/new 는 {"services":[...]} 이거나 서비스 리스트 자체."""
    watch_fields = watch_fields if watch_fields is not None else CHANGE_WATCH_FIELDS

    def as_list(x):
        if x is None:
            return []
        if isinstance(x, dict):
            return x.get("services", [])
        return x

    prev_list = as_list(prev)
    new_list = as_list(new)
    prev_by_id = {s.get("서비스ID"): s for s in prev_list}
    new_by_id = {s.get("서비스ID"): s for s in new_list}

    new_ids = [sid for sid in new_by_id if sid not in prev_by_id]
    removed_ids = [sid for sid in prev_by_id if sid not in new_by_id]

    result_new = [{"id": sid, "name": new_by_id[sid].get("서비스명")} for sid in new_ids]
    result_removed = [{"id": sid, "name": prev_by_id[sid].get("서비스명")} for sid in removed_ids]

    changed = []
    for sid, new_rec in new_by_id.items():
        old_rec = prev_by_id.get(sid)
        if old_rec is None:
            continue
        field_changes = []
        for f in watch_fields:
            before = old_rec.get(f)
            after = new_rec.get(f)
            # None·빈 문자열·공백만 있는 값은 같은 것으로 본다 (REVIEW-1 #2, 노이즈 방지).
            norm_before = before.strip() if isinstance(before, str) else before
            norm_after = after.strip() if isinstance(after, str) else after
            if (norm_before or None) == (norm_after or None):
                continue
            if before != after:
                field_changes.append({"field": f, "before": before, "after": after})
        if field_changes:
            changed.append({"id": sid, "name": new_rec.get("서비스명"), "fields": field_changes})

    return {"new": result_new, "removed": result_removed, "changed": changed}


# ---------------------------------------------------------------------------
# 네트워크 (urllib stdlib 전용, pip 없음)
# ---------------------------------------------------------------------------

class CallCounter:
    """호출 수를 data/.calls_YYYY-MM-DD 에 누적 기록한다(gitignore 대상 가능)."""

    def __init__(self, path):
        self.path = path
        self.count = self._load()
        self.warned = False

    def _load(self):
        if os.path.exists(self.path):
            try:
                with open(self.path, encoding="utf-8") as f:
                    return int(f.read().strip() or "0")
            except (ValueError, OSError):
                return 0
        return 0

    def increment(self):
        self.count += 1
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as f:
            f.write(str(self.count))
        if self.count >= WARN_THRESHOLD and not self.warned:
            self.warned = True
            print(
                f"경고: 오늘 API 호출 {self.count}건 — 일일 한도 {DAILY_LIMIT}건의 80% 이상 사용",
                file=sys.stderr,
            )
        return self.count


def build_url(endpoint, key, page, per_page=PER_PAGE):
    q = urllib.parse.urlencode({"page": page, "perPage": per_page, "returnType": "JSON"})
    return f"{endpoint}?{q}&serviceKey={urllib.parse.quote(key, safe='')}"


def http_get_json(url, counter, timeout=20, retries=3):
    """단일 호출. 5xx·타임아웃·네트워크 오류는 지수 백오프로 최대 retries 회 시도한다."""
    last_err = None
    for attempt in range(retries):
        counter.increment()
        try:
            with urllib.request.urlopen(url, timeout=timeout) as r:
                body = r.read().decode("utf-8", "replace")
                try:
                    return json.loads(body), r.status
                except ValueError:
                    return {"code": None, "msg": body[:200]}, r.status
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            if e.code >= 500 and attempt < retries - 1:
                last_err = e
                time.sleep(2 ** attempt)
                continue
            try:
                parsed = json.loads(body)
            except ValueError:
                parsed = {"code": e.code, "msg": body[:200]}
            return parsed, e.code
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            raise
    if last_err:
        raise last_err
    raise RuntimeError("http_get_json: 재시도 소진")


def fetch_all_pages(endpoint, key, counter, per_page=PER_PAGE, allow_refetch=True):
    """전 페이지 순회. 성공 시 (pages, None, status), 오류 시 (None, error_body, status).
    totalCount 가 도중에 바뀌면 1회 재수집한다(PLAN §5.2)."""
    pages = []
    page = 1
    total_count = None
    status = None
    while True:
        url = build_url(endpoint, key, page, per_page)
        data, status = http_get_json(url, counter)
        code = data.get("code")
        if status != 200 or (code is not None and code < 0):
            return None, data, status
        pages.append(data)
        this_total = data.get("totalCount", 0)
        if total_count is None:
            total_count = this_total
        elif this_total != total_count:
            if allow_refetch:
                return fetch_all_pages(endpoint, key, counter, per_page, allow_refetch=False)
            total_count = this_total
        received_so_far = sum(len(p.get("data", [])) for p in pages)
        if received_so_far >= total_count or not data.get("data"):
            break
        page += 1
    return pages, None, status


# ---------------------------------------------------------------------------
# 메인 흐름
# ---------------------------------------------------------------------------

def pages_to_records(pages):
    records = []
    for p in pages or []:
        records.extend(p.get("data", []))
    return records


def build_lookup_by_id(records):
    return {r.get("서비스ID"): r for r in records}


def run(from_fixture=None):
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(PUBLIC_DATA_DIR, exist_ok=True)
    sample = from_fixture is not None
    warnings = []
    calls_used = 0

    if from_fixture:
        with open(from_fixture, encoding="utf-8") as f:
            fixture = json.load(f)
        list_pages = fixture.get("serviceList", [])
        cond_pages = fixture.get("supportConditions", [])
        detail_pages = fixture.get("serviceDetail", [])
    else:
        key = load_key()
        if not key or key.startswith("여기에"):
            print("FAIL: DATA_GO_KR_SERVICE_KEY 가 없다 (.env 또는 환경변수). .env.example 을 .env 로 복사해 값을 채운다.")
            return 1

        today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
        counter = CallCounter(os.path.join(DATA_DIR, f".calls_{today}"))

        fetch_targets = [
            ("serviceList", ENDPOINTS["serviceList"]),
            ("supportConditions", ENDPOINTS["supportConditions"]),
            ("serviceDetail", ENDPOINTS["serviceDetail"]),
        ]
        fetched = {}
        for name, endpoint in fetch_targets:
            pages, err, status = fetch_all_pages(endpoint, key, counter)
            if err is not None:
                cause = classify_auth_error(err.get("code"))
                msg = (
                    f"FAIL({name}): HTTP {status} code={err.get('code')} — {cause} — "
                    f"msg={err.get('msg') or err.get('message')}"
                )
                print(mask(msg, key))
                return 1
            fetched[name] = pages

        list_pages = fetched["serviceList"]
        cond_pages = fetched["supportConditions"]
        detail_pages = fetched["serviceDetail"]
        calls_used = counter.count
        if counter.warned:
            warnings.append(f"일일 API 호출 {calls_used}건 — 한도 {DAILY_LIMIT}건의 80% 이상 사용")

    if not list_pages or not list_pages[0].get("data"):
        print("FAIL: serviceList 응답에 데이터가 없다.")
        return 1

    ok, missing = check_fields(list_pages[0]["data"][0])
    if not ok:
        print(f"FAIL: serviceList 첫 레코드에 누락된 필드가 있다: {missing}")
        return 1

    list_records = pages_to_records(list_pages)
    total_count = list_pages[0].get("totalCount", len(list_records))
    received = len(list_records)
    unique_ids = len({r.get("서비스ID") for r in list_records})
    cc = count_check(total_count, received, unique_ids)

    fetched_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = {
        "fetched_at": fetched_at,
        "source": "data.go.kr 15113968 / api.odcloud.kr gov24 v3",
        "total_count": total_count,
        "received": received,
        "unique_ids": unique_ids,
        "count_check": cc["status"],
        "region_unresolved_ratio": None,
        "calls_used": calls_used,
        "sample": sample,
        "field_check": {"ok": ok, "missing": missing},
        "warnings": warnings,
    }

    if cc["status"] == "FAIL":
        meta["count_check_detail"] = cc
        with open(os.path.join(PUBLIC_DATA_DIR, "meta.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        print(f"FAIL: count_check — totalCount={total_count} received={received} unique_ids={unique_ids}")
        print("snapshot.json 은 갱신하지 않았다(직전 스냅샷 유지).")
        return 1

    detail_records = pages_to_records(detail_pages)
    cond_records = pages_to_records(cond_pages)
    detail_by_id = build_lookup_by_id(detail_records)
    cond_by_id = build_lookup_by_id(cond_records)

    services = [normalize_record(r, detail_by_id, cond_by_id) for r in list_records]

    unresolved = sum(1 for s in services if s.get("region") is None)
    region_unresolved_ratio = round(unresolved / len(services), 4) if services else 0.0
    meta["region_unresolved_ratio"] = region_unresolved_ratio
    if region_unresolved_ratio > 0.2:
        warnings.append(
            f"지역 미확정 비율 {region_unresolved_ratio:.1%} — 20% 초과, PLAN §5.3 T1-b(소관기관코드 보강) 검토 필요"
        )
        meta["warnings"] = warnings

    snapshot_path = os.path.join(PUBLIC_DATA_DIR, "snapshot.json")
    prev_snapshot = None
    if os.path.exists(snapshot_path):
        with open(snapshot_path, encoding="utf-8") as f:
            prev_snapshot = json.load(f)
        # 덮어쓰기 전에 직전 스냅샷을 보관한다.
        with open(os.path.join(DATA_DIR, "snapshot.prev.json"), "w", encoding="utf-8") as f:
            json.dump(prev_snapshot, f, ensure_ascii=False, indent=2)

    snapshot = {"meta": meta, "services": services}

    diff = diff_snapshots(prev_snapshot, snapshot)
    changes_out = {
        "compared_at": fetched_at,
        "prev_fetched_at": (prev_snapshot or {}).get("meta", {}).get("fetched_at"),
        "new": diff["new"],
        "removed": diff["removed"],
        "changed": diff["changed"],
    }

    with open(snapshot_path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)
    with open(os.path.join(PUBLIC_DATA_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    with open(os.path.join(PUBLIC_DATA_DIR, "changes.json"), "w", encoding="utf-8") as f:
        json.dump(changes_out, f, ensure_ascii=False, indent=2)

    print(
        f"OK: services={len(services)} count_check={cc['status']} "
        f"region_unresolved_ratio={region_unresolved_ratio} calls_used={calls_used} sample={sample}"
    )
    for w in warnings:
        print(f"경고: {w}")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--from-fixture",
        metavar="PATH",
        help="네트워크 없이 이 픽스처 JSON(raw pages 모양)으로 public/data/*.json 을 만든다. meta.sample=true.",
    )
    args = parser.parse_args()
    return run(from_fixture=args.from_fixture)


if __name__ == "__main__":
    sys.exit(main())
