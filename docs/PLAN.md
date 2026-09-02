# 보조금24 조건 필터 웹앱 — 전체 계획서 v2

작성일 2026-09-02 · 작성자 Claude(cla) · 채점 기준 `docs/RUBRIC.md`(사전 고정) · 기획 정본 Manyfast 프로젝트 `ac541472-f0d6-4856-95c3-8788a5901682`

태그 규약: `[확인]` 출처 URL 또는 실측으로 검증 · `[추정]` 근거 있는 추론 · `[데이터공백]` 확인 못함 · `[결정]` 이 계획에서 내린 선택

---

## 1. 목표와 범위

**목표(한 문장)**: 공공데이터포털 보조금24 공공서비스 API를 한 번 받아 기준일이 붙은 스냅샷으로 두고, 사용자가 자기 조건을 넣으면 그 스냅샷에서 후보를 걸러 보여주는 정적 웹앱을 GitHub Pages 고정 주소로 배포한다.

### 1.1 단계 정의 `[결정]` (Director 답변 "1,2,3 다" 반영)

| 단계 | 내용 | 이번 세션 목표 | 구현 상태(계획서 v2 시점) |
|---|---|---|---|
| P1 MVP(영상 범위) | 수집 스크립트 · 스냅샷 · 조건 필터 정적 페이지 · 출처/기준일 표시 · 한계 안내 · GitHub Pages 배포 · 인증키 비노출 검증 | 구현 대상 | `[확인]` 로컬 구현 완료. 검증 주체 구분: 작성자 실행 = E-5·E-6(단위 35+26, 키 검사, 화면 AC-4~8·13·15) / 채점자 독립 재현 = EVAL-2(단위·키 검사·AC-2) / 검수자 독립 재현 = §9.2 표(REVIEW-1). 배포 완료 `[확인]` E-8(공개 URL 200, AC-14). **미완**: 실데이터 스냅샷(사용자 키 필요, T0) |
| P2 저장·비교 | 브라우저 로컬 저장 기반 관심 목록 · 비교 화면 · 구비서류 체크리스트 · 진행 상태 | 구현 대상 | `[확인]` 로컬 구현 완료. 작성자 실행 E-6(AC-9~11) / 검수자 독립 재현 §9.2 표 |
| P3 변경 감지(서버 없는 범위) | GitHub Actions 예약 수집 · 직전 스냅샷 대비 변경 목록(신규/변경/소멸) 페이지 · 수집 상태 페이지 | 구현 대상(서버 불필요 부분만) | `[확인]` diff 로직(단위 테스트, 채점자 재현)·변경/상태 페이지(작성자 실행 E-6)·refresh.yml 작성 완료. **미완**: Actions 실제 2회 실행 후 변경 페이지 확인(AC-12, Secret 등록 후) |
| P3 잔여 | 이메일/푸시 알림 · 계정 동기화 · 관리자 검수 화면 · 유사 중복 통합 | **이번 세션 범위 밖**, §8에 후속 조건 명시 |

