// filter.js 단위 테스트. node --test 로 실행한다 (ESM import; package.json 없이도
// Node 22의 모듈 구문 자동 감지로 동작함을 이 세션에서 실측 확인했다).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { evaluate, summarize, sortServices, classifyDeadlineUrgency } from "../public/filter.js";

function makeService(overrides) {
  return Object.assign(
    {
      서비스ID: "TEST-0000",
      서비스명: "테스트 사업",
      서비스목적요약: "테스트 목적",
      지원대상: "테스트 대상",
      서비스분야: "고용·창업",
      조회수: "10",
      user_types: [],
      region: null,
      deadline_kind: "불명",
      deadline_date: null,
      cond: {},
    },
    overrides
  );
}

describe("evaluate - 사용자구분 (§5.1)", () => {
  test("개인 선택 시 법인/시설/단체 단독 사업은 제외", () => {
    const svc = makeService({ user_types: ["법인/시설/단체"] });
    const r = evaluate(svc, { userType: "개인" });
    assert.equal(r.status, "제외");
    const item = r.items.find((i) => i.key === "userType");
    assert.equal(item.status, "불일치");
    assert.ok(r.reasons.length > 0);
  });

  test("개인 선택 시 소상공인 단독 사업도 제외", () => {
    const svc = makeService({ user_types: ["소상공인"] });
    const r = evaluate(svc, { userType: "개인" });
    assert.equal(r.status, "제외");
  });

  test("개인 선택 시 가구 포함 사업은 일치", () => {
    const svc = makeService({ user_types: ["가구"] });
    const r = evaluate(svc, { userType: "개인" });
    assert.equal(r.status, "일치");
  });

  test("개인 선택 시 개인+법인 복수 값도 일치 (개인 포함이면 매칭)", () => {
    const svc = makeService({ user_types: ["개인", "법인/시설/단체"] });
    const r = evaluate(svc, { userType: "개인" });
    assert.equal(r.status, "일치");
  });

  test("사용자구분이 비어 있으면 미확정 (제외하지 않음)", () => {
    const svc = makeService({ user_types: [] });
    const r = evaluate(svc, { userType: "개인" });
    assert.equal(r.status, "미확정");
    const item = r.items.find((i) => i.key === "userType");
    assert.equal(item.status, "판정불가");
  });

  test("소상공인 선택 시 개인만 있는 사업은 판정불가(미확정)", () => {
    const svc = makeService({ user_types: ["개인"] });
    const r = evaluate(svc, { userType: "소상공인" });
    assert.equal(r.status, "미확정");
  });

  test("소상공인 선택 시 법인/시설/단체 단독 사업은 제외", () => {
    const svc = makeService({ user_types: ["법인/시설/단체"] });
    const r = evaluate(svc, { userType: "소상공인" });
    assert.equal(r.status, "제외");
  });
});

describe("evaluate - 지역 (§5.3)", () => {
  test("전국 사업은 어떤 지역을 선택해도 일치", () => {
    const svc = makeService({ region: "전국" });
    const r = evaluate(svc, { region: "서울특별시" });
    assert.equal(r.status, "일치");
  });

  test("같은 시도 선택 시 일치", () => {
    const svc = makeService({ region: "부산광역시" });
    const r = evaluate(svc, { region: "부산광역시" });
    assert.equal(r.status, "일치");
  });

  test("다른 시도 선택 시 제외", () => {
    const svc = makeService({ region: "부산광역시" });
    const r = evaluate(svc, { region: "서울특별시" });
    assert.equal(r.status, "제외");
  });

  test("지역 식별 불가(null)면 미확정", () => {
    const svc = makeService({ region: null });
    const r = evaluate(svc, { region: "서울특별시" });
    assert.equal(r.status, "미확정");
  });

  test("지역을 전체로 선택하면 지역 조건을 걸지 않는다", () => {
    const svc = makeService({ region: "부산광역시" });
    const r = evaluate(svc, { region: "전체", userType: "개인", user_types: undefined });
    // region 항목이 아예 생성되지 않아야 한다
    assert.ok(!r.items.some((i) => i.key === "region"));
  });
});

