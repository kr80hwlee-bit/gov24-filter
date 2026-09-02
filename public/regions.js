// 17개 시도 정본 명칭과 별칭표.
// fetch_snapshot.py(다른 에이전트 소유)가 소관기관명 문자열에서 시도를 판별할 때,
// 그리고 이 화면(app.js)이 지역 select 옵션을 만들 때 공용으로 쓴다.
// (docs/PLAN.md §5.3)

export const ALL_REGIONS_LABEL = "전체";

// 화면에 노출하는 정식 명칭(시도 select 옵션 순서 = 이 배열 순서).
export const REGIONS = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도",
];

// 정식 명칭 -> 소관기관명에서 매칭에 쓸 수 있는 표기(정식명 포함) 목록.
// 순서: 더 긴/구체적인 표기부터 두어 접두 매칭 시 오탐을 줄인다.
export const REGION_ALIASES = {
  서울특별시: ["서울특별시", "서울"],
  부산광역시: ["부산광역시", "부산"],
  대구광역시: ["대구광역시", "대구"],
  인천광역시: ["인천광역시", "인천"],
  광주광역시: ["광주광역시", "광주"],
  대전광역시: ["대전광역시", "대전"],
  울산광역시: ["울산광역시", "울산"],
  세종특별자치시: ["세종특별자치시", "세종"],
  경기도: ["경기도", "경기"],
  강원특별자치도: ["강원특별자치도", "강원도", "강원"],
  충청북도: ["충청북도", "충북"],
  충청남도: ["충청남도", "충남"],
  전북특별자치도: ["전북특별자치도", "전라북도", "전북"],
  전라남도: ["전라남도", "전남"],
  경상북도: ["경상북도", "경북"],
  경상남도: ["경상남도", "경남"],
  제주특별자치도: ["제주특별자치도", "제주"],
};

// 별칭 -> 정본 명칭 역매핑 (긴 문자열 우선순으로 정렬해 둔다).
const ALIAS_TO_CANONICAL = [];
for (const canonical of REGIONS) {
  for (const alias of REGION_ALIASES[canonical]) {
    ALIAS_TO_CANONICAL.push([alias, canonical]);
  }
}
ALIAS_TO_CANONICAL.sort((a, b) => b[0].length - a[0].length);

/**
 * 소관기관명 등 자유 텍스트에서 시도 정본 명칭을 찾는다.
 * 못 찾으면 null (지역 미확정).
 * @param {string} text
 * @returns {string|null}
 */
export function resolveRegionFromText(text) {
  if (!text) return null;
  for (const [alias, canonical] of ALIAS_TO_CANONICAL) {
    if (text.includes(alias)) return canonical;
  }
  return null;
}
