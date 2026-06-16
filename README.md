# Game Scoreboard

iPad에서 홈 화면 앱처럼 사용할 수 있는 정적 PWA 점수판입니다.

## 기능

- 참가자 추가, 이름 변경, 활성/비활성 처리
- 라운드별 점수 입력
- 라운드 합계가 0일 때만 저장
- 마지막 사람 자동 계산 옵션
- 누적 점수와 전체 합계 검증
- 라운드 수정, 복제, 삭제
- 브라우저 자동 저장
- JSON 백업/복원
- CSV 내보내기

## 로컬 실행

```powershell
cd C:\game_scoreboard
python -m http.server 8080
```

브라우저에서 다음 주소를 엽니다.

```text
http://localhost:8080
```

같은 Wi-Fi의 iPad에서는 PC의 IP 주소를 사용합니다.

```text
http://PC_IP주소:8080
```

## iPad 단독 사용

PWA 설치와 오프라인 캐시는 HTTPS 주소에서 가장 안정적으로 동작합니다.
GitHub Pages, Cloudflare Pages, NAS HTTPS 정적 웹서버 중 하나에 이 폴더를 올린 뒤 iPad Safari에서 접속하고, 공유 버튼에서 홈 화면에 추가를 선택하세요.

점수 데이터는 iPad 브라우저 안에 저장됩니다. Safari 데이터를 지우거나 기기를 바꾸면 사라질 수 있으므로 중요한 기록은 JSON으로 내보내 백업하세요.

## GitHub Pages 배포

이 폴더 전체를 GitHub 저장소의 루트에 올리고 GitHub Pages를 활성화하면 됩니다.

권장 설정:

- Repository visibility: Public
- Pages source: Deploy from a branch
- Branch: `main`
- Folder: `/root`

배포 후 iPad Safari에서 GitHub Pages 주소를 열고 공유 버튼에서 홈 화면에 추가하세요.
한 번 정상 로드된 뒤에는 앱 파일이 iPad에 캐시되어 PC가 꺼져 있어도 실행할 수 있습니다.
