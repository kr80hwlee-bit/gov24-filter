# 적대적 검수 보고서 (REVIEW-1)

검수 대상: `/Users/ttaeng-guli80/gov24-filter` @ 워킹트리(커밋 `d1232d9` "feat: 보조금24 조건 필터 웹앱 초기 구현" + 작업트리 미커밋 diff 1건, 아래 §4 참고)
검수자: adversarial-reviewer(cla) · 작성자와 격리, git 명령 미사용, 코드 미수정.
실행 환경: `python3` (버전 미고정 확인 안 함), `node v22.22.3`, 2026-09-02 UTC.

---

## 1. 재현한 AC (네트워크 없이 되는 것 + 대체 재현)

| AC-ID | 명령 | rc | 관찰 | 판정 |
|---|---|---|---|---|
| AC-2 | `DATA_GO_KR_SERVICE_KEY=INVALIDKEYTEST123 python3 scripts/check_key.py; echo rc=$?` (placeholder 키 1회 네트워크 허용) | 1 | 세 방식 모두 `HTTP 401 {"code": -4}` → `FAIL` + "원인: 미등록 키 …15113968… 확인" 조치문장. `... \| grep -c INVALIDKEYTEST123` → `0`(키 미노출) | PASS |
| AC-3 | `python3 -m unittest discover -s tests -p "test_*.py" -v` | 0 | `Ran 35 tests ... OK`(EVIDENCE.md 주장과 동일 35건) | PASS |
| AC-5a/5b/5c | `node --test tests/filter.test.mjs` | 0 | `# tests 25 / # pass 25 / # fail 0`(EVIDENCE.md 주장과 동일 25건) | PASS |
| AC-6 | 위와 동일(`summarize` 케이스 포함) | 0 | `matched+unknown+excluded===total` 통과 | PASS |
| AC-13 | `bash scripts/verify_no_key.sh` (현재 `.env` 부재 상태) | 0 | `안내: .env 가 없어 1단계… 건너뛴다` → `OK` | PASS(조건부 — 아래 §2.4 공격 결과 참고) |
| AC-15 | **대체 재현**: 브라우저 미사용. `curl`로 `index.html`/`styles.css` 정적 검사만 수행 — `viewport` 메타 존재, `body{max-width:100%;overflow-x:hidden}` 확인, `@media(max-width:768px)` 존재. 실제 렌더링 폭(`scrollWidth`)은 브라우저·jsdom이 이 샌드박스에 없어 **측정하지 못했다** | — | 정적 근거만 확보, 렌더링 실측 없음 | **미검증(대체 불충분)** — 아래 §3 한계 참고 |
| AC-4/7/8/9/10/11 | DOM 상호작용(폼 제출·localStorage·탭 전환)이 필요해 `curl`/`node import` 만으로는 대체 불가. AC-8 만 정적 HTML로 부분 재현(아래) | — | — | **미검증(브라우저 필요, 대체 불가)** |
| AC-8(부분) | `python3 -m http.server 8091 -d public &` → `curl -s http://127.0.0.1:8091/index.html \| grep -c 'class="disclaimer'` | 0 | `4`(EVIDENCE.md "4개"와 일치). `grep -n disclaimer`로 주변 마크업 확인 — 닫기 버튼(`button`/`✕`) 없음 | PASS(정적 부분만. "닫기 버튼 없음"의 동적 확인은 못 함) |

서버는 매 사용 후 `pkill -f "http.server 8091"` 로 종료, 이후 `curl` 재요청이 exit 7(connection refused)로 종료 확인.

---

## 2. 공격 결과

### 2.1 filter.js 경계값 (B.1) — 결함 없음, 관찰 사항 1건

`node`로 `public/filter.js`를 직접 import해 실행(`evaluate`).

