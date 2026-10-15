# Vive Museum 계획

기획 원문은 루트 저장소의 `ideas/project-museum-site.md`다. 기획과 이 문서가 어긋나면 기획의 "결정된 사항"이 우선한다.

## 지금 있는 것 (2026-10-15)

- 네 전시관의 정적 화면: 핀보드(`pinboard.html`), 3D 전시관(`hall.html`), 전시 도록(`catalogue.html`), 야간 개장(`night.html`).
- 공통 머리말·꼬리말, 전시관 고르기 창, 한국어·영어, 밝게/어둡게 (`shared.js`). 고른 값은 `localStorage`의 `vm.hall`, `vm.lang`, `vm.mode`에 둔다.
- `index.html`은 지난번 전시관으로, 처음이면 핀보드로 보낸다.
- 전시품 목록은 `shared.js`의 `EXHIBITS`에 직접 적혀 있다. 아이디어 입력 칸은 확인 문구만 띄우고 아무 데도 보내지 않는다.
- 빌드 과정이 없다. 3D 전시관은 cdnjs의 three.js r128을 쓴다.

## 남은 일 (나중에 한다)

### 1. 디자인 다듬기

- 사용자가 네 전시관을 각각 조금씩 손볼 예정이다. 그 의견을 먼저 반영한다.
- 3D 전시관: 휴대폰처럼 세로로 긴 화면에서 액자와 안내판이 둘 다 작게 보인다. 작품마다 두 번 멈추기(액자 → 안내판) 또는 휴대폰에서만 안내판을 액자 아래에 걸기 중에서 고른다.
- 필요하면 이때 기술 스택(빌드 도구 도입 여부)을 다시 정한다.

### 2. 전시 목록 자동 갱신

- 각 프로젝트 저장소에 `deploy/exhibit.json`(제목·설명 한영, 기술 스택, 썸네일 경로, PC 권장 여부)을 둔다. 주소는 `deploy/site.json`의 `subdomain`에서 만든다.
- 박물관 빌드가 루트 저장소의 `.gitmodules`를 돌며 각 저장소 main의 `exhibit.json`을 읽는다. 없으면 전시하지 않는다(예: vive-infra).
- 버전·날짜는 가장 최근 `v*` 태그, 걸린 날수는 첫 커밋부터 `v1.0.0` 태그까지.
- "준비 중"은 루트 저장소 `ideas/`의 상태(아이디어·보류·구현 중)에서 온다. 영어 한 줄을 아이디어 파일에 함께 적는다.
- 프로젝트의 deploy 워크플로가 끝날 때 이 저장소에 `repository_dispatch`를 보내 다시 빌드·배포한다. 루트 저장소의 `ideas/`가 바뀔 때도.
- 썸네일: 저장소에 이미지가 있으면 그것, 없으면 배포 뒤 headless 브라우저로 찍는다.
- 지금 `shared.js`에 직접 적힌 `EXHIBITS`를 빌드 때 만드는 데이터 파일로 바꾼다.

### 3. 방문자 아이디어

- API Gateway + Lambda. 함수 코드는 이 저장소, AWS 자원은 vive-infra.
- 받기: 제목, 설명, 이메일(선택). Cloudflare Turnstile, 요청 수 제한, 길이 제한.
- 승인 대기로 DynamoDB에 저장 → 사용자(`yeonhyuk.public@gmail.com`)에게 SES로 승인·거절 링크 메일 → 승인하면 이 저장소에 `visitor-idea` 이슈(제목·설명만) → 거절하거나 30일 지나면 삭제.
- 이메일을 적었으면 확인 메일을 보내고, 24시간 안에 확인하지 않으면 이메일만 지운다.
- 출처 이슈가 있는 아이디어가 "완료"가 되면 확인된 이메일로 "만들어졌다" 메일을 한 번 보내고 이메일을 지운다. 채택 때는 알리지 않는다. 아이디어마다 따로 보낸다.
- 링크는 한 번만 쓰는 서명 토큰. 링크를 여는 것만으로는 처리하지 않고 확인 화면의 버튼으로 처리한다.
- 보내는 주소 `noreply@yeonhyuk.me`. 입력 칸 아래 개인정보 안내.

### 4. 배포

- 루트 `docs/deploy.md`의 구조대로: vive-infra에 `sites/vive-museum`(주소 `vive-museum.yeonhyuk.me`), 이 저장소에 `deploy/site.json`과 `.github/workflows/deploy.yml`.
- Cloudflare Web Analytics 스크립트를 붙인다.
- Open Graph 미리보기(사이트 전체, 가능하면 전시품마다).

### 사용자가 할 일 (그때 모아서 알린다)

- vive-infra PR 병합, 배포용 IAM 키 발급, 이 저장소에 Secrets·Variables 입력
- SES 도메인 인증, 받는 주소 확인, 샌드박스 해제 신청
- Turnstile 사이트 키, 이슈를 만들 GitHub 토큰
- 다른 프로젝트의 배포 토큰이 이 저장소에 `repository_dispatch`를 보낼 수 있게 범위 넓히기
