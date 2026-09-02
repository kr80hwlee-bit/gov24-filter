# EVAL-2 — docs/PLAN.md(v2) 독립 채점 (2회차)

채점 대상: `/Users/ttaeng-guli80/gov24-filter/docs/PLAN.md` @ 워킹트리 — 재현 불가(`git rev-parse HEAD` → `fatal: not a git repository`, 레포 미초기화). 고정용: `sha256:c6a1f07bc9aa91e311ad25506e440adaf673a88d8e07e45dfb8ac57d02c4f897` (mtime 2026-09-02 23:14:12 KST), 채점 시각 2026-09-02T14:18:35Z UTC
루브릭: `/Users/ttaeng-guli80/gov24-filter/docs/RUBRIC.md` @ `sha256:6ba7148034feb9e1cf6505fed02db9c5d70edb4bd00395f3064c8d7d705db413` — EVAL-1 인용 해시와 일치, 드리프트 없음
채점자: rubric-evaluator 서브에이전트(2회차 독립 인스턴스, 1회차 채점자·작성자 cla 모두와 분리)
1회차 대비: `docs/EVAL-1.md` 86.9/100 FAIL(항목 1,2,3,7,8 미달) → 이번 회차 재검

## 재현 실행 로그 (본 채점자 독립 실행)
- `python3 -m unittest discover -s tests -p "test_*.py"` → `Ran 35 tests … OK`, rc=0
- `node --test tests/filter.test.mjs` → `pass 25 / fail 0`, rc=0
- `bash scripts/verify_no_key.sh` → `OK`(.env 부재로 1단계 안내 건너뜀), rc=0
- `DATA_GO_KR_SERVICE_KEY=INVALIDKEYTEST123 python3 scripts/check_key.py` → 3방식 HTTP 401 `-4` → `FAIL` + `원인: 미등록 키 — … 활용신청 현황에 15113968 이 있는지 확인 …`, rc=1
- `curl -s https://infuser.odcloud.kr/api/stages/44436/api-docs` 직접 재조회 → serviceDetail_model 필드에 `행정규칙 자치법규 법령` 3개 존재 확인, serviceList_model 21필드 정확히 일치
- `find` 실측: `scripts/{check_key,fetch_snapshot,verify_no_key.sh}` · `tests/{test_fetch.py,filter.test.mjs}` · `public/{index.html,app.js,filter.js,regions.js,styles.css,data/*.json}` · `.github/workflows/{deploy,refresh}.yml` 전부 실재(1회차 때는 `check_key.py` 1개뿐이었음)
- `python3 -m http.server` 기동 후 `curl` → index/snapshot 200, `app.js`에 `odcloud`/`serviceKey` 문자열 0건
- `grep -c` 로 Manyfast ID 38종 전수 대조 → 전부 RTM에 등장
- `python3` 재계산: ceil(11001/500)=23×3=69, ceil(10999/500)=22×3=66 → PLAN의 "66~69회" 일치, 최악 재시도 ×4=264~276회(2.64~2.76%)→PLAN "2.8%"와 일치

## 항목별 판정

