# 우리 집 Kid Hub

가족용 모바일 PWA — 할 일(To-dos)·일정(EVENTS)·경험 기록(Experiences)을 한 화면에서 관리합니다.

- 주소: https://jungmookyung.github.io/family/kid-hub/
- 데이터: 브라우저 `localStorage`에 자동 저장(오프라인 사용 가능)
- 동기화: 설정에서 GitHub Personal Access Token을 한 번 저장하면, 비공개 저장소 `mk-automation`의 `kid-hub` 브랜치 `data.json`과 `SYNC` 버튼으로 주고받습니다.
  - 토큰은 이 브라우저의 localStorage에만 저장되며, JSON 내보내기 파일에는 포함되지 않습니다.
  - 원격 변경은 파일 SHA로 비교하고, 양쪽이 모두 바뀐 경우에는 어느 쪽을 남길지 묻습니다.
- JSON 내보내기/가져오기: 파일 다운로드·업로드, 클립보드 복사, 붙여넣기 가져오기.
- 개인정보: 가족 호칭(무경·우경·지우·지민)만 사용하며 연락처·주소·계정 정보는 저장하지 않습니다.

## 파일

| 파일 | 설명 |
| --- | --- |
| `index.html` | 화면 골격 |
| `styles.css` | 다크/라이트 테마 스타일 |
| `app.js` | 상태·렌더링·동기화 로직 |
| `sw.js` | 오프라인 캐시(service worker) |
| `manifest.webmanifest` | PWA 설치 정보 |
| `data.json` | 초기 데이터(첫 실행 시 시드) |
| `icons/` | 앱 아이콘 |
