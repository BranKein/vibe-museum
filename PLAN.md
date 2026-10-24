# Vibe Museum 계획

기획 원문은 루트 저장소의 `ideas/project-museum-site.md`다. 기획과 이 문서가 어긋나면 기획의 "결정된 사항"이 우선한다.

## 지금 있는 것 (2026-10-15)

- 네 전시관의 정적 화면: 핀보드(`pinboard.html`), 3D 전시관(`hall.html`), 소장품 카탈로그(`catalogue.html`), 야간 개장(`night.html`).
- 공통 머리말·꼬리말, 전시관 고르기 창, 한국어·영어, 밝게/어둡게 (`shared.js`). 고른 값은 `localStorage`의 `vm.hall`, `vm.lang`, `vm.mode`에 둔다.
- `index.html`은 지난번 전시관으로, 처음이면 핀보드로 보낸다.
- 전시품 목록은 빌드 때 만든다(`data/exhibits.js`, 2026-10-16부터). 아이디어 입력 칸은 함수 주소가 설정됐을 때만 보낸다.
- 빌드는 Node 스크립트(`npm run build` → `dist/`). 3D 전시관은 cdnjs의 three.js r128을 쓴다.

## 진행 기록

### 2026-10-16: 배포 흐름 (남은 일 2~4)

사용자가 디자인 다듬기(1)는 뒤로 하고 배포 흐름부터 만들자고 했다(2026-10-15 밤, 첫 배포는 v0.0.1).

한 것:

- **배포(4)**: vive-infra `sites/vive-museum`을 PR(vive-infra#2)로 올려 plan(13개 추가, 바꾸거나 지우는 것 없음)을 확인하고, 사용자 허락대로 병합해 GitHub Actions에서 apply했다. 버킷 `vive-site-vive-museum`, 배포 ID `E2U4Z50P1Q5XFE`, 배포 사용자 `deploy-vive-museum`. 이 저장소의 Variables(`AWS_REGION`, `S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`)를 넣었다. `deploy/site.json`, `.github/workflows/deploy.yml`, Open Graph(`img/og.png`, 전시품마다 `e/<id>.html`), Cloudflare Web Analytics 자리(`CF_BEACON_TOKEN` 변수)를 만들었다.
- **전시 목록(2)**: `scripts/collect.mjs`가 `.gitmodules`와 `ideas/`를 읽어 `data/exhibits.js`를 만들고, `shared.js`는 그것을 쓴다. `deploy/exhibit.json` 형식은 README. warehouse-tycoon에 `deploy/exhibit.json`, `deploy/thumbnail.jpg`와 배포 뒤 이 저장소로 `repository_dispatch`를 보내는 단계를 넣었다(토큰이 없거나 권한이 모자라면 경고만).
- **방문자 아이디어(3)**: `lambda/ideas/` 함수와 테스트, 사이트 입력 칸(함수 주소가 있을 때만 실제로 보냄, Turnstile 키가 있으면 위젯). AWS 자원은 vive-infra `sites/vive-museum-ideas`(PR vive-infra#3). 이 PR은 apply 역할 권한을 넓히는 `bootstrap/` 변경을 함께 담고 있어서, bootstrap을 로컬에서 apply한 뒤에 병합해야 한다. 그래서 아직 병합하지 않았고, SES 자원이 없어 테스트 메일도 보내지 못했다.
- 테스트: `npm test` 26개 통과. 화면은 빌드한 `dist/`를 headless Chrome으로 찍어 네 전시관에 전시품 두 점(창고 타이쿤, 주기적 코딩 문제)이 나오는 것을 봤다.

정한 것 (에이전트 제안):

- 빌드 도구 없이 Node 스크립트만 쓴다(의존성 0). 전시 데이터는 `data/exhibits.js`(전역 변수)로 두어 지금 페이지 구조를 그대로 쓴다.
- 해시 붙은 파일이 없으므로 페이지는 캐시하지 않고, 나머지는 5분 캐시, CloudFront는 `/*`를 비운다.
- 다른 프로젝트의 신호·수동 실행·매일 아침(06:17 KST) 실행은 가장 최근 `v*` 태그를 새 데이터로 다시 빌드한다. main push로는 배포하지 않는다(공통 규칙). 루트 저장소 `ideas/`가 바뀐 것은 매일 실행이 반영한다. 루트 저장소에 워크플로를 두지 않기 위해서다.
- 소장 번호(VM-001…)는 시작한 날(첫 커밋, 아이디어 적은 날) 순서. 같은 날이면 전시 중이 먼저.
- "준비 중"의 짧은 제목·설명과 영어 줄은 아이디어 파일 머리의 `- 전시 제목:`, `- 전시 설명:`, `- 영어 제목:`, `- 영어 설명:`. 형식은 루트 `ideas/README.md`.
- v1.0.0 태그가 없는 프로젝트의 제작 기간은 가장 최근 태그까지로 센다.
- 함수: 같은 주소에서 1시간에 5건, 제목 100자, 설명 2,000자. 운영자 메일의 승인·거절 링크는 같은 토큰을 쓰고, 확인 화면에서 둘 중 하나를 누른다. 이메일이 없는 아이디어는 승인하면 바로 지운다(이슈만 남는다). Turnstile 비밀 키가 없으면 사람 확인을 건너뛴다. "만들어졌다" 알림은 배포 워크플로가 `{task: "built"}`로 함수를 직접 부른다(공유 비밀 대신 배포 사용자의 IAM 권한).
- 함수 주소는 API Gateway 기본 주소(`*.execute-api...`)를 쓴다. 따로 도메인을 붙이지 않았다.

### 2026-10-20: 검색 노출 (SEO)

전시관이 스크립트로 목록을 그려서 검색 엔진에 보이는 글이 거의 없었다. 빌드에서 채운다(자세한 것은 README "검색 노출").

정한 것 (에이전트 제안):

- 대표 페이지는 핀보드다. 입구(`index.html`)는 지난번 전시관으로 보내기만 하므로(이 동작은 그대로 둔다, 사용자 결정) canonical을 핀보드로 둔다. 나머지 세 전시관은 저마다 자기 주소가 canonical이다. 같은 전시품을 보여 주지만 화면과 설명이 다른 별개 페이지로 본다.
- 공유 페이지 `e/<id>.html`은 박물관으로 넘겨 주는 페이지라 `noindex`. 링크 미리보기 태그는 남긴다. 사이트맵에도 넣지 않는다.
- 제목·설명은 한국어 다음 영어를 한 문장씩 함께 적는다. 화면 언어는 방문자가 고르지만, 검색은 두 언어 모두에서 걸리게 하려는 것이다. `html lang`은 `ko` 그대로.
- 미리 넣는 목록은 숨기지 않는다. 전시관 스크립트가 같은 자리를 바로 다시 그린다(3D 전시관은 글꼴을 기다리는 동안 아래 띠 자리에 잠깐 보인다).
- 소유 확인은 도메인(DNS) 방식 대신 URL 접두어 방식의 meta 태그로 한다. 값은 저장소 Variables에 넣고, 없으면 태그를 붙이지 않는다. Search Console·서치어드바이저 등록과 사이트맵 제출은 사용자가 한다.

### 2026-10-20: 광고 (AdSense)

루트 저장소의 홈페이지(`yeonhyuk.me`)와 함께 AdSense를 붙일 준비. 값은 저장소 Variables(`ADSENSE_CLIENT`, `ADSENSE_SLOT_INFEED`, `ADSENSE_SLOT_DISPLAY`)에 넣고, 없으면 아무것도 붙지 않는다(자세한 것은 README "광고").

정한 것 (에이전트 제안):

- 광고는 변수가 있을 때만 붙는다. 게시자 ID가 있으면 광고 자리가 있는 세 페이지에 스크립트를 넣고(광고 단위 ID 전에도 AdSense 사이트 확인이 되게), 실제 자리는 그 자리의 광고 단위 ID까지 있어야 생긴다.
- 3D 전시관에는 광고를 넣지 않는다. 화면 전체가 걷는 공간이라 끼워 넣을 자리가 없고 몰입을 깬다. 입구와 공유 페이지는 바로 다른 곳으로 넘기는 페이지라 넣지 않는다.
- 핀보드는 전시품 카드 사이에 인피드 카드 하나(세 번째 전시품 뒤). 핀보드는 필터·언어·펼치기 방식을 바꿀 때마다 목록을 innerHTML로 다시 그리므로, `shared.js`가 MutationObserver로 다시 그려진 것을 보고 새 카드를 한 번 넣고 그 카드의 `<ins>`만 `push()`한다. 이미 채워졌거나 요청한 `<ins>`에는 다시 `push()`하지 않는다. 페이지 HTML은 고치지 않았다.
- 소장품 카탈로그와 야간 개장은 본문 아래, 꼬리말 위에 가로 상자 하나. 너비는 본문 칸에 맞추고(카탈로그 1180px), 높이를 미리 잡아(100px) 화면이 덜 튄다.
- 모든 광고에 "광고 · Ad" 표시를 붙여 전시품과 헷갈리지 않게 한다. 색은 각 페이지의 글자색(`currentColor`)과 카드색을 따라 밝게/어둡게 모두에서 맞는다.
- 광고가 채워지지 않으면 상자를 숨기고, 광고 차단기로 스크립트가 막히면(페이지를 다 읽고 4초 뒤에도 로드되지 않으면) 상자를 치운다. `push()`는 try/catch로 감싼다.

## 남은 일 (나중에 한다)

### 1. 디자인 다듬기

- 사용자가 네 전시관을 각각 조금씩 손볼 예정이다. 그 의견을 먼저 반영한다.
- 3D 전시관: 휴대폰처럼 세로로 긴 화면에서 액자와 안내판이 둘 다 작게 보인다. 작품마다 두 번 멈추기(액자 → 안내판) 또는 휴대폰에서만 안내판을 액자 아래에 걸기 중에서 고른다.
- 필요하면 이때 기술 스택(빌드 도구 도입 여부)을 다시 정한다.

### 2. 전시 목록 자동 갱신 (2026-10-16 대부분 끝냄. 남은 것: 썸네일 자동 촬영)

- 각 프로젝트 저장소에 `deploy/exhibit.json`(제목·설명 한영, 기술 스택, 썸네일 경로, PC 권장 여부)을 둔다. 주소는 `deploy/site.json`의 `subdomain`에서 만든다.
- 박물관 빌드가 루트 저장소의 `.gitmodules`를 돌며 각 저장소 main의 `exhibit.json`을 읽는다. 없으면 전시하지 않는다(예: vive-infra).
- 버전·날짜는 가장 최근 `v*` 태그, 걸린 날수는 첫 커밋부터 `v1.0.0` 태그까지.
- "준비 중"은 루트 저장소 `ideas/`의 상태(아이디어·보류·구현 중)에서 온다. 영어 한 줄을 아이디어 파일에 함께 적는다.
- 프로젝트의 deploy 워크플로가 끝날 때 이 저장소에 `repository_dispatch`를 보내 다시 빌드·배포한다. 루트 저장소의 `ideas/`가 바뀔 때도.
- 썸네일: 저장소에 이미지가 있으면 그것, 없으면 배포 뒤 headless 브라우저로 찍는다.
- 지금 `shared.js`에 직접 적힌 `EXHIBITS`를 빌드 때 만드는 데이터 파일로 바꾼다.

### 3. 방문자 아이디어 (2026-10-16 v0.0.2로 켬. 승인→이슈, 거절→삭제 확인. Turnstile 켬. 하루 50건 상한, 월 5달러 예산 메일. 남은 것: SES 샌드박스 해제 결과 기다림)

- API Gateway + Lambda. 함수 코드는 이 저장소, AWS 자원은 vive-infra.
- 받기: 제목, 설명, 이메일(선택). Cloudflare Turnstile, 요청 수 제한, 길이 제한.
- 승인 대기로 DynamoDB에 저장 → 사용자(`yeonhyuk.public@gmail.com`)에게 SES로 승인·거절 링크 메일 → 승인하면 이 저장소에 `visitor-idea` 이슈(제목·설명만) → 거절하거나 30일 지나면 삭제.
- 이메일을 적었으면 확인 메일을 보내고, 24시간 안에 확인하지 않으면 이메일만 지운다.
- 출처 이슈가 있는 아이디어가 "완료"가 되면 확인된 이메일로 "만들어졌다" 메일을 한 번 보내고 이메일을 지운다. 채택 때는 알리지 않는다. 아이디어마다 따로 보낸다.
- 링크는 한 번만 쓰는 서명 토큰. 링크를 여는 것만으로는 처리하지 않고 확인 화면의 버튼으로 처리한다.
- 보내는 주소 `noreply@yeonhyuk.me`. 입력 칸 아래 개인정보 안내.

### 4. 배포 (2026-10-16 v0.0.2. https://vive-museum.yeonhyuk.me, Cloudflare Web Analytics 켬)

- 루트 `docs/deploy.md`의 구조대로: vive-infra에 `sites/vive-museum`(주소 `vive-museum.yeonhyuk.me`), 이 저장소에 `deploy/site.json`과 `.github/workflows/deploy.yml`.
- Cloudflare Web Analytics 스크립트를 붙인다.
- Open Graph 미리보기(사이트 전체, 가능하면 전시품마다).

### 사용자가 할 일 (그때 모아서 알린다)

- vive-infra PR 병합, 배포용 IAM 키 발급, 이 저장소에 Secrets·Variables 입력
- SES 도메인 인증, 받는 주소 확인, 샌드박스 해제 신청
- Turnstile 사이트 키, 이슈를 만들 GitHub 토큰
- 다른 프로젝트의 배포 토큰이 이 저장소에 `repository_dispatch`를 보낼 수 있게 범위 넓히기

### 5. 이름 변경 (2026-10-24, vive-museum → vibe-museum)

- 저장소는 `BranKein/vibe-museum`, 주소는 `vibe-museum.yeonhyuk.me`. 위의 기록은 그때 이름 그대로 둔다.
- 인프라는 새 스택 `sites/vibe-museum`, `sites/vibe-museum-ideas`(vibe-infra#7). 옛 스택은 새 주소 배포를 확인한 뒤 지우고, 옛 주소는 같은 경로의 새 주소로 301을 보낸다.
- 아이디어 테이블 항목은 새 테이블로 옮긴다. 옛 메일 속 확인·검토·수신 거부 링크는 옛 API를 가리켜 동작하지 않는다.
- `- 출처: vive-museum#N`도 계속 읽는다(GitHub이 옛 이름을 새 저장소로 넘겨준다).