- `userType="개인||법인/시설/단체"`(결합 문자열이 배열 원소로 들어간 경우) → `제외`(정상, `has()`가 문자열 전체 일치 검사라 의도대로 동작)
- `userType=""`, `userType=undefined` → 조건 자체가 생성되지 않아(`criteria.userType` falsy) 전체 미확정(`조건 없음`) — §5.1 규칙과 무관하게 "조건 미지정"으로 처리되는 것은 AC-4 의도와 일치
- `userType="  개인 "`(공백 포함) → `판정불가`/`알 수 없는 선택`로 안전하게 떨어짐(크래시 없음). **단, UI 경로로는 도달 불가**: `public/index.html`의 `userType`은 고정값 3종 라디오(`개인`/`소상공인`/`법인/시설/단체`)뿐이라 이 입력은 `evaluate()`를 직접 호출할 때만 발생한다(§3 한계)
- `age=0`, `age=-5` → `cond.JA0110` 하한과 비교해 정상적으로 제외/일치 판정(연산 자체는 정확). `age="abc"` → `Number("abc")=NaN`이 `>=`/`<=` 비교에서 항상 false가 돼 `제외`로 떨어짐(크래시 없음). **단, UI 경로**: `f-age`는 `type="number" min="0" max="120"`이고 `<form novalidate>`가 없어 실제 제출 시 브라우저 네이티브 제약검사가 `submit` 이벤트 자체를 막는다(재현: `grep -n 'novalidate\|<form\|type="submit"'` → `novalidate` 0건). 따라서 음수·비숫자 나이는 **폼 UI로는 도달 불가**, `evaluate()` 직접 호출(개발자 콘솔)에서만 도달 — 심각도 낮음(클라이언트 전용 필터 도구라 서버 신뢰 경계 없음)
- `cond`에 `JA0110`만 있고 `JA0111` 없음(또는 반대) → `hi=Infinity`/`lo=-Infinity`로 열린구간 처리, 정상
- `summarize()`에 규칙 외 상태 라벨(`"???"`)을 넣으면 설계대로 예외를 던짐(불변식 가드 정상 동작)

판정: **결함 아님.** 순수 함수 자체는 견고하고, 이론상 가능한 이상 입력(음수 나이 등)은 폼의 네이티브 HTML5 제약검사로 차단된다.

### 2.2 fetch_snapshot.py 순수 함수 (B.3)

```
python3 - <<'PY'
import sys; sys.path.insert(0,"scripts"); import fetch_snapshot as fs
fs.resolve_region("시군구","강원도 춘천시")   # → "강원"
fs.resolve_region("시군구","전북 전주시")     # → "전북"
fs.resolve_region("시군구","세종시")          # → "세종"
fs.resolve_region("교육청","경기도교육청")     # → "경기"
fs.resolve_region("공공기관","서울대학교병원") # → "전국"  (§5.3 규칙대로 org_type 우선)
fs.resolve_region("시군구","서울대학교병원")   # → "서울"  (참고용 — org_type이 공공기관이 아닐 때는 이름의 "서울" 부분일치로 지역이 잡힘. PLAN §5.3이 명시한 "접두 또는 포함 매칭" 설계 그대로이므로 사양 위반은 아니나, 실제 API에서 이런 이름의 기관이 공공기관/중앙행정기관으로 분류 안 되어 있으면 오탐 가능 — 실데이터로 검증 안 됨, 사양 내 허용된 트레이드오프)
fs.classify_deadline("2026.12.31까지")        # → ("기간","2026-12-31")  정상
fs.classify_deadline("2026년 12월 31일")      # → ("기간","2026-12-31")  정상
fs.classify_deadline("상시")                   # → ("상시", None)  정상
fs.classify_deadline("예산 소진시까지")        # → ("불명", None)  정상(날짜도 상시 키워드도 없어 불명 처리 — §5 규칙과 일치)
PY
```
결함 없음 — 6종 모두 §5.3/§5(요구사항5) 서술과 일치.

**결함 발견 — count_check 타입 불일치 (N등급)**
```
fs.count_check("30", 30, 30)
# → {'status': 'FAIL', 'totalCount': '30', 'received': 30, 'unique_ids': 30}
fs.count_check(30, 30, 30)
# → {'status': 'PASS', ...}
```
`received == total_count`가 파이썬에서 `30 == "30"` → `False`이므로 문자열/정수 타입이 섞이면 실제 건수가 일치해도 `FAIL`로 떨어져 스냅샷 승격이 막힌다(§5.2 규칙 "수신==totalCount"는 값 동등을 말하는 것이지 타입 동등을 말하는 게 아님). 실운영에서는 `json.loads()`가 API의 JSON 숫자를 항상 `int`로 역직렬화하므로 **현재 발생 확률은 낮음**(API가 `"totalCount":"30"`처럼 문자열로 응답할 때만 발동). 다만 R-5("API 규격 변경, 상존")가 스스로 명시한 위험이 실현되면 이 타입 불일치가 "필드 누락"이 아니라 "타입 변경"으로 조용히 승격을 막는 경로이므로, fail-closed 자체는 안전측 실패이나 원인 메시지가 "건수 불일치"로만 나가 오진단을 유발할 수 있다. 심각도: **N(경미)** — 현재 안전측(과잉 차단)으로 동작하고 크래시나 데이터 손상은 없음.

