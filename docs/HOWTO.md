# 따라 하기 — 인증키 발급부터 링크 공유까지

> 굵은 단계는 **본인만 할 수 있는 단계**다(계정·키·로그인). 나머지는 터미널에 복붙하면 된다.
> 키 값은 채팅·문서·이슈에 절대 붙이지 않는다. `.env` 파일과 GitHub Secret 두 곳에만 둔다.

## 0. 준비물
- Mac 터미널, `python3`(3.9 이상), `node`(20 이상), `gh`(GitHub CLI, 이미 로그인됨), `git`.
- 확인:
```bash
python3 --version && node --version && gh auth status
```

## 1. 인증키가 이 API에 맞는지 확인하기

**1-1. data.go.kr 에 로그인 → 상단 검색창에 `15113968` → "행정안전부_대한민국 공공서비스(혜택) 정보" 클릭.**

**1-2. 페이지 오른쪽 "활용신청" 버튼이 보이면 아직 신청 전이다. 눌러서 활용목적(예: 개인 학습)을 쓰고 저장. 자동승인이라 바로 끝난다.** 이미 신청했다면 "활용신청" 대신 "마이페이지" 링크가 보인다.

**1-3. 마이페이지 → 오픈API → 인증키 발급현황 → "일반 인증키(Decoding)" 값을 복사.** (Encoding 키도 되지만 Decoding 키를 쓴다.)

**1-4. `.env` 만들기** (Finder 에서 `~/gov24-filter/.env.example` 을 복제해 `.env` 로 이름 바꾸고, `여기에_디코딩_인증키` 자리에 붙여넣기.) 터미널로 하려면:
```bash
cp ~/gov24-filter/.env.example ~/gov24-filter/.env && open -e ~/gov24-filter/.env
```

1-5. 키 검사:
```bash
cd ~/gov24-filter && python3 scripts/check_key.py
```
- `PASS: 유효한 키. 열리는 방식 = [...]` → 2번으로.
- `HTTP 401 {"code": -4 ...}` 가 세 줄 다 나오면 → 이 키의 계정에 15113968 활용신청이 없다. 1-2 로 돌아간다.
- `HTTP 401 {"code": -401 ...}` → `.env` 값이 비어 있다.
- 한 방식만 PASS 면 정상이다. 스크립트가 그 방식을 쓴다.

## 2. 데이터 한 번 받기
```bash
cd ~/gov24-filter && python3 scripts/fetch_snapshot.py
```
끝나면 `public/data/meta.json` 에 기준일·건수·`count_check` 가 적힌다. `count_check` 가 `FAIL` 이면 스냅샷은 교체되지 않는다(직전 것 유지). 다시 한 번 실행해 보고 계속 FAIL 이면 그 meta.json 내용을 알려 달라.

## 3. 내 컴퓨터에서 먼저 열어 보기
```bash
cd ~/gov24-filter && python3 -m http.server 8080 -d public
```
브라우저에서 http://localhost:8080 열기. 끝나면 터미널에서 `Ctrl+C`.

## 4. 인터넷에 올리기 (GitHub Pages)

4-1. 저장소가 이미 만들어져 있다면(`gh repo view kr80hwlee-bit/gov24-filter` 가 열리면) 이 단계는 건너뛴다. 없으면:
```bash
cd ~/gov24-filter && git init -b main && git add -A && git commit -m "init" && gh repo create kr80hwlee-bit/gov24-filter --public --source=. --push
```

**4-2. Secret 등록 (키를 GitHub 에 안전하게 보관 — 매일 자동 수집에 쓴다).** 아래를 실행하면 붙여넣기 프롬프트가 뜬다. 키를 붙여넣고 Enter.
```bash
gh secret set DATA_GO_KR_SERVICE_KEY --repo kr80hwlee-bit/gov24-filter
```

4-3. Pages 켜기 (1회):
```bash
gh api -X POST repos/kr80hwlee-bit/gov24-filter/pages -f build_type=workflow
```
이미 켜져 있으면 "already exists" 라고 나오며 그대로 두면 된다.

4-4. 올리기:
```bash
cd ~/gov24-filter && git add -A && git commit -m "snapshot" && git push
```
1~2분 뒤 확인:
```bash
gh run list --repo kr80hwlee-bit/gov24-filter --limit 3
```
`completed success` 가 보이면 https://kr80hwlee-bit.github.io/gov24-filter/ 를 연다.

## 5. 폰에서 확인·공유
- 폰 브라우저에 같은 주소를 연다. 조건 입력 → 검색.
- 그 주소를 카톡으로 보내면 받은 사람도 자기 조건으로 쓴다. 로그인은 없다.

## 6. 인증키가 안 새는지 직접 확인하기
```bash
cd ~/gov24-filter && bash scripts/verify_no_key.sh
```
`OK` 면 배포 폴더 어디에도 키·API 호출 코드가 없다. 배포된 페이지에서도:
```bash
curl -s https://kr80hwlee-bit.github.io/gov24-filter/app.js | grep -c odcloud
```
`0` 이 정상이다.

## 7. 이후에는
- 매일 06:00(KST) GitHub 가 알아서 새로 받아 재배포한다. "변경 사항" 탭에서 신규·변경·사라진 사업을 본다.
- 수동으로 즉시 갱신하려면:
```bash
gh workflow run refresh-snapshot --repo kr80hwlee-bit/gov24-filter
```
- 키를 바꿨으면 4-2 를 다시 실행한다.

## 8. 자주 막히는 곳
| 증상 | 원인 | 조치 |
|---|---|---|
| `-4 등록되지 않은 인증키` | 활용신청 안 됨 / 오타 | 1-2, 1-3 |
| `-3 등록되지 않은 서비스` | 옛 v1 주소 | 스크립트는 v3 를 쓴다. 다른 예제 코드를 쓰고 있다면 주소를 v3 로 |
| 페이지가 열리는데 "데이터를 불러오지 못했습니다" | `file://` 로 열었음 | 3번처럼 서버로 연다 |
| Actions 실패 "Secret 이 비어 있다" | 4-2 안 함 | 4-2 |
| 폰에서 표가 옆으로 넘침 | 비교 탭은 표 안에서만 옆으로 밀린다 | 정상 |
