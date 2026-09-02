// 순수 판정 함수 모음. DOM 의존 없음 — 브라우저(app.js)와 node(tests/filter.test.mjs) 공용.
// 규칙 정본: docs/PLAN.md §5 (함정 대응 설계), §6 (수용기준).

const STATUS = {
  MATCH: "일치",
  UNKNOWN: "미확정",
  EXCLUDE: "제외",
};

const ITEM_STATUS = {
  MATCH: "일치",
  MISMATCH: "불일치",
  UNCERTAIN: "판정불가",
};

// criteria.household 라벨 -> supportConditions JA04xx 코드.
export const HOUSEHOLD_CODE_MAP = {
  다문화가족: "JA0401",
  북한이탈주민: "JA0402",
  한부모: "JA0403",
  "1인가구": "JA0404",
  다자녀: "JA0406",
  무주택: "JA0407",
  신규전입: "JA0408",
  확대가족: "JA0409",
};

// criteria.income 브라켓 키 -> supportConditions 중위소득 코드.
export const INCOME_CODE_MAP = {
  "0-50": "JA0201",
  "51-75": "JA0202",
  "76-100": "JA0203",
  "101-200": "JA0204",
  "200+": "JA0205",
};

function pushItem(items, reasons, key, label, status, evidence) {
  items.push({ key, label, status, evidence });
  if (status === ITEM_STATUS.MISMATCH) {
    reasons.push(`${label} 불일치 (${evidence})`);
  }
  return status;
}

function evalUserType(selection, types) {
  if (!types || types.size === 0) {
    return { status: ITEM_STATUS.UNCERTAIN, evidence: "사용자구분 정보 없음" };
  }
  const evidence = Array.from(types).join(", ");
  const has = (t) => types.has(t);
  if (selection === "개인") {
    return {
      status: has("개인") || has("가구") ? ITEM_STATUS.MATCH : ITEM_STATUS.MISMATCH,
      evidence,
    };
  }
  if (selection === "소상공인") {
    if (has("소상공인")) return { status: ITEM_STATUS.MATCH, evidence };
    if (has("개인") || has("가구")) return { status: ITEM_STATUS.UNCERTAIN, evidence };
    return { status: ITEM_STATUS.MISMATCH, evidence };
  }
  if (selection === "법인/시설/단체") {
    if (has("법인/시설/단체")) return { status: ITEM_STATUS.MATCH, evidence };
    if (has("개인") || has("가구")) return { status: ITEM_STATUS.UNCERTAIN, evidence };
    return { status: ITEM_STATUS.MISMATCH, evidence };
  }
  return { status: ITEM_STATUS.UNCERTAIN, evidence: "알 수 없는 선택" };
}

function evalRegion(selection, serviceRegion) {
  if (serviceRegion === "전국") {
    return { status: ITEM_STATUS.MATCH, evidence: "전국" };
  }
  if (serviceRegion == null) {
    return { status: ITEM_STATUS.UNCERTAIN, evidence: "지역 식별 불가" };
  }
  if (serviceRegion === selection) {
    return { status: ITEM_STATUS.MATCH, evidence: serviceRegion };
  }
  return { status: ITEM_STATUS.MISMATCH, evidence: serviceRegion };
}

function evalAge(age, cond) {
  const start = cond ? cond.JA0110 : undefined;
  const end = cond ? cond.JA0111 : undefined;
  if (start == null && end == null) {
    return { status: ITEM_STATUS.UNCERTAIN, evidence: "연령 조건 정보 없음" };
  }
  const lo = start == null ? -Infinity : start;
  const hi = end == null ? Infinity : end;
  const evidence = `${start ?? "제한없음"}~${end ?? "제한없음"}세`;
  return {
    status: age >= lo && age <= hi ? ITEM_STATUS.MATCH : ITEM_STATUS.MISMATCH,
    evidence,
  };
}

function evalGender(selection, cond) {
  const hasMale = !!(cond && cond.JA0101);
  const hasFemale = !!(cond && cond.JA0102);
  if (!hasMale && !hasFemale) {
    return { status: ITEM_STATUS.UNCERTAIN, evidence: "성별 조건 정보 없음" };
  }
  if (hasMale && hasFemale) {
    return { status: ITEM_STATUS.MATCH, evidence: "남녀 모두" };
  }
  if (selection === "남성") {
    return { status: hasMale ? ITEM_STATUS.MATCH : ITEM_STATUS.MISMATCH, evidence: hasMale ? "남성" : "여성" };
  }
  if (selection === "여성") {
    return { status: hasFemale ? ITEM_STATUS.MATCH : ITEM_STATUS.MISMATCH, evidence: hasFemale ? "여성" : "남성" };
  }
  return { status: ITEM_STATUS.UNCERTAIN, evidence: "알 수 없는 선택" };
}