### 1.2 범위 밖(긍정형 명시)
- 이 앱은 **로그인 없이** 동작한다. 계정·동기화·이메일 발송은 서버가 필요하므로 P3 잔여로 둔다.
- 이 앱은 **API를 브라우저에서 호출하지 않는다.** 호출은 수집 스크립트(로컬 또는 GitHub Actions)에서만 한다.
- 이 앱은 **자격을 판정하지 않는다.** "조건에서 걸러지지 않은 목록"을 보여주고 최종 판단은 담당 기관에 둔다.
- 이 앱은 **정부24·지자체 홈페이지를 크롤링하지 않는다.** gov.kr robots.txt가 크롤링을 불허한다 `[확인]` (sole-search 문서, https://github.com/djfksjd/sole-search).
- 앱스토어·네이티브 앱·사용자 정의 도메인은 범위 밖이다.

---

## 2. 데이터 출처와 API 규격 (근거)

| 항목 | 값 | 태그·출처 |
|---|---|---|
| 데이터셋 | 행정안전부_대한민국 공공서비스(혜택) 정보, data.go.kr ID 15113968 | `[확인]` https://www.data.go.kr/data/15113968/openapi.do |
| 비용·승인 | 무료 · 개발/운영 자동승인 | `[확인]` 같은 페이지 |
| 트래픽 | 개발계정 일 10,000건 | `[확인]` 같은 페이지 |
| Base URL | `https://api.odcloud.kr/api/gov24/v3/` | `[확인]` Swagger https://infuser.odcloud.kr/api/stages/44436/api-docs · v1은 2026-09-02 실측 HTTP 404 `{"code":-3}` |
| 오퍼레이션 | `serviceList` · `serviceDetail` · `supportConditions` | `[확인]` Swagger paths |
| 인증 | 쿼리 `serviceKey=` 또는 헤더 `Authorization: Infuser <키>` | `[확인]` Swagger security(ApiKeyAuth header / ApiKeyAuth2 query) |
| 파라미터 | `page` `perPage` `returnType` `cond[필드::연산자]` | `[확인]` Swagger · perPage=500 동작 `[확인]`(sole-search 실사용, 2026-07-20 10,979건 전량 수집 로그; bid-collectors는 perPage=100 사용) · 공식 최대치 `[데이터공백]` |
| 응답 봉투 | `page, perPage, totalCount, currentCount, matchCount, data[]` | `[확인]` Swagger(oss 보고서 A-0) |
| 오류 형식 | JSON `{"code": -4, "msg": "등록되지 않은 인증키 입니다."}` HTTP 401 / 키 누락 `-401` / 폐기 경로 `-3` HTTP 404 | `[확인]` 2026-09-02 실측(placeholder 키) |
| serviceList 필드 21종 | 서비스ID 지원유형 서비스명 서비스목적요약 지원대상 선정기준 지원내용 신청방법 신청기한 상세조회URL 소관기관코드 소관기관명 부서명 조회수 소관기관유형 사용자구분 서비스분야 접수기관 전화문의 등록일시 수정일시 | `[확인]` Swagger serviceList_model |
| serviceDetail 추가 필드 | 구비서류 접수기관명 문의처 온라인신청사이트URL 행정규칙 자치법규 법령 공무원확인구비서류 본인확인필요구비서류 | `[확인]` Swagger 원문 직접 조회 2026-09-02, 조회 기록은 `docs/EVIDENCE.md` §E-1 (리서치 보고서 2종에는 없는 필드라 원문 조회로 보강) |
| supportConditions | 서비스ID 기준. JA0101/02 성별 · JA0110/11 연령 시작/종료 · JA0201~05 중위소득 구간 · JA03xx 대상 특성 · JA04xx 가구 특성 · JA11xx/12xx 사업자 상태·업종 · JA21xx/22xx 법인 유형·업종 | `[확인]` Swagger supportConditions model(설명문 포함) |
| 사용자구분 값 | `개인` `가구` `소상공인` `법인/시설/단체`, 복수는 `\|\|` 결합 | `[확인]` benefit-alarm 실스냅샷 10,999건 집계(oss 보고서 A-1) |
| 소관기관유형 값 | 시군구 · 광역시도 · 중앙행정기관 · 공공기관 · 지방출자_출연기관 · 지방공기업 · 교육청 | `[확인]` 같은 집계 |
| 전체 건수·크기 | 약 10,929~10,999건 · 경량 11필드 3.76MB · 지원조건 3.08MB · 전체 상세 약 10MB(미압축) | `[확인]` 실측(oss 보고서 C) |
| 지역 전용 필드 | **없음**. 소관기관명 문자열과 소관기관유형으로 대신한다 | `[확인]` Swagger에 부재 · `[추정]` 대체 규칙(§5.3) |
| 서버측 cond 필터 신뢰성 | ID 단건조회만 실사용 검증. 카테고리 필터는 "검증 안 됨"으로 실사용자가 미채택 | `[확인]` sole-search 주석 → **전량 수집 후 클라이언트 필터 채택** `[결정]` |
| 갱신 주기(제공 측) | `[데이터공백]` — 수정일시 필드로 변경을 감지한다 |

---

## 3. 아키텍처

```
[본인 계정 data.go.kr]──인증키──▶ .env(로컬) / GitHub Secrets(Actions)
                                          │ 수집 시에만 사용
                                          ▼
scripts/fetch_snapshot.py ──▶ data/snapshot.json (기준일·건수·레코드·조건코드)
                          ──▶ data/meta.json     (수집 시각·건수 대조·오류)
                          ──▶ data/changes.json  (직전 스냅샷 대비 신규/변경/소멸)
                                          │ 산출물만 복사
                                          ▼
public/index.html + app.js + filter.js + data/*.json ──▶ GitHub Pages(정적)
                                          ▲
브라우저: 스냅샷 로드 → 조건 입력 → filter.js 가 로컬에서 판정 → 목록/상세/비교/변경
```

- **왜 스냅샷인가**: 서버측 조건검색이 신뢰되지 않고(§2) 일 1만 건 한도가 있으므로, 사용자 요청마다 호출하는 구조는 성립하지 않는다. 전량 수집은 세 오퍼레이션(serviceList·serviceDetail·supportConditions) 각 약 11,000건 ÷ perPage 500 = 22~23페이지씩, 합계 **66~69회**(재시도 없을 때)로 하루 한도의 **0.7%** 이내다 `[확인]` 산술(ceil(11000/500)=22, ×3=66; 10,999건이면 22페이지, 11,001건이면 23페이지).
- **키가 배포물에 들어갈 경로가 없는 이유**: 키를 읽는 코드는 `scripts/` 아래뿐이고 `public/`으로 복사되는 것은 JSON 산출물뿐이다. 배포 전 검사(§9.3)가 이를 매번 증명한다. Actions에서는 Secret으로만 주입되고 로그에는 GitHub가 자동 마스킹한다 `[확인]` https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
- **정적 호스팅 선택**: GitHub Pages `[결정]`(Director 승인). 공개 저장소 필수 `[확인]` https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages · Pages는 gzip 전송을 지원해 4~6MB JSON이 실전송 1MB 안팎이 된다 `[추정]`(§8 R-6).
- **빌드 도구 없음** `[결정]`: 순수 HTML/ES 모듈. 비개발자 유지보수와 키 노출 경로 최소화(Vite의 `VITE_` 변수 자동 노출 함정 회피 `[확인]` https://vitejs.dev/guide/env-and-mode).

---

## 4. 요구사항 추적 매트릭스(RTM)

Manyfast ID → 이 계획의 작업 단위. "제외"는 §1.1 P3 잔여.

| Manyfast ID | 이름 | 단계 | 작업 단위(§7) | 수용기준(§6) |
|---|---|---|---|---|
| R-UXYZQX / F-ASQNDV | 스냅샷 수집 | P1 | T1 fetch_snapshot.py | AC-1, AC-2, AC-3 |
| S-EUMMRL | 전체 페이지 순회 | P1 | T1 | AC-1 |
| S-YJFPXZ | 인증키 오류 원인 분류 | P1 | T0 check_key.py + T1 | AC-2 |
| S-WWRJEI | 수집 건수 대조 | P1 | T1 | AC-3 |
| F-EUYEPV | 출처·기준일 표시 | P1 | T3 상세 패널 | AC-7 |
| F-IYJXAS | 중복 식별·통합 | P1 부분 | T1 서비스ID 기준 중복 제거만. 유사 중복 관리자 검수는 **제외** | AC-3 |
| R-RUNANH / F-GAWLAF | 내 조건 입력 | P1 | T3 폼 | AC-4 |
| F-TZOFVQ | 스냅샷 기반 필터링 | P1 | T2 filter.js | AC-5 |
| S-MSNYAE | 개인·기업 구분 | P1 | T2 | AC-5a |
| S-FQRSWR | 지역·전국 포함 | P1 | T2 | AC-5b |
| S-BFUORF | 판정 불가→미확정 | P1 | T2 | AC-5c |
| F-HWXXDC | 정렬·결과 요약 | P1 | T3 | AC-6 |
| R-BHSHKU / F-YZSTVN | 일치·미확정 구분 표시 | P1 | T3 | AC-7 |
| F-HLORYA | 한계 안내 상시 노출 | P1 | T3 | AC-8 |
| R-ACWYYR / F-OOCXJI | 관심 저장(로컬) | P2 | T4 | AC-9 |
| F-KRNSHV | 비교 화면 | P2 | T4 | AC-10 |
| R-LIKNIG / F-SIZIWK | 구비서류 체크리스트 | P2 | T1(serviceDetail 구비서류 수집) + T4 | AC-11 |
| F-TIGIYM | 진행 상태 | P2 | T4 | AC-11 |
| R-HVWFZS / F-LSTLDX | 변경 감지 | P3 | T5 Actions + T1 diff + T6 변경 페이지 | AC-12 |
| S-FHJZRS | 마감 임박 | P3 | T6(마감일 파싱 가능한 건만, 클라이언트 계산) | AC-12 |
| S-YEGRVS / S-WVUNJJ | 신규 매칭·변경 | P3 | T6(페이지 표시까지. 발송은 **제외**) | AC-12 |
| F-NQAAZL | 알림 설정 | 제외 | 발송 채널이 서버 필요 | — |
| R-ASTPIO / F-MXNJHD | 수집 상태 대시보드 | P3 최소 | T6 상태 페이지(meta.json 표시) | AC-12 |
| F-KBDFAQ | 검수·비활성화 | 제외 | 관리자 인증 필요 | — |
| F-WCODXE / S-JYVICG | 배포물 키 부재 검증 | P1 | T7 verify_no_key.sh | AC-13 |
| S-HHONHV | 일일 한도 경고 | P1 | T1 호출 계수·80% 경고 | AC-2 |
| R-EOIJOO / F-YLKNTT | 배포·공유 링크 | P1 | T5 Pages 워크플로 | AC-14 |
| F-JZQSJS | 모바일 반응형 | P1 | T3 CSS | AC-15 |

---

## 5. 함정 대응 설계 (구체 규칙)

### 5.1 기업 사업이 개인 검색에 섞이는 문제 (S-MSNYAE)
- 근거 필드: `사용자구분` `[확인]`. 값은 `||`로 결합되므로 `split('||')` 후 집합 비교한다.
- 규칙: 사용자 선택 `개인` → 집합에 `개인` 또는 `가구`가 있으면 **일치**, `소상공인`·`법인/시설/단체`만 있으면 **제외(사유: 사업자·법인 대상)**, 필드가 비어 있으면 **미확정**. 선택 `소상공인` → `소상공인` 포함 시 일치, `개인`만이면 미확정(개인 사업자도 개인 사업에 해당할 수 있음 `[추정]`), `법인/시설/단체`만이면 제외. 선택 `법인/시설/단체` → 대칭.
- 검증: 스냅샷에서 `사용자구분`이 `법인/시설/단체` 단독인 표본 5건을 개인 조건으로 검색해 일치 목록에 0건임을 확인한다(AC-5a).

### 5.2 API 전체 건수와 실제 건수가 어긋나는 문제 (S-WWRJEI)
- 세 수를 기록·대조한다: `totalCount`(첫 페이지 응답) · 수신 레코드 수(전 페이지 합) · 서비스ID 고유 수.
- 규칙: `수신 == totalCount` 이고 `고유 == 수신` 이면 승격. 아니면 `meta.json`에 `count_check: FAIL`과 세 수를 쓰고 **스냅샷을 승격하지 않는다**(직전 유지). 단 `totalCount`가 페이지 순회 도중 바뀐 경우(등록 중 변동)는 재수집 1회 후 판정한다 `[결정]`.
- 영상의 "377 대 105"는 원문 설명이 없어 이 일반 규칙으로 흡수한다 `[추정]`.

### 5.3 지역이 빠지는 문제 (S-FQRSWR)
- 지역 전용 필드가 없다 `[확인]`. 대체 규칙:
  1. `소관기관유형 ∈ {중앙행정기관, 공공기관}` → 지역 = **전국**(어느 지역을 골라도 일치).
  2. 그 외는 `소관기관명`에서 17개 시도명(정식명·약칭 표: 서울특별시/서울, 부산광역시/부산, 대구, 인천, 광주, 대전, 울산, 세종특별자치시/세종, 경기도/경기, 강원특별자치도/강원, 충청북도/충북, 충청남도/충남, 전북특별자치도/전북, 전라남도/전남, 경상북도/경북, 경상남도/경남, 제주특별자치도/제주)를 **접두 또는 포함 매칭**해 시도를 정한다.
  3. 시도가 안 잡히면(예: "강남구" 단독) → **지역 미확정**으로 두고 제외하지 않는다. `meta.json`에 미확정 비율을 기록한다.
- 검증: 수집 후 미확정 비율을 보고한다(§9.1). 비율이 20%를 넘으면 `소관기관코드` 앞자리로 시도를 보강하는 T1-b를 실행한다 `[결정]`(코드 체계는 `[데이터공백]`이라 실물을 보고 결정).

### 5.4 인증키가 있는데 한쪽만 실패하는 문제 (S-YJFPXZ)
- 원인 6종을 코드로 구분한다 `[확인]`(실측 오류표 §2): `-401` 키 누락 · `-4` 미등록/미승인/오타 · `-3` v1 폐기 경로 · 이중 인코딩(`%25`) · 디코딩 키의 `+`가 공백으로 해석 · 승인 전파 지연 `[추정]`.
- `scripts/check_key.py`가 쿼리-디코딩 / 쿼리-원문 / 헤더 세 방식을 한 번에 시험해 "열리는 방식"을 보고한다. 키 값은 출력하지 않는다.
- 이 사용자의 기존 키가 이 API에 해당하는지는 **활용신청 목록에 15113968이 있어야** 한다 `[확인]`(data.go.kr 인증키는 계정 단위, 사용 가능 API는 활용신청 단위). 판정은 check_key 실행 결과 HTTP 200 + data 1건으로 한다.

---

## 6. 수용기준 (EARS) 와 재현 절차

| ID | EARS 문장 | 재현 절차 → 기대 출력 |
|---|---|---|
| AC-1 | When 관리자가 `python3 scripts/fetch_snapshot.py`를 실행하면, the system shall serviceList·serviceDetail·supportConditions 세 오퍼레이션의 전 페이지를 받아 `data/snapshot.json`에 기준일·수집시각·건수를 포함해 저장한다. | 실행 후 `python3 -c "import json;d=json.load(open('data/snapshot.json'));print(d['meta']['fetched_at'],len(d['services']))"` → ISO 시각과 10,000 이상 정수 |
| AC-2 | If 인증 오류(-401/-4/-3)가 나면, the system shall 오류 코드별 원인 유형과 조치 문장(예: `-4` → "활용신청 목록에 15113968이 있는지 확인")을 출력하고 종료코드 1로 끝내며 키 값을 출력하지 않는다. | `DATA_GO_KR_SERVICE_KEY=INVALIDKEYTEST123 python3 scripts/check_key.py; echo rc=$?` → 세 방식 모두 HTTP 401 `-4` 표시, 마지막에 `원인: 미등록 키 …` 조치 문장, `FAIL`, rc=1, `grep -c INVALIDKEYTEST123` → 0 |
| AC-3 | When 수신 건수·totalCount·고유 서비스ID 수 중 하나라도 다르면, the system shall `data/meta.json`에 `count_check:"FAIL"`을 쓰고 기존 snapshot을 덮어쓰지 않는다. | 단위 테스트 `python3 -m unittest tests/test_fetch.py -k count` → OK |
| AC-4 | When 사용자가 조건을 하나도 넣지 않고 검색하면, the system shall 전체를 미확정으로 표시하고 검색을 막지 않는다. | 브라우저: 빈 폼 검색 → 요약에 "미확정 N건 = 전체 N건" |
| AC-5a | When 사용자가 신청자 유형 개인을 고르면, the system shall `사용자구분`이 법인/시설/단체·소상공인 단독인 사업을 제외 목록에 사유와 함께 둔다. | `node --test tests/filter.test.mjs` 의 `userType` 케이스 통과 + 브라우저 표본 5건 확인 |
| AC-5b | When 사용자가 시도를 고르면, the system shall 해당 시도 사업과 전국 사업을 일치에, 시도 식별 불가 사업을 미확정에 둔다. | `node --test` 의 `region` 케이스 통과 |
| AC-5c | If 조건 항목에 대응 데이터가 없으면, the system shall 그 항목을 판정불가로 두고 사업을 제외하지 않는다. | `node --test` 의 `unknown` 케이스 통과 |
| AC-6 | When 결과가 표시되면, the system shall 상단에 적용 조건·전체·일치·미확정·제외 건수를 표시하고 세 건수의 합이 전체와 같아야 한다. | 브라우저 요약 줄 확인 · `node --test` 의 `sum` 케이스 |
| AC-7 | When 사용자가 사업을 열면, the system shall 제공 기관·원문 URL·기준일·수집 시각과 항목별 일치/미확정/불일치 배지를 표시한다. | 브라우저 상세 패널 육안 확인 · 스크린샷 보관 |
| AC-8 | The system shall 결과 목록과 상세에 "조건에서 걸러지지 않은 목록일 뿐 지급·자격을 보장하지 않으며 최종 판단은 담당 기관이 한다"는 문구를 닫기 버튼 없이 고정 표시한다. | 브라우저 콘솔 `document.querySelectorAll('.disclaimer').length` ≥ 2 이고 각 요소에 닫기 버튼 없음(문구는 app.js가 렌더링하므로 정적 grep은 1건만 잡힌다) |
| AC-9 | When 사용자가 저장을 누르면, the system shall 브라우저 로컬 저장소에 기록하고 새로고침 후에도 관심 목록에 남긴다. | 브라우저: 저장 → 새로고침 → 관심 탭에 존재 |
| AC-10 | When 2~4개를 선택해 비교를 누르면, the system shall 공통 필드를 열로 나란히 표시한다. | 브라우저 확인 · 5개째 선택 시 안내 |
| AC-11 | When 관심 사업의 구비서류가 있으면, the system shall 항목별 체크리스트를 보여주고 체크 상태와 진행 상태(관심/준비 중/신청 완료/확인 필요)를 로컬에 저장한다. | 브라우저 확인 · 새로고침 유지 |
| AC-12 | When 새 스냅샷이 직전과 다르면, the system shall `data/changes.json`에 신규/변경/소멸 목록을 쓰고 변경 페이지에 표시한다. | 단위 테스트 `test_diff` · Actions 2회 실행 후 변경 페이지 확인 |
| AC-13 | Before 배포하기 전에, the system shall `public/` 전체에서 키 문자열(원문·URL인코딩)이 0건이고 `public/`의 코드 파일과 배포 URL의 `app.js` 응답에서 `odcloud` 호출 코드가 0건임을 검사하고 발견 시 배포를 중단한다. | `bash scripts/verify_no_key.sh; echo rc=$?` → `OK` rc=0 · 배포 후 `curl -s <URL> \| grep -c odcloud` → 0 |
| AC-14 | When main에 push되면, the system shall Actions로 Pages에 배포하고 고정 URL에서 조건 입력 화면이 열린다. | `gh run list --workflow=deploy.yml` success · `curl -sI <URL>` → 200 |
| AC-15 | The system shall 375px 폭에서 가로 스크롤 없이 조건 입력과 목록을 표시한다. | 브라우저 모바일 프리셋 스크린샷 · `document.documentElement.scrollWidth <= 375` |

---

## 7. 실행 계획

### 7.1 파일 구성

| 경로 | 역할 | 배포 대상 |
|---|---|---|
| `.env.example` / `.env` | 키 자리(.env는 gitignore) | 아니오 |
| `scripts/check_key.py` | 키 유효성·방식 판정 (T0, 작성 완료) | 아니오 |
| `scripts/fetch_snapshot.py` | 전량 수집 · 정규화 · 건수 대조 · diff · meta (T1) | 아니오 |
| `scripts/verify_no_key.sh` | 배포물 키 부재 검사 (T7) | 아니오 |
| `tests/test_fetch.py` | 수집 로직 단위 테스트(네트워크 없이 픽스처) | 아니오 |
| `tests/filter.test.mjs` | 필터 규칙 단위 테스트(node --test) | 아니오 |
| `public/index.html` | 화면(조건 폼·목록·상세·관심·비교·변경·상태 탭) | 예 |
| `public/app.js` | 화면 로직·로컬 저장 | 예 |
| `public/filter.js` | 순수 판정 함수(브라우저·node 공용) | 예 |
| `public/regions.js` | 시도 별칭표 | 예 |
| `public/data/snapshot.json` `meta.json` `changes.json` | 산출물(Actions가 갱신·커밋) | 예 |
| `.github/workflows/deploy.yml` | push 시 검사 후 Pages 배포 | — |
| `.github/workflows/refresh.yml` | 매일 KST 06:00 수집→diff→커밋→배포 트리거 | — |
| `docs/PLAN.md` `RUBRIC.md` `EVAL-*.md` `HOWTO.md` | 계획·채점·비개발자 절차 | 아니오 |

### 7.2 작업 순서와 명령

| 순서 | 작업 | 명령 | 의존 |
|---|---|---|---|
| T0 | 키 판정 | `cd ~/gov24-filter && python3 scripts/check_key.py` | 사용자가 `.env` 채움 |
| T1 | 수집 스크립트 + 테스트 | `python3 -m unittest discover -s tests -p "test_*.py"` → `python3 scripts/fetch_snapshot.py` | T0 PASS. **PASS 전에는 `tests/fixtures/sample_snapshot.json`(공개 저장소 benefit-alarm의 실데이터 30건 발췌 `[확인]`)으로 화면 작업을 진행** |
| T2 | filter.js + 테스트 | `node --test tests/filter.test.mjs` | 없음 |
| T3 | 화면 P1 | `python3 -m http.server 8080 -d public` 후 브라우저 확인 | T2 |
| T4 | 화면 P2(저장·비교·서류·상태) | 같은 서버 | T3 |
| T5a | 워크플로 파일 작성 | `.github/workflows/deploy.yml`(push→테스트→키검사→Pages), `.github/workflows/refresh.yml`(매일 21:00 UTC→수집→검사→커밋→Pages). 검증: `python3 -c "import yaml;[yaml.safe_load(open(f)) for f in ['.github/workflows/deploy.yml','.github/workflows/refresh.yml']]"` | 없음(작성 완료 `[확인]` EVIDENCE §E-2) |
| T5b | 저장소 생성 · Pages 활성화 | 먼저 `gh repo view kr80hwlee-bit/gov24-filter` 로 존재 여부 확인. 없으면 `git init -b main && git add -A && git commit -m init && gh repo create kr80hwlee-bit/gov24-filter --public --source=. --push`, 이미 있으면 remote 추가 후 main 업로드만. Pages는 `gh api -X POST repos/kr80hwlee-bit/gov24-filter/pages -f build_type=workflow`(이미 켜져 있으면 422 "already exists"를 정상으로 본다). 두 명령 모두 재실행해도 안전하다 `[결정]` | T5a, T7 |
| T6 | 변경 페이지·상태 페이지(P3) | 브라우저 확인 | T1 diff |
| T7 | 키 부재 검사 | `bash scripts/verify_no_key.sh` | T1 산출물 |
| T8 | 사용자 단계: Secret 등록 | 사용자가 실행: `gh secret set DATA_GO_KR_SERVICE_KEY --repo kr80hwlee-bit/gov24-filter` (프롬프트에 붙여넣기) | T5 |
| T9 | 배포 확인 | `gh run watch` → `curl -sI https://kr80hwlee-bit.github.io/gov24-filter/` | T5, T8 |

키가 없을 때의 경로: T1은 픽스처로 테스트만 통과시키고, 화면은 픽스처 스냅샷으로 완성한다. 실데이터 스냅샷은 T0 PASS 후 T1 실행으로 교체한다. 그 전까지 배포된 화면은 상단에 "표본 데이터(30건) 기준일 …"을 표시한다 `[결정]`.

---

## 8. 리스크 · 가정 · 데이터공백

| ID | 항목 | 상태 | 대응 |
|---|---|---|---|
| R-1 | 사용자의 기존 인증키가 15113968 활용신청에 연결돼 있는지 | `[데이터공백]` | T0 check_key로 판정. -4면 활용신청 절차(HOWTO §1) 안내 |
| R-2 | 지역 전용 필드 부재 → 시도 미확정 비율 | `[확인]` 부재 / 비율 `[데이터공백]` | §5.3 규칙, 20% 초과 시 T1-b |
| R-3 | supportConditions 조인 누락(서비스ID 없는 건) | `[데이터공백]` | 조인 실패 건은 연령·소득·가구 항목을 판정불가로 |
| R-4 | 신청기한이 자유 텍스트 | `[확인]` sole-search | 상시/기간(YYYY-MM-DD 추출 가능)/불명 3분류. 마감 임박은 기간형만 |
| R-5 | API 규격 변경 | 상존 | 첫 페이지 필드 21종 검사, 누락 시 fail-closed |
| R-6 | 스냅샷 크기(경량 3.8MB+조건 3.1MB) 모바일 부담 | `[추정]` gzip 후 1MB 안팎 | 실측 후 6MB 초과 시 조건 파일 지연 로드로 분리 |
| R-7 | Pages 공개 저장소에 데이터 공개 | 수용 | 공공데이터·화면 코드만. 키는 Secret |
| R-8 | 일일 한도 | 66~69회/일(세 오퍼레이션 합산, 재시도 3회 최악 시 ×4 = 276회, 2.8%) | 호출마다 계수 파일 갱신, 8,000회(80%) 도달 시 경고·중단. 여유가 커서 임계는 보수적으로 둔다 |
| R-9 | 서버 없는 P3에서 알림 발송 불가 | 범위 밖 | 변경 페이지로 대체. 후속: GitHub Issue 자동 생성 또는 이메일 Action |
| R-10 | Manyfast 미결 질문 22건 | 아래 표 |

### 8.1 Manyfast 미결 질문의 이번 세션 처리 `[결정]`

| 질문 | 이번 값 | 근거 |
|---|---|---|
| 수집 주기 | 매일 1회 06:00 KST | Actions cron |
| 재시도 | 3회, 지수 백오프 | 일시 오류 |
| 스냅샷 보관 | git 이력(사실상 전부) | Pages 저장소 |
| 저장 형식 | JSON 파일 | 빌드 없음 |
| 오래됨 기준 | 7일 | 안내 표시 |
| 조건 항목 세트 | 지역·신청자유형·연령·성별·소득구간·가구특성·사업자상태·분야·키워드 | 영상 "조건 여섯 줄"+지원조건 코드 |
| 지역 단위 | 시도 | 시군구 식별 불가 `[확인]` |
| 필터 실행 위치 | 브라우저 | 정적 |
| 페이지 방식 | 더보기 버튼(50건씩) | 단순 |
| 자동 통합 | 서비스ID 완전 일치만 | 유사 통합 제외 |
| 안내 문구 | Manyfast 옵션 1 | 권고안 |
| 로그인 | 없음(로컬만) | P3 잔여 |
| 비교 최대 | 4개 | 권고안 |
| 알림 채널·기본값·상한 | 제외 | 서버 필요 |
| 마감 임박 기준 | 7일·1일 표시 | 페이지 배지 |
| 신규 매칭 나열 | 5건 | 변경 페이지 |
| 변경 감지 필드 | 상태·신청기한·지원내용·지원대상·구비서류 | 옵션 2 |
| 서류 분리 기준 | 줄바꿈·쉼표 | 자동 |
| 진행 상태 값 | 4개 | 옵션 1 |
| 배포 플랫폼 | GitHub Pages | Director 승인 |
| 모바일 기준 폭 | 768px | 권고안 |
| 한도 경고 | 80% | 권고안 |

---

## 9. 검증 · 오류점검 계획

### 9.1 단계별 검증
| 단계 | 방법 | 통과 기준 | 증거 보관 |
|---|---|---|---|
| T1 | `unittest` 픽스처(정상·건수불일치·오류코드·diff) | 전부 OK | `docs/EVIDENCE.md`에 명령·rc 기록 |
| T1 실행 | 실데이터 수집 | meta.count_check=PASS, 지역 미확정 비율 보고 | meta.json |
| T2 | `node --test` | 전부 pass | 같은 파일 |
| T3~T4·T6 | 브라우저(데스크톱 1280·모바일 375) | AC-4~AC-12 육안+콘솔 오류 0 | 스크린샷 |
| T7 | `verify_no_key.sh` | OK rc=0 | 같은 파일 |
| T9 | 배포 URL curl·모바일 | 200·AC-15 | 같은 파일 |

### 9.2 검수 분리
- 작성자(cla)와 채점자(별도 rubric-evaluator 에이전트, sonnet)를 분리한다. 코드 완성 후 별도 reviewer 에이전트가 AC 표를 재현한다. 작성자 자기 판정으로 종결하지 않는다.
- 독립 재현 현황 `[확인]` (채점자 = EVAL-2 · 검수자 = REVIEW-1, 둘 다 작성자와 다른 인스턴스):

| AC | 작성자 실행 | 채점자 독립 재현(EVAL-2) | 검수자 독립 재현(REVIEW-1) | 비고 |
|---|---|---|---|---|
| AC-1 | 픽스처 모드만(E-5) | — | — | 실데이터는 사용자 키 필요(T0) |
| AC-2 | E-4 | 재현 PASS | 재현 PASS | |
| AC-3 | E-5 | unittest 35 PASS | unittest PASS + 문자열 totalCount 결함 적발(N) → 수정·회귀 테스트 추가(E-7) |
| AC-4 | E-6 | — | 브라우저 없음, 미검증 | 작성자 브라우저 실행만 |
| AC-5a/b/c | E-6 | node --test PASS | node import 로 경계값 7종 PASS | |
| AC-6 | E-6 | node --test PASS(합 불변식) | 불변식 우회 시도 실패(=통과) | |
| AC-7 | E-6 | — | 정적 검사: href 스킴 미검증 결함 적발(N) → safeHref 추가(E-7) | 렌더링은 작성자만 |
| AC-8 | E-6 | — | 정적 HTML: disclaimer 4개·닫기 버튼 없음 확인 | |
| AC-9~11 | E-6 | — | 브라우저 없음, 미검증 | localStorage 상호작용 |
| AC-12 | diff 단위 테스트(E-5) | unittest PASS | None↔"" 오탐 적발(N) → 수정·회귀 테스트(E-7) | Actions 실행은 Secret 등록 후 |
| AC-13 | E-5 | verify_no_key OK | 가짜 키 주입 → FAIL 검출 확인 후 원상복구 | |
| AC-14 | E-8(run success · URL 200) | — | — | Secret 등록 후 refresh 도 확인 |
| AC-15 | E-6(371px) | — | 브라우저 없음, 미검증 | |

- 미검증으로 남은 AC-4·9·10·11·15는 작성자 브라우저 실행 증거(E-6)만 있다. Director 또는 브라우저가 있는 검수 세션이 재현하기 전까지 "작성자 단독 확인"으로 표기한다 `[결정]`.

### 9.3 키 부재 검사(verify_no_key.sh)
1. `.env`에서 키를 읽어 `public/` 전 파일에 원문·URL인코딩 형태가 0건인지 `grep -rF`로 검사한다(키는 출력하지 않는다).
2. `public/`의 코드 파일(`*.html` `*.js` `*.css`)에 `odcloud.kr`·`serviceKey` 문자열이 0건인지 검사한다(브라우저가 API를 부르지 않음의 증거). `public/data/*.json`은 이 검사에서 제외한다 — `meta.source`가 출처 표기로 `api.odcloud.kr` 문자열을 담기 때문이며, 1단계 원문 키 검사는 JSON을 포함한 `public/` 전체에 적용한다 `[결정]`.
3. 하나라도 발견되면 rc=1로 종료하고 워크플로가 배포를 중단한다.

### 9.4 롤백
- 스냅샷: 승격 실패 시 직전 파일 유지(§5.2). 배포: Pages는 이전 성공 배포가 남으므로 `git revert` 후 push.

---

## 10. 비개발자 실행 절차 (요약, 상세는 `docs/HOWTO.md`)

**본인만 할 수 있는 단계(굵게)**
1. **data.go.kr 로그인 → 검색창에 `15113968` → "활용신청" → 활용목적 입력 → 자동승인 확인 → 마이페이지 > 오픈API > 인증키 발급현황에서 "일반 인증키(Decoding)" 복사.**
2. **`~/gov24-filter/.env.example`을 `.env`로 복사하고 키를 붙여넣기.**
3. 터미널에서 `python3 scripts/check_key.py` → `PASS`면 다음.
4. `python3 scripts/fetch_snapshot.py` → `data/` 산출물 생성.
5. **GitHub 저장소에 Secret 등록: `gh secret set DATA_GO_KR_SERVICE_KEY --repo kr80hwlee-bit/gov24-filter`** (붙여넣기 프롬프트).
6. (전제: §7.2 T5b에서 저장소가 만들어져 있고 `gh auth status`가 로그인 상태다. 처음이면 HOWTO §4-1을 먼저 한다.) `git add -A && git commit -m "snapshot" && git push` → 1~2분 뒤 `https://kr80hwlee-bit.github.io/gov24-filter/` 접속.
7. 폰에서 같은 주소 열어 확인. 링크를 남에게 보내면 그 사람도 자기 조건으로 쓴다.