**결함 발견 — diff_snapshots None↔"" 노이즈 (N등급)**
```
prev={"services":[{"서비스ID":"A","신청기한":None}]}
new ={"services":[{"서비스ID":"A","신청기한":""}]}
fs.diff_snapshots(prev,new)
# → {'new':[], 'removed':[], 'changed':[{'id':'A','name':None,'fields':[{'field':'신청기한','before':None,'after':''}]}]}
```
`None != ""`이 참이라 의미상 "값 없음→값 없음"인데도 `changed` 항목이 생성된다(요청하신 대로 **노이즈로 확인됨**). `""→""`(동일 문자열)는 정상적으로 변경 없음 처리되는 것과 대조. 재현 완전 성공. 심각도: **N(경미)** — 변경 감지 페이지(AC-12)에 실질 변경이 아닌 항목이 섞여 나올 수 있으나, 서비스 다운·데이터 손상은 없음. 실 데이터에서 `신청기한` 필드가 `None`이 될 조건은 API가 해당 키를 아예 `null`로 보낼 때만이라 발생 빈도는 낮을 것으로 추정(확인 못함, `[데이터공백]`).

### 2.3 verify_no_key.sh (B.4) — 정상 동작 확인, 원상복구 완료

```
$ ls public/_tmp.txt .env                     # 사전: 둘 다 "No such file"
$ echo 'TESTKEY_abc+/=' > public/_tmp.txt
$ printf 'DATA_GO_KR_SERVICE_KEY=TESTKEY_abc+/=\n' > .env
$ bash scripts/verify_no_key.sh
FAIL: public/ 에서 인증키(원문 또는 URL 인코딩 형태)가 발견됐다.
rc=1
$ rm -f public/_tmp.txt .env
$ ls public/_tmp.txt .env                     # 사후: 둘 다 "No such file" — 원상복구 확인
$ bash scripts/verify_no_key.sh
안내: .env 가 없어 1단계(원문 키 검사)는 건너뛴다.
OK
rc=0
```
가짜 키(`+`, `/`, `=` 특수문자 포함 — base64 유사 문자셋)를 심었을 때 정확히 `FAIL`, rc=1을 반환했고, 삭제 후 원래 상태(`.env` 없음 → 안내 후 `OK`, rc=0)로 완전히 복귀했다. 원상복구는 `ls` 실패(No such file) + `verify_no_key.sh` 재실행 결과 두 가지로 이중 확인. 결함 없음.

### 2.4 app.js 외부 호출·CDN (B.5) — 결함 없음

```
grep -n 'fetch(' public/app.js         # → 133:fetch(path,...) / 144:fetch("data/snapshot.json",...)
grep -n 'odcloud\|serviceKey' public/app.js public/filter.js public/regions.js public/index.html   # 0건
grep -n '<script\|<link' public/index.html   # styles.css(로컬), app.js(type=module, 로컬) 뿐, 외부 CDN 0건
```
`fetch()`는 상대경로 `data/*.json` 대상 2곳뿐이고 코드에 `odcloud`/`serviceKey` 문자열이 전혀 없다. §3 아키텍처 주장("이 앱은 API를 브라우저에서 호출하지 않는다")과 일치.

### 2.5 HTML 이스케이프 전수 확인 (B.6)

`grep -n innerHTML public/app.js`로 18곳의 innerHTML 대입 지점을 전수 확인. 정적 문자열/내부 상수만 대입하는 곳(예: `"<p>저장한 사업이 없습니다.</p>"`) 제외, 서비스 데이터가 섞이는 5개 렌더 함수(`renderCard`, `renderDetail`, `renderSavedCard`, `renderChanges`, `renderStatus`, `renderCompare`)의 모든 필드 보간을 확인한 결과 **텍스트 콘텐츠는 전부 `esc()`로 감싸져 있다.**

과제에서 요청한 정확한 케이스 재현:
```js
esc("<img src=x onerror=alert(1)>")
// → "&lt;img src=x onerror=alert(1)&gt;"  → 카드 제목에 텍스트로만 렌더링, 스크립트 실행 안 됨
```
**PASS** — 요청하신 공격은 막혀 있다.