function evalIncome(bracket, cond) {
  const codes = Object.values(INCOME_CODE_MAP);
  const anyPresent = codes.some((c) => cond && cond[c]);
  if (!anyPresent) {
    return { status: ITEM_STATUS.UNCERTAIN, evidence: "소득 조건 정보 없음" };
  }
  const targetCode = INCOME_CODE_MAP[bracket];
  const matched = !!(cond && targetCode && cond[targetCode]);
  return { status: matched ? ITEM_STATUS.MATCH : ITEM_STATUS.MISMATCH, evidence: `선택 구간 ${bracket}` };
}

function evalHousehold(selected, cond) {
  const presentCodes = Object.keys(cond || {}).filter((k) => /^JA04\d\d$/.test(k) && cond[k]);
  if (presentCodes.length === 0) {
    return { status: ITEM_STATUS.UNCERTAIN, evidence: "가구 특성 정보 없음" };
  }
  const selectedCodes = selected.map((label) => HOUSEHOLD_CODE_MAP[label]).filter(Boolean);
  const matched = selectedCodes.some((code) => cond[code]);
  return {
    status: matched ? ITEM_STATUS.MATCH : ITEM_STATUS.MISMATCH,
    evidence: presentCodes.join(", "),
  };
}

function evalBusiness(selectedCode, cond) {
  const presentCodes = Object.keys(cond || {}).filter((k) => /^JA11\d\d$/.test(k) && cond[k]);
  if (presentCodes.length === 0) {
    return { status: ITEM_STATUS.UNCERTAIN, evidence: "사업자 상태 정보 없음" };
  }
  const matched = !!(cond && cond[selectedCode]);
  return { status: matched ? ITEM_STATUS.MATCH : ITEM_STATUS.MISMATCH, evidence: presentCodes.join(", ") };
}

