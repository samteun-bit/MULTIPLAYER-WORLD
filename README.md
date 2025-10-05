# Multiplayer World

WebRTC 기반 P2P 멀티플레이어 3D 게임입니다. GitHub Pages에서 완전히 서버리스로 작동합니다.

## 🎮 플레이하기

1. **호스트 생성**: "Host Game" 버튼을 클릭하여 방을 만듭니다
2. **Peer ID 공유**: 생성된 Peer ID를 복사하여 친구들에게 공유합니다
3. **게임 참가**: 친구들은 "Join Game"을 클릭하고 호스트의 Peer ID를 붙여넣습니다
4. **게임 시작**: 호스트가 "Start Game"을 클릭하면 게임이 시작됩니다

## 🎯 조작법

- **W/A/S/D**: 이동 (카메라 기준 방향)
- **Space**: 점프
- **P**: 카메라 90° 반시계 회전
- **O**: 카메라 90° 시계 회전

## 🚀 GitHub Pages 배포

### GitHub Pages 설정

1. GitHub 저장소 생성
2. 코드 푸시:

```bash
git add .
git commit -m "Initial commit: WebRTC multiplayer game"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

3. GitHub 저장소 설정:
   - Settings → Pages
   - Source: "Deploy from a branch"
   - Branch: `main` / `root`
   - Save

4. 몇 분 후 `https://YOUR_USERNAME.github.io/YOUR_REPO/`에서 접속 가능

## 🛠️ 기술 스택

- **Three.js**: 3D 렌더링
- **PeerJS**: WebRTC P2P 연결 (클라우드 시그널링 서버 사용)
- **Vanilla JavaScript**: 프레임워크 없이 순수 JS

## 📝 작동 원리

1. **호스트**: 게임 시뮬레이션을 실행하고 모든 클라이언트에게 상태를 브로드캐스트
2. **클라이언트**: 입력을 호스트에게 전송하고 게임 상태를 수신하여 렌더링
3. **WebRTC**: 완전한 P2P 연결로 서버 없이 실시간 통신
4. **Peer ID**: 호스트의 Peer ID를 직접 공유하여 간단하게 연결 (별도 서버 불필요)

## 🔧 로컬 테스트

```bash
# 간단한 HTTP 서버 실행
npx http-server -p 3000

# 또는 Python
python -m http.server 3000

# 브라우저에서 http://localhost:3000 접속
```

## 📄 라이선스

MIT