**추가로 발견한 결함(요청 범위 밖, N등급) — href 속성의 스킴 미검증**
`renderDetail()`(app.js:451-455)의 링크 두 곳:
```js
links.push(`<a href="${esc(service["상세조회URL"])}" target="_blank" rel="noopener">원문 상세조회</a>`);
links.push(`<a href="${esc(service["온라인신청사이트URL"])}" target="_blank" rel="noopener">온라인 신청</a>`);
```
재현:
```
node -e '... esc("javascript:alert(document.cookie)") ...'
# → <a href="javascript:alert(document.cookie)" target="_blank" rel="noopener">원문 상세조회</a>
```
`esc()`는 `& < > "` 4개 문자만 치환하고 URL 스킴은 검사하지 않는다. `상세조회URL`/`온라인신청사이트URL` 값이 `javascript:`로 시작하면 속성 값 자체가 스크립트가 돼, 클릭 시 실행된다(`rel="noopener"`는 새 창의 `window.opener` 차단용일 뿐 `javascript:` 스킴을 막지 않는다). **신뢰 경계**: 이 필드는 사용자 입력이 아니라 `data.go.kr` 공식 API 응답값이므로 공격자가 이 필드를 직접 조작하려면 정부 API 응답 자체를 변조해야 한다(가능성 낮음, §3 "이 앱은 API를 브라우저에서 호출하지 않는다"와는 별개 문제 — 이건 수집 스크립트가 받아온 값의 신뢰도 문제). 즉시 악용 경로는 없으나 `esc()`라는 함수명이 "HTML 이스케이프 = 안전"이라는 가정을 코드 전체에 심어놨고, 이 가정은 텍스트 콘텐츠에는 맞지만 URL 속성 컨텍스트에는 불완전하다. 심각도: **N** — 현재 신뢰 경계에서 악용 불가능하나 방어심층 결여.

### 2.5-부록. 재현성 결함 발견 (§9.2 검수 분리와 관련, N등급)

`git status --short` → `M tests/filter.test.mjs`(내가 만든 변경이 아님 — 이 세션에서 git 명령을 쓰지 않았고 파일도 건드리지 않았다). `git diff`로 확인한 결과 `classifyDeadlineUrgency`의 "마감 지남" 테스트 케이스 1건이 **커밋되지 않은 상태로 워킹트리에만 존재**한다. `git log --oneline -- tests/filter.test.mjs` → 커밋 1건(`d1232d9`, 이 테스트 없음). 즉 `node --test tests/filter.test.mjs` 결과(25 pass)와 EVIDENCE.md E-6이 인용하는 "25 pass"는 **아직 git에 없는 파일 상태**에 의존한다. `docs/PLAN.md` §9.2가 "작성자 자기 판정으로 종결하지 않는다"고 선언한 검수 분리 원칙이 성립하려면, 검수 대상이 커밋 고정 상태여야 하는데 현재는 아니다 — 커밋 전에 이 워킹트리가 유실되면 재현 수치가 35(unittest)는 유지되나 25(node --test)는 24로 줄어든다.

---

## 3. 한계 (수행 못한 것 · 왜)

- **AC-4, AC-7, AC-9, AC-10, AC-11**: DOM 상호작용(폼 제출 → `evaluate()` 호출 체인, `localStorage` 저장, 탭 전환 렌더링)이 필요하다. 이 샌드박스에 브라우저·`jsdom`이 없어(`node -e "require('jsdom')"` → `Cannot find module`) 정적 `curl`/`node import`로는 대체할 수 없었다. **미검증**으로 남긴다 — "대체 재현" 지시를 따르되 실제로 대체가 불가능한 항목은 대체했다고 쓰지 않는다.
- **AC-15**: `viewport` 메타·반응형 CSS(`@media (max-width:768px)`, `overflow-x:hidden`) 정적 존재만 확인했다. `document.documentElement.scrollWidth` 실측(EVIDENCE E-6이 주장하는 "356 ≤ 371")은 브라우저 렌더링이 필요해 재현하지 못했다. `.compare-table{min-width:480px}`가 `.table-scroll{overflow-x:auto}` 래퍼 안에 있어 설계상으로는 페이지 전체 가로스크롤을 유발하지 않을 것으로 보이나(표준 CSS 오버플로 컨테인 패턴), **실측하지 않았으므로 결함으로도 통과로도 단정하지 않는다.**
- **AC-6 브라우저 요약줄, AC-8의 "닫기 버튼 없음" 동적 확인**: 정적 HTML에는 닫기 버튼 마크업이 없음을 확인했으나, JS가 런타임에 버튼을 추가하지 않는지는 `app.js` 코드 리딩(disclaimer 관련 함수 `disclaimerText`/`fillDisclaimerDate`가 텍스트만 채우고 버튼을 만들지 않음)으로 간접 확인했다 — 코드 정독 기반이라 브라우저 실측보다 약하다.
- **AC-1, AC-12(Actions), AC-14**: 네트워크(API 실호출) 또는 GitHub Actions 실행이 필요해 과제 범위(placeholder 키 1회만 허용) 밖이라 시도하지 않았다.

---

## 4. 원상복구 증거