function splitFieldValues(raw) {
  return String(raw)
    .split(/[,|/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function evalField(selectedFields, raw) {
  if (!raw) {
    return { status: ITEM_STATUS.UNCERTAIN, evidence: "서비스분야 정보 없음" };
  }
  const svcFields = splitFieldValues(raw);
  const matched = svcFields.some((f) => selectedFields.includes(f));
  return { status: matched ? ITEM_STATUS.MATCH : ITEM_STATUS.MISMATCH, evidence: svcFields.join(", ") };
}

function evalKeyword(keyword, service) {
  const haystack = [service["서비스명"], service["서비스목적요약"], service["지원대상"]]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!haystack) {
    return { status: ITEM_STATUS.UNCERTAIN, evidence: "검색 대상 텍스트 없음" };
  }
  const matched = haystack.includes(keyword.trim().toLowerCase());
  return { status: matched ? ITEM_STATUS.MATCH : ITEM_STATUS.MISMATCH, evidence: `키워드 "${keyword}"` };
}

/**
 * 서비스 1건을 조건(criteria)으로 판정한다.
 * @param {object} service snapshot.json 의 record (파생 필드 user_types/region/cond 포함)
 * @param {object} criteria 사용자가 입력한 조건
 * @returns {{status: "일치"|"미확정"|"제외", items: Array, reasons: string[]}}
 */
export function evaluate(service, criteria) {
  criteria = criteria || {};
  const items = [];
  const reasons = [];
  const cond = service.cond || {};
  const types = new Set(service.user_types || []);

  if (criteria.userType) {
    const r = evalUserType(criteria.userType, types);
    pushItem(items, reasons, "userType", "신청자 유형", r.status, r.evidence);
  }

  if (criteria.region && criteria.region !== "전체") {
    const r = evalRegion(criteria.region, service.region);
    pushItem(items, reasons, "region", "지역", r.status, r.evidence);
  }

  if (criteria.age != null && criteria.age !== "") {
    const r = evalAge(Number(criteria.age), cond);
    pushItem(items, reasons, "age", "나이", r.status, r.evidence);
  }

  if (criteria.gender) {
    const r = evalGender(criteria.gender, cond);
    pushItem(items, reasons, "gender", "성별", r.status, r.evidence);
  }

  if (criteria.income) {
    const r = evalIncome(criteria.income, cond);
    pushItem(items, reasons, "income", "소득 구간", r.status, r.evidence);
  }

  if (criteria.household && criteria.household.length > 0) {
    const r = evalHousehold(criteria.household, cond);
    pushItem(items, reasons, "household", "가구 특성", r.status, r.evidence);
  }

  if (criteria.userType === "소상공인" && criteria.business) {
    const r = evalBusiness(criteria.business, cond);
    pushItem(items, reasons, "business", "사업자 상태", r.status, r.evidence);
  }

  if (criteria.fields && criteria.fields.length > 0) {
    const r = evalField(criteria.fields, service["서비스분야"]);
    pushItem(items, reasons, "field", "서비스분야", r.status, r.evidence);
  }

  if (criteria.keyword && criteria.keyword.trim() !== "") {
    const r = evalKeyword(criteria.keyword, service);
    pushItem(items, reasons, "keyword", "키워드", r.status, r.evidence);
  }

  if (items.length === 0) {
    items.push({ key: "none", label: "조건", status: ITEM_STATUS.UNCERTAIN, evidence: "조건 없음" });
    return { status: STATUS.UNKNOWN, items, reasons };
  }

  let status;
  if (items.some((i) => i.status === ITEM_STATUS.MISMATCH)) {
    status = STATUS.EXCLUDE;
  } else if (items.some((i) => i.status === ITEM_STATUS.UNCERTAIN)) {
    status = STATUS.UNKNOWN;
  } else {
    status = STATUS.MATCH;
  }

  return { status, items, reasons };
}

/**
 * evaluate() 결과 배열을 집계한다. matched+unknown+excluded !== total 이면 예외를 던진다(불변식).
 * @param {Array<{status:string}>} results
 */
export function summarize(results) {
  const total = results.length;
  let matched = 0;
  let unknown = 0;
  let excluded = 0;
  for (const r of results) {
    if (r.status === STATUS.MATCH) matched += 1;
    else if (r.status === STATUS.UNKNOWN) unknown += 1;
    else if (r.status === STATUS.EXCLUDE) excluded += 1;
  }
  if (matched + unknown + excluded !== total) {
    throw new Error(
      `summarize invariant violated: ${matched}+${unknown}+${excluded} !== ${total}`
    );
  }
  return { total, matched, unknown, excluded };
}

function deadlineGroupRank(service) {
  if (service.deadline_kind === "기간") return 0;
  if (service.deadline_kind === "상시") return 1;
  return 2; // 불명 또는 미확인
}

function parseDeadlineTime(service) {
  if (!service.deadline_date) return null;
  const t = new Date(service.deadline_date).getTime();
  return Number.isNaN(t) ? null : t;
}

function compareDeadline(a, b) {
  const ra = deadlineGroupRank(a);
  const rb = deadlineGroupRank(b);
  if (ra !== rb) return ra - rb;
  if (ra !== 0) return 0;
  const ta = parseDeadlineTime(a);
  const tb = parseDeadlineTime(b);
  if (ta == null && tb == null) return 0;
  if (ta == null) return 1;
  if (tb == null) return -1;
  return ta - tb;
}

function matchCountOf(result) {
  return (result && result.items ? result.items : []).filter((i) => i.status === ITEM_STATUS.MATCH).length;
}

function compareMatchCountDesc(ra, rb) {
  return matchCountOf(rb) - matchCountOf(ra);
}

function regionRank(service, targetRegion) {
  if (targetRegion && service.region === targetRegion) return 0;
  if (service.region === "전국") return 1;
  return 2;
}

function compareRegion(a, b, targetRegion) {
  return regionRank(a, targetRegion) - regionRank(b, targetRegion);
}

function compareViewsDesc(a, b) {
  const va = Number(a["조회수"]) || 0;
  const vb = Number(b["조회수"]) || 0;
  return vb - va;
}

/**
 * {service, result} 쌍의 배열을 정렬한다.
 * key: "deadline" | "matchCount" | "region" | "views" | undefined(기본: 마감→매칭수→지역)
 * context.region 은 "region" 정렬 시 기준이 되는 사용자의 선택 지역.
 * @param {Array<{service:object, result:object}>} list
 * @param {string=} key
 * @param {{region?:string}=} context
 */
export function sortServices(list, key, context) {
  context = context || {};
  const arr = list.slice();
  const byDeadline = (x, y) => compareDeadline(x.service, y.service);
  const byMatchCount = (x, y) => compareMatchCountDesc(x.result, y.result);
  const byRegion = (x, y) => compareRegion(x.service, y.service, context.region);
  const byViews = (x, y) => compareViewsDesc(x.service, y.service);

  if (key === "deadline") {
    arr.sort(byDeadline);
  } else if (key === "matchCount") {
    arr.sort(byMatchCount);
  } else if (key === "region") {
    arr.sort(byRegion);
  } else if (key === "views") {
    arr.sort(byViews);
  } else {
    arr.sort((x, y) => {
      const d = byDeadline(x, y);
      if (d !== 0) return d;
      const m = byMatchCount(x, y);
      if (m !== 0) return m;
      return byRegion(x, y);
    });
  }
  return arr;
}

/**
 * 기간형 마감의 임박도를 분류한다. 기간형이 아니거나 마감일이 없으면 null.
 * @param {object} service
 * @param {Date=} today
 * @returns {"D-1이하"|"D-7이하"|null}
 */
export function classifyDeadlineUrgency(service, today) {
  if (service.deadline_kind !== "기간" || !service.deadline_date) return null;
  const now = today || new Date();
  const deadline = new Date(service.deadline_date);
  if (Number.isNaN(deadline.getTime())) return null;
  const diffDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "마감 지남";
  if (diffDays <= 1) return "D-1이하";
  if (diffDays <= 7) return "D-7이하";
  return null;
}