describe("evaluate - 나이", () => {
  test("범위 안이면 일치", () => {
    const svc = makeService({ cond: { JA0110: 19, JA0111: 34 } });
    const r = evaluate(svc, { age: 25 });
    assert.equal(r.status, "일치");
  });

  test("범위 밖이면 제외", () => {
    const svc = makeService({ cond: { JA0110: 19, JA0111: 34 } });
    const r = evaluate(svc, { age: 50 });
    assert.equal(r.status, "제외");
  });

  test("연령 코드가 전혀 없으면 미확정", () => {
    const svc = makeService({ cond: {} });
    const r = evaluate(svc, { age: 25 });
    assert.equal(r.status, "미확정");
  });
});

describe("evaluate - 소득 구간", () => {
  test("해당 구간 코드가 있으면 일치", () => {
    const svc = makeService({ cond: { JA0201: true, JA0202: true } });
    const r = evaluate(svc, { income: "0-50" });
    assert.equal(r.status, "일치");
  });

  test("다른 구간만 있으면 제외", () => {
    const svc = makeService({ cond: { JA0204: true } });
    const r = evaluate(svc, { income: "0-50" });
    assert.equal(r.status, "제외");
  });

  test("소득 코드가 전혀 없으면 미확정", () => {
    const svc = makeService({ cond: {} });
    const r = evaluate(svc, { income: "0-50" });
    assert.equal(r.status, "미확정");
  });
});

describe("evaluate - 조건 없음 (AC-4)", () => {
  test("조건을 하나도 넣지 않으면 미확정, 항목은 '조건 없음' 하나", () => {
    const svc = makeService({});
    const r = evaluate(svc, {});
    assert.equal(r.status, "미확정");
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0].evidence, "조건 없음");
  });
});

describe("summarize", () => {
  test("matched+unknown+excluded === total", () => {
    const results = [
      { status: "일치" },
      { status: "일치" },
      { status: "미확정" },
      { status: "제외" },
    ];
    const s = summarize(results);
    assert.equal(s.total, 4);
    assert.equal(s.matched, 2);
    assert.equal(s.unknown, 1);
    assert.equal(s.excluded, 1);
    assert.equal(s.matched + s.unknown + s.excluded, s.total);
  });

  test("빈 배열도 불변식을 만족", () => {
    const s = summarize([]);
    assert.equal(s.total, 0);
    assert.equal(s.matched + s.unknown + s.excluded, 0);
  });
});

describe("sortServices - deadline 정렬", () => {
  test("기간형이 날짜 오름차순으로 먼저, 상시가 다음, 불명이 마지막", () => {
    const a = { service: makeService({ deadline_kind: "불명" }), result: { items: [] } };
    const b = { service: makeService({ deadline_kind: "상시" }), result: { items: [] } };
    const c = { service: makeService({ deadline_kind: "기간", deadline_date: "2026-09-10" }), result: { items: [] } };
    const d = { service: makeService({ deadline_kind: "기간", deadline_date: "2026-09-05" }), result: { items: [] } };
    const sorted = sortServices([a, b, c, d], "deadline");
    assert.deepEqual(
      sorted.map((x) => x.service.deadline_date || x.service.deadline_kind),
      ["2026-09-05", "2026-09-10", "상시", "불명"]
    );
  });
});

describe("classifyDeadlineUrgency", () => {
  test("D-1 이내면 D-1이하", () => {
    const today = new Date("2026-09-02T00:00:00+09:00");
    const svc = makeService({ deadline_kind: "기간", deadline_date: "2026-09-02" });
    assert.equal(classifyDeadlineUrgency(svc, today), "D-1이하");
  });

  test("D-7 이내면 D-7이하", () => {
    const today = new Date("2026-09-02T00:00:00+09:00");
    const svc = makeService({ deadline_kind: "기간", deadline_date: "2026-09-08" });
    assert.equal(classifyDeadlineUrgency(svc, today), "D-7이하");
  });

  test("기간형이 아니면 null", () => {
    const svc = makeService({ deadline_kind: "상시" });
    assert.equal(classifyDeadlineUrgency(svc, new Date()), null);
  });
});