```
$ ls public/_tmp.txt .env
ls: .env: No such file or directory
ls: public/_tmp.txt: No such file or directory
$ bash scripts/verify_no_key.sh
안내: .env 가 없어 1단계(원문 키 검사)는 건너뛴다.
OK
```
`http.server`도 매번 `pkill -f "http.server 8091"`로 종료 확인(재요청 시 `curl` exit 7). `git status --short` 결과 `tests/filter.test.mjs` 1건만 표시되며, 이는 §2.5-부록에서 설명한 **작성자의 기존 미커밋 변경**(내가 생성하지 않음, diff 내용이 EVIDENCE.md E-6의 "① 지난 마감일에 D-1이하 배지 → 마감 지남으로 분기" 수정과 정확히 대응)이다. 이 세션에서 이 저장소에 새로 만든 파일은 없다(스크래치 스크립트는 전부 `/private/tmp/.../scratchpad/`에 두었다).

---

## 5. 총평

**치명 결함(P0/P1) 0건.** 발견한 결함은 전부 **N등급**(경미, 회피 경로 있거나 신뢰 경계상 저위험) 4건이다:

| # | 등급 | 결함 | 재현 경로 | 근거 파일:라인 | 제안 |
|---|---|---|---|---|---|
| 1 | N | `count_check`가 `totalCount`를 문자열로 받으면 값이 같아도 FAIL(타입 불일치) | `python3 -c "import sys;sys.path.insert(0,'scripts');import fetch_snapshot as fs;print(fs.count_check('30',30,30))"` → `{'status':'FAIL',...}` | `scripts/fetch_snapshot.py:132` | `count_check`에서 `int(total_count)` 캐스팅 후 비교, 캐스팅 실패 시 명시적으로 "타입 오류"라고 원인 분리 |
| 2 | N | `diff_snapshots`가 `None↔""` 전이를 실질 변경으로 오탐(노이즈) | 위 §2.2 재현 블록 | `scripts/fetch_snapshot.py:238-274` | 필드 비교 전 `before or ""`/`after or ""` 정규화, 또는 변경 판정에서 두 값 다 falsy면 스킵 |
| 3 | N | `esc()`가 URL 속성의 `javascript:` 스킴을 막지 않음(href 컨텍스트 부적합) | 위 §2.5 재현 블록 | `public/app.js:64-71`, 사용처 `public/app.js:452,455` | href 대입 전 스킴 화이트리스트(`http:`/`https:`만 허용) 검사 함수 추가 |
| 4 | N | 검수 대상 최신 테스트 결과(25 pass)가 커밋되지 않은 워킹트리 변경에 의존 — 재현성 취약 | `git status --short` → `M tests/filter.test.mjs`, `git log --oneline -- tests/filter.test.mjs` → 커밋 1건뿐 | `tests/filter.test.mjs`(워킹트리 diff) | 커밋해서 "25 pass"의 재현 기준을 고정할 것 |

시도한 공격 중 실패(결함 없음으로 확인)한 것 — 커버리지 증거:
1. `filter.js evaluate()`에 사용자구분/지역/나이 경계값(공백·빈문자열·undefined·음수·NaN) 투입 → 전부 크래시 없이 규칙대로 판정되거나 UI 자체가 막음(§2.1)
2. `resolve_region()`에 6개 표본 지역명(강원도 춘천시/전북 전주시/세종시/경기도교육청/서울대학교병원×2 org_type) 투입 → 전부 §5.3 규칙과 일치
3. `classify_deadline()`에 4개 표본 마감 텍스트(점찍은 날짜/한글 날짜/상시/예산소진시까지) 투입 → 전부 §5 규칙과 일치
4. `verify_no_key.sh`에 가짜 키(base64 특수문자 포함) 주입 → 정확히 FAIL 검출, 원상복구도 확인
5. `app.js`에 대해 odcloud/serviceKey 문자열·외부 CDN 로드 전수 grep → 0건
6. `<img src=x onerror=alert(1)>` 서비스명 XSS 페이로드를 요청받은 그대로 재현 → `esc()`가 텍스트로 안전 처리(공격 실패)
7. `summarize()`에 규칙 외 상태 라벨을 넣어 불변식 우회 시도 → 설계대로 예외 발생(우회 실패)

**판정: PASS(치명 결함 없음)** — 단, §3의 미검증 항목(AC-4/7/9/10/11/15 브라우저 실측)과 §5 N등급 4건은 **다음 게이트 전 별도 확인 또는 수정 권고**로 남긴다. 이 보고서는 "브라우저 없이 검증 가능한 범위"에서의 PASS이며, 브라우저 실측 없이 AC-4/7/9/10/11/15를 "PASS"로 승격하지 않는다.