| # | 항목 | 배점 | 점수 | 근거(줄) | 미달 사유 | 시정 지시 |
|---|---|---|---|---|---|---|
| 1 | 목표·범위 | 100 | 92 | L11(목표 한문장) / L15-20(§1.1, P1/P2/P3 각각 EVIDENCE E-4~E-6 인용해 "완성"과 "미완"(실데이터 T0·GitHub 배포 T5b/T9)을 구분) / L22-27(범위밖 긍정형) | 1회차 결함(무근거 "완성" 단정)은 해소됐으나, L17의 "화면 AC-4~8·13·15 재현" 근거인 EVIDENCE E-6가 **작성자 단독 실행**(채점자 독립 재현 대기라고 스스로 표기하지 않음)이라 본 채점자는 disclaimer 개수·키 미노출·서버 200만 재확인했고 AC-6·9·10·11 등 브라우저 상세 동작은 재현하지 못함 | §1.1 "재현"을 "작성자 실행(채점자 독립 재현 대기)"로 표기해 근거 신뢰수준을 스스로 낮출 것 |
| 2 | 데이터 출처·API 규격 근거 | 100 | 90 | L45(serviceDetail 3필드, 근거를 연구보고서 대신 EVIDENCE E-1 직접 조회로 재귀속 — `curl` 재조회로 본 채점자가 독립 재확인) / L38·L42·L44·L47-48(Base URL·응답봉투·21필드·값분포 전부 연구원문·재조회와 일치) | 1회차 최대 결함(L45 근거 날조 의심)은 해소. 다만 L41 "perPage=500 동작 `[확인]`(bid-collectors/sole-search 실사용)"은 부정확 — `research_api_spec.md`에 따르면 perPage=500 실사용은 sole-search만이고 bid-collectors는 perPage=100(`research_oss_deploy.md` A-2). 두 저장소를 병기해 근거를 부풀림 | L41에서 "bid-collectors/"를 빼고 "sole-search 실사용"만 남길 것 |
| 3 | 아키텍처 적합성 | 100 | 95 | L58-70(다이어그램) / L72("66~69회…0.7%" — `python3` 재계산으로 3오퍼레이션 합산이 정확함을 확인, 1회차의 절반 과소계산 결함 해소) / L73-75(키 비노출 경로, `grep`으로 public/app.js·filter.js에 odcloud·serviceKey 0건 확인) | 결함 없음 | 없음(유지) |
| 4 | 요구사항 추적성 | 100 | 97 | L83-112(RTM) — 정본 38개 ID 전수 `grep -c` 재대조, 전부 1회 이상 매핑 확인. L106·L108 제외 처리 명시 | 결함 없음(S-YEGRVS/S-WVUNJJ 1행 병기는 N:1로 허용범위) | 없음(유지) |
| 5 | 함정 대응 설계 | 100 | 95 | L118-138 — 4개 함정 전부 필드·판정값·검증방법 구체. 1회차와 동일 내용, 결함 재확인 안 됨 | 결함 없음 | 없음(유지) |
| 6 | 수용기준 검증가능성 | 100 | 96 | L146-162(AC-1~15 EARS+재현명령) / AC-2(L147) 독립 재현: `DATA_GO_KR_SERVICE_KEY=INVALIDKEYTEST123 python3 scripts/check_key.py` → "원인: 미등록 키 …" 코드별 조치 문장 실제 출력 확인 — 1회차 결함(서술과 코드 불일치) 해소 | AC-9~12·14 등 localStorage·배포 관련 AC는 브라우저/실배포 필요라 이번 재현에서 미검증(구조는 존재, 실행 확인 못 함) | 다음 회차에서 `--test-reporter` 또는 jsdom 기반 자동화로 AC-9~11(localStorage)도 CI에 편입할 것 |
| 7 | 실행 계획 구체성 | 100 | 93 | L189-201(T0~T9, T5a/T5b로 분리 — 1회차 결함 해소) / L192(T1 픽스처 경로) / `.github/workflows/*.yml` 실재+`yaml.safe_load` 통과(E-2) | T5b의 `gh repo create … --push`가 저장소 기존 존재 시 실패할 수 있는데, 그 idempotency 안내는 `docs/HOWTO.md` §4-1에만 있고 PLAN §7.2 표 자체에는 없음(문서 간 정보 분리) | T5b 셀에 "(이미 있으면 건너뜀, HOWTO §4-1)" 한 줄을 추가할 것 |
| 8 | 리스크·가정·데이터공백 | 100 | 93 | L209-247(R-1~R-10, §8.1 22행) — `sed`+`grep`로 24줄(헤더 2줄 제외 22행) 재확인. R-8(L218) "66~69회…2.8%"이 항목3과 일관되게 정정됨(1회차 결함 해소) | 결함 없음(경미하게 R-6 "gzip 후 1MB 안팎" 실측 전이라 `[추정]` 태그로 남아있는 점은 정직한 처리이므로 감점 대상 아님) | 없음(유지) |
| 9 | 검증·오류점검 계획 | 100 | 93 | L253-272(9.1~9.4) / `verify_no_key.sh` 실재+실행 rc=0 확인(1회차엔 파일 자체가 없었음) / §9.3 서술(L268, 1단계는 public/ 전체·2단계는 data/ 제외)이 스크립트 실제 로직과 정확히 일치 | T3~T4·T6의 브라우저 검증(AC-4~12)이 EVIDENCE E-6 한 차례(작성자 실행)뿐이고 §9.2가 선언한 "별도 reviewer 에이전트가 AC 표를 재현"이 아직 이 문서 시점까지 실행되지 않음(이번이 그 실행이나 전체 AC는 재현 못 함) | §9.2에 "reviewer 재현 대상 AC 목록과 완료 여부"를 표로 추가할 것 |
| 10 | 비개발자 실행 가능성 | 100 | 96 | L275-285 — 6단계에 git 인증 전제 문구 추가(1회차 결함 해소, "§7.2 T5b에서 저장소가 만들어져 있고 gh auth status가 로그인 상태다") / `docs/HOWTO.md` 존재, 본인만 가능한 단계 굵게 일치 | 결함 없음 | 없음(유지) |

## 자동 반려 검사
RUBRIC.md에 별도 자동 반려 조항 없음. 통과선("모든 항목≥90 AND 평균≥95")으로 검사: 전 항목 90 이상이나 평균 미달.

## 총점 계산 (Bash 실측)
```
scores = [92, 90, 95, 97, 95, 96, 93, 93, 93, 96]
sum = 940
평균 = 94.0
```

총점: 94.0 / 100
판정: **FAIL** (전 항목 ≥90 이나 평균 94.0 < 95)

## 1회차 대비 변화
- 86.9 → 94.0 (+7.1). 1회차가 지적한 5개 미달 항목(1,2,3,7,8) 전부 90 이상으로 개선, 근거 있는 재현으로 확인.
- 단, 새 세부 결함 3건(항목2 perPage 출처 병기 부정확 · 항목7 T5b idempotency 문서 분리 · 항목9 §9.2 reviewer 재현 목록 미표) 이 평균을 95 미만에 묶어둠.

## 가장 큰 감점 3건
1. 항목 2 — L41 "perPage=500 동작(bid-collectors/sole-search 실사용)"에서 bid-collectors는 실제로 perPage=100을 쓴다(`research_oss_deploy.md` A-2). 근거 병기가 부정확.
2. 항목 9 — §9.2가 선언한 "별도 reviewer 에이전트가 AC 표를 재현"이 이 문서 시점까지 AC-9~12·14 등 브라우저/배포 계열에서 미이행(EVIDENCE E-6는 작성자 단독 실행).
3. 항목 7 — T5b `gh repo create` 의 재실행 안전성(이미 존재 시 처리)이 PLAN 본문이 아니라 HOWTO.md에만 있어 실행 계획 문서 자체의 자기완결성이 약함.

## 다음 라운드에서 반드시 고칠 것
1. L41에서 perPage=500 근거를 sole-search 단독으로 정정(bid-collectors 제거 또는 "100" 수치로 별도 병기).
2. §9.2에 reviewer 독립 재현 대상 AC와 완료/미완료를 표로 명시.
3. T5b 셀에 저장소 기존 존재 시 처리(idempotency)를 PLAN 본문에도 명시.
4. §1.1 "재현" 표기를 "작성자 실행"과 "채점자 독립 재현"으로 구분 표기.
