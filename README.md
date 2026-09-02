# 보조금24 조건 필터

공공데이터포털 **보조금24 공공서비스(혜택) 정보 API**(데이터 ID 15113968)를 한 번 받아 기준일이 붙은 스냅샷으로 두고, 내 조건(지역·신청자 유형·나이·성별·소득·가구·분야·키워드)에서 **걸러지지 않은** 사업만 보여주는 정적 웹앱입니다.

> 이 도구가 보여주는 것은 조건에서 걸러지지 않은 목록이지 받을 수 있다는 뜻이 아닙니다. 실제 지급은 담당 기관이 판단합니다.

## 구조

```
scripts/check_key.py        인증키가 이 API에 맞는지 검사 (키는 .env 에서만 읽고 절대 출력하지 않음)
scripts/fetch_snapshot.py   목록·상세·지원조건 전량 수집 → public/data/{snapshot,meta,changes}.json
scripts/verify_no_key.sh    배포 폴더에 키·API 호출 코드가 없는지 검사
public/                     화면 (index.html · app.js · filter.js · regions.js · styles.css · data/)
tests/                      수집 로직(unittest) · 필터 규칙(node --test)
.github/workflows/          deploy.yml(push→검사→Pages) · refresh.yml(매일 06:00 KST 재수집)
docs/                       PLAN.md(계획) · RUBRIC.md · EVAL-*.md · REVIEW-*.md · EVIDENCE.md · HOWTO.md
```

핵심 원칙: **API는 브라우저에서 부르지 않는다.** 수집은 로컬 스크립트나 GitHub Actions(Secret)에서만 하고, 배포물에는 JSON 산출물만 들어갑니다.

## 시작하기

`docs/HOWTO.md` 를 따라 하세요. 요약:

```bash
cp .env.example .env            # 키 붙여넣기 (본인만)
python3 scripts/check_key.py    # PASS 확인
python3 scripts/fetch_snapshot.py
python3 -m http.server 8080 -d public   # http://localhost:8080
```

## 검증

```bash
python3 -m unittest discover -s tests -p "test_*.py"
node --test tests/filter.test.mjs
bash scripts/verify_no_key.sh
```

## 출처

- 공공데이터포털: https://www.data.go.kr/data/15113968/openapi.do
- 정부24: https://www.gov.kr
- 데이터 기준일은 화면 상단과 `public/data/meta.json` 에 표시됩니다. 승인 방식·호출 한도·제공 항목은 2026년 9월 기준이며 바뀔 수 있습니다.
