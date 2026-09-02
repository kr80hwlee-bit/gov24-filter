#!/usr/bin/env python3
"""scripts/fetch_snapshot.py 의 순수 함수 단위 테스트. 네트워크를 쓰지 않는다.

실행: python3 -m unittest discover -s tests -p "test_*.py" -v
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts"))

import fetch_snapshot as fs  # noqa: E402


class TestNormalizeUserTypes(unittest.TestCase):
    def test_single_user_type(self):
        rec = {"서비스ID": "1", "사용자구분": "개인"}
        out = fs.normalize_record(rec)
        self.assertEqual(out["user_types"], ["개인"])

    def test_combo_user_type_split_and_trim(self):
        rec = {"서비스ID": "2", "사용자구분": "개인 || 가구"}
        out = fs.normalize_record(rec)
        self.assertEqual(out["user_types"], ["개인", "가구"])

    def test_empty_user_type(self):
        rec = {"서비스ID": "3", "사용자구분": ""}
        out = fs.normalize_record(rec)
        self.assertEqual(out["user_types"], [])


class TestResolveRegion(unittest.TestCase):
    def test_central_agency_is_nationwide(self):
        self.assertEqual(fs.resolve_region("중앙행정기관", "고용노동부"), "전국")

    def test_public_agency_is_nationwide(self):
        self.assertEqual(fs.resolve_region("공공기관", "한국전력공사"), "전국")

    def test_sido_matched_by_full_name(self):
        self.assertEqual(fs.resolve_region("광역시도", "경상남도"), "경남")

    def test_sigungu_matched_by_prefix(self):
        self.assertEqual(fs.resolve_region("시군구", "경기도 용인시"), "경기")

    def test_unmappable_org_name_is_none(self):
        self.assertIsNone(fs.resolve_region("지방출자_출연기관", "재단법인동대문문화재단"))

    def test_empty_org_name_is_none(self):
        self.assertIsNone(fs.resolve_region("시군구", ""))


class TestClassifyDeadline(unittest.TestCase):
    def test_sangsi_keyword(self):
        kind, date = fs.classify_deadline("상시신청")
        self.assertEqual(kind, "상시")
        self.assertIsNone(date)

    def test_yeonjung_keyword(self):
        kind, _ = fs.classify_deadline("연중 상시신청")
        self.assertEqual(kind, "상시")

    def test_empty_is_sangsi(self):
        kind, _ = fs.classify_deadline("")
        self.assertEqual(kind, "상시")
        kind2, _ = fs.classify_deadline("-")
        self.assertEqual(kind2, "상시")

    def test_dashed_date_extracted(self):
        kind, date = fs.classify_deadline("2026-05-04")
        self.assertEqual(kind, "기간")
        self.assertEqual(date, "2026-05-04")

    def test_dotted_date_extracted(self):
        kind, date = fs.classify_deadline("2026.03.09~2026.03.31")
        self.assertEqual(kind, "기간")
        self.assertEqual(date, "2026-03-31")  # 범위는 종료일을 마감일로 본다

    def test_korean_date_extracted(self):
        kind, date = fs.classify_deadline("2026년 3월 3일까지")
        self.assertEqual(kind, "기간")
        self.assertEqual(date, "2026-03-03")

    def test_weird_text_is_unknown(self):
        kind, date = fs.classify_deadline("자세한 날짜는 읍면동 주민센터에 따라 다름")
        self.assertEqual(kind, "불명")
        self.assertIsNone(date)


class TestCountCheck(unittest.TestCase):
    def test_pass_when_all_equal(self):
        result = fs.count_check(total_count=100, received=100, unique_ids=100)
        self.assertEqual(result["status"], "PASS")

    def test_fail_when_received_mismatches_total(self):
        result = fs.count_check(total_count=105, received=100, unique_ids=100)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["totalCount"], 105)
        self.assertEqual(result["received"], 100)

    def test_fail_when_duplicates_present(self):
        # received matches totalCount but unique ids are fewer (duplicates)
        result = fs.count_check(total_count=100, received=100, unique_ids=98)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["unique_ids"], 98)


class TestDiffSnapshots(unittest.TestCase):
    def setUp(self):
        self.prev = {
            "services": [
                {"서비스ID": "A", "서비스명": "가나다 지원금", "신청기한": "상시신청", "수정일시": "20250101"},
                {"서비스ID": "B", "서비스명": "소멸될 사업", "신청기한": "상시신청", "수정일시": "20250101"},
            ]
        }

    def test_new_service_detected(self):
        new_snapshot = {
            "services": self.prev["services"] + [
                {"서비스ID": "C", "서비스명": "신규 사업", "신청기한": "상시신청", "수정일시": "20260101"},
            ]
        }
        diff = fs.diff_snapshots(self.prev, new_snapshot)
        self.assertEqual([n["id"] for n in diff["new"]], ["C"])
        self.assertEqual(diff["removed"], [])

    def test_removed_service_detected(self):
        new_snapshot = {"services": [self.prev["services"][0]]}
        diff = fs.diff_snapshots(self.prev, new_snapshot)
        self.assertEqual([r["id"] for r in diff["removed"]], ["B"])
        self.assertEqual(diff["new"], [])

    def test_changed_field_detected(self):
        changed_record = dict(self.prev["services"][0])
        changed_record["신청기한"] = "2026-05-01"
        new_snapshot = {"services": [changed_record, self.prev["services"][1]]}
        diff = fs.diff_snapshots(self.prev, new_snapshot)
        self.assertEqual(len(diff["changed"]), 1)
        self.assertEqual(diff["changed"][0]["id"], "A")
        fields_changed = {f["field"] for f in diff["changed"][0]["fields"]}
        self.assertIn("신청기한", fields_changed)

    def test_untracked_field_change_is_ignored(self):
        changed_record = dict(self.prev["services"][0])
        changed_record["조회수"] = 99999  # not in CHANGE_WATCH_FIELDS
        new_snapshot = {"services": [changed_record, self.prev["services"][1]]}
        diff = fs.diff_snapshots(self.prev, new_snapshot)
        self.assertEqual(diff["changed"], [])

    def test_no_previous_snapshot_treats_all_as_new(self):
        new_snapshot = {"services": [{"서비스ID": "X", "서비스명": "첫 스냅샷 사업"}]}
        diff = fs.diff_snapshots(None, new_snapshot)
        self.assertEqual([n["id"] for n in diff["new"]], ["X"])


class TestClassifyAuthError(unittest.TestCase):
    def test_401_missing_key(self):
        msg = fs.classify_auth_error(-401)
        self.assertIn("누락", msg)

    def test_4_unregistered_key(self):
        msg = fs.classify_auth_error(-4)
        self.assertIn("등록되지 않은", msg)

    def test_3_deprecated_path(self):
        msg = fs.classify_auth_error(-3)
        self.assertIn("폐기", msg)

    def test_unknown_code(self):
        msg = fs.classify_auth_error(-999)
        self.assertIn("알 수 없는", msg)


class TestCheckFields(unittest.TestCase):
    def test_all_21_fields_present(self):
        full_record = {f: "x" for f in fs.REQUIRED_LIST_FIELDS}
        ok, missing = fs.check_fields(full_record)
        self.assertTrue(ok)
        self.assertEqual(missing, [])

    def test_missing_field_detected(self):
        partial = {f: "x" for f in fs.REQUIRED_LIST_FIELDS if f != "신청기한"}
        ok, missing = fs.check_fields(partial)
        self.assertFalse(ok)
        self.assertEqual(missing, ["신청기한"])

    def test_multiple_missing_fields_detected(self):
        partial = {"서비스ID": "1", "서비스명": "테스트"}
        ok, missing = fs.check_fields(partial)
        self.assertFalse(ok)
        self.assertEqual(len(missing), len(fs.REQUIRED_LIST_FIELDS) - 2)

    def test_non_dict_record(self):
        ok, missing = fs.check_fields(None)
        self.assertFalse(ok)
        self.assertEqual(missing, fs.REQUIRED_LIST_FIELDS)


class TestBuildCond(unittest.TestCase):
    def test_truthy_kept_falsy_dropped(self):
        raw = {"서비스ID": "1", "JA0101": "Y", "JA0102": "", "JA0301": True, "JA0302": False}
        cond = fs.build_cond(raw)
        self.assertEqual(cond, {"JA0101": "Y", "JA0301": True})

    def test_age_fields_kept_as_int_when_present(self):
        raw = {"JA0110": "18", "JA0111": 65}
        cond = fs.build_cond(raw)
        self.assertEqual(cond, {"JA0110": 18, "JA0111": 65})

    def test_age_fields_absent_when_missing(self):
        raw = {"JA0101": "Y"}
        cond = fs.build_cond(raw)
        self.assertNotIn("JA0110", cond)
        self.assertNotIn("JA0111", cond)


if __name__ == "__main__":
    unittest.main()


class TestReview1Regressions(unittest.TestCase):
    """REVIEW-1 (docs/REVIEW-1.md) 에서 적발된 N등급 결함의 회귀 테스트."""

    def test_count_check_accepts_string_total(self):
        self.assertEqual(fs.count_check("30", 30, 30)["status"], "PASS")
        self.assertEqual(fs.count_check(" 30 ", 30, 30)["status"], "PASS")
        self.assertEqual(fs.count_check("abc", 30, 30)["status"], "FAIL")
        self.assertEqual(fs.count_check(None, 30, 30)["status"], "FAIL")

    def test_diff_ignores_none_vs_empty(self):
        prev = {"services": [{"서비스ID": "A", "서비스명": "x", "신청기한": None}]}
        new = {"services": [{"서비스ID": "A", "서비스명": "x", "신청기한": ""}]}
        self.assertEqual(fs.diff_snapshots(prev, new)["changed"], [])
        new2 = {"services": [{"서비스ID": "A", "서비스명": "x", "신청기한": "  "}]}
        self.assertEqual(fs.diff_snapshots(prev, new2)["changed"], [])
        new3 = {"services": [{"서비스ID": "A", "서비스명": "x", "신청기한": "2026-12-31"}]}
        self.assertEqual(len(fs.diff_snapshots(prev, new3)["changed"]), 1)
