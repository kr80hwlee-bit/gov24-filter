# 증거 대장 (명령 · 종료코드 · 시각)

기록 규칙: 명령 원문, rc, UTC 시각, 관찰 결과만 적는다. 키 값·개인정보는 적지 않는다.

## E-1. Swagger 원문 조회 (2026-09-02, WebFetch)
- URL: https://infuser.odcloud.kr/api/stages/44436/api-docs
- 관찰: paths = `/gov24/v3/serviceList`, `/gov24/v3/serviceDetail`, `/gov24/v3/supportConditions`
- serviceList model 21필드: 서비스ID 지원유형 서비스명 서비스목적요약 지원대상 선정기준 지원내용 신청방법 신청기한 상세조회URL 소관기관코드 소관기관명 부서명 조회수 소관기관유형 사용자구분 서비스분야 접수기관 전화문의 등록일시 수정일시
- serviceDetail model: 서비스ID 지원유형 서비스명 서비스목적 신청기한 지원대상 선정기준 지원내용 신청방법 구비서류 접수기관명 문의처 온라인신청사이트URL 수정일시 소관기관명 **행정규칙 자치법규 법령** 공무원확인구비서류 본인확인필요구비서류
- supportConditions model: JA0101 남성 · JA0102 여성 · JA0110/JA0111 대상연령 시작/종료 · JA0201~05 중위소득 5구간 · JA03xx 대상 특성 · JA04xx 가구 · JA11xx 사업자 상태 · JA12xx 업종 · JA21xx 법인 유형 · JA22xx 업종 · 서비스명
- security: ApiKeyAuth(header) · ApiKeyAuth2(query)
- 재현: `curl -s https://infuser.odcloud.kr/api/stages/44436/api-docs | python3 -c "import json,sys;d=json.load(sys.stdin);print(list(d['paths']))"`

## E-2. 워크플로 YAML 문법 검증 (2026-09-02)
```
python3 -c "import yaml;[yaml.safe_load(open(f)) for f in ['.github/workflows/deploy.yml','.github/workflows/refresh.yml']]"
```
- 결과: `yaml ok deploy.yml` · `yaml ok refresh.yml` · rc=0

## E-3. check_key.py 오류 경로 재현 (채점자 독립 재현, EVAL-1)
```
DATA_GO_KR_SERVICE_KEY=INVALIDKEYTEST123 python3 scripts/check_key.py; echo rc=$?
```
- 결과: 세 방식 모두 HTTP 401 `{"code": -4}` · `FAIL` · rc=1 · 출력에 키 문자열 0건

(이하 구현 단계에서 추가)

## E-4. check_key.py 코드별 조치 문장 재현 (2026-09-02, 작성자 실행 — 채점자 재현 대기)
```
DATA_GO_KR_SERVICE_KEY=INVALIDKEYTEST123 python3 scripts/check_key.py; echo rc=$?
```
- 결과: 세 방식 HTTP 401 `{"code": -4}` → `FAIL` + `원인: 미등록 키 — … 활용신청 현황에 15113968 이 있는지 확인 …` · rc=1
- `… | grep -c INVALIDKEYTEST123` → `0` (키 문자열 미출력)

## E-5. 수집 로직 단위 테스트·키 검사·픽스처 스냅샷 (2026-09-02T14:05:50Z, 작성자 재현)
```
python3 -m unittest discover -s tests -p "test_*.py"   # Ran 35 tests … OK, rc=0
bash scripts/verify_no_key.sh                            # OK, rc=0 (.env 부재로 1단계 건너뜀 안내)
python3 scripts/fetch_snapshot.py --from-fixture tests/fixtures/sample_raw.json
```
- snapshot.json meta: total_count=30 received=30 unique_ids=30 count_check=PASS region_unresolved_ratio=0.1333 sample=true
- 크기: snapshot.json 101,943 B · meta.json 337 B · changes.json 135 B
- 픽스처 출처: 공개 저장소 shoo99/benefit-alarm(gh-pages) 실데이터 30건을 공식 raw 봉투 형태로 재구성(부재 필드는 합성, 픽스처 `_source_note` 참고)

## E-6. 화면 통합 검증 (2026-09-02 14:15Z, 로컬 `python3 -m http.server 8090 -d public`, 브라우저 폭 371px)
- `node --test tests/filter.test.mjs` → pass 25 / fail 0 · `node --check public/{app,filter,regions}.js` → rc=0
- 조건 없음(기본 개인) 검색: `적용 조건 · 전체 30 · 일치 27 · 미확정 0 · 제외 3` (합 30)
- 지역=서울·개인: `전체 30 · 일치 12 · 미확정 4 · 제외 14` (합 30, 미확정 4 = 시도 미식별 4건 → AC-5b/5c)
- `.disclaimer` 요소 4개, 닫기 버튼 0 (AC-8) · 상세 패널 열림, 출처 링크 `rel=noopener` 2개, 기준일·수집 시각 표시 (AC-7)
- 저장 2건 → 관심 탭에 진행 상태 4값·구비서류 체크리스트 표시, localStorage 키 `gov24filter:saved` (AC-9, AC-11)
- 비교 2건 → 비교 표 렌더링 (AC-10) · 변경 사항 탭: 신규/변경/소멸 0건 표시 (AC-12 표시부) · 데이터 상태 탭: count_check PASS·지역 미확정 13.3%
- `document.documentElement.scrollWidth`=356 ≤ innerWidth 371 (AC-15)
- 수정한 결함: ① 지난 마감일에 `D-1이하` 배지 → `마감 지남`으로 분기(filter.js) ② `#business-group[hidden]`이 CSS에 눌려 보임 → `[hidden]{display:none!important}` 추가(styles.css) ③ `node --test tests/`가 Node 22에서 디렉터리를 모듈로 해석해 실패 → 워크플로·계획을 `tests/filter.test.mjs` 명시로 수정

## E-7. REVIEW-1 지적 4건 수정 후 재검 (2026-09-02 14:35Z, 작성자 실행)
- 수정: count_check 정수 정규화 · diff_snapshots None/빈문자열 동치 · app.js safeHref(http/https 만 링크) · tests/filter.test.mjs 커밋
- `python3 -m unittest discover -s tests -p "test_*.py"` → Ran 37 tests OK (회귀 2건 추가) · `node --test tests/filter.test.mjs` → pass 26 · `node --check public/app.js` → rc=0 · `verify_no_key.sh` → OK

## E-8. GitHub 배포 (2026-09-02 14:23~14:27Z, 작성자 실행)
- `gh repo create kr80hwlee-bit/gov24-filter --public --source=. --push` → rc=0, origin/main = 16c3ec7
- `gh api -X POST repos/kr80hwlee-bit/gov24-filter/pages -f build_type=workflow` → rc=0, html_url=https://kr80hwlee-bit.github.io/gov24-filter/
- deploy-pages run 33641707853 → `completed success`(테스트 35/26·키 검사 OK 단계 포함)
- `curl -sI https://kr80hwlee-bit.github.io/gov24-filter/` → HTTP/2 200 (AC-14)
- `curl -s …/gov24-filter/app.js | grep -c odcloud` → 0 (AC-13 배포 URL 부분)
- 브라우저(371px)에서 배포 URL 로드: 서울·개인 검색 `전체 30 · 일치 12 · 미확정 4 · 제외 14`, disclaimer 4, 콘솔 오류 0, 가로 스크롤 없음 → 로컬과 동일
- 미완: Secret 미등록 상태라 refresh-snapshot 은 아직 실행하지 않음(사용자 T8 후)
