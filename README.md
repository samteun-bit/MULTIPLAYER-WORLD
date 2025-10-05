# Multiplayer World

WebRTC 기반 P2P 멀티플레이어 3D 게임입니다. GitHub Pages에서 완전히 서버리스로 작동합니다.

## 🎮 플레이하기

1. **호스트 생성**: "Host Game" 버튼을 클릭하여 방을 만듭니다
2. **방 코드 공유**: 생성된 6자리 코드를 친구들에게 공유합니다
3. **게임 참가**: 친구들은 "Join Game"을 클릭하고 방 코드를 입력합니다
4. **게임 시작**: 호스트가 "Start Game"을 클릭하면 게임이 시작됩니다

## 🎯 조작법

- **W/A/S/D**: 이동 (카메라 기준 방향)
- **Space**: 점프
- **P**: 카메라 90° 반시계 회전
- **O**: 카메라 90° 시계 회전

## 🚀 GitHub Pages 배포

### 1. Firebase 프로젝트 생성 (선택사항)

기본 설정으로 데모 Firebase를 사용하지만, 프로덕션에서는 자신의 Firebase 프로젝트를 만드는 것을 권장합니다:

1. [Firebase Console](https://console.firebase.google.com/)에서 새 프로젝트 생성
2. Realtime Database 활성화
3. 규칙을 다음과 같이 설정:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true,
        ".indexOn": ["createdAt"]
      }
    }
  }
}
```

4. `networking.js` 파일의 `firebaseConfig` 업데이트:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  databaseURL: "https://YOUR_PROJECT.firebaseio.com",
  projectId: "YOUR_PROJECT_ID"
};
```

### 2. GitHub Pages 설정

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
- **PeerJS**: WebRTC P2P 연결
- **Firebase Realtime Database**: 방 관리 및 시그널링
- **Vanilla JavaScript**: 프레임워크 없이 순수 JS

## 📝 작동 원리

1. **호스트**: 게임 시뮬레이션을 실행하고 모든 클라이언트에게 상태를 브로드캐스트
2. **클라이언트**: 입력을 호스트에게 전송하고 게임 상태를 수신하여 렌더링
3. **WebRTC**: 완전한 P2P 연결로 서버 없이 실시간 통신
4. **Firebase**: 방 생성/참가를 위한 시그널링 서버 역할

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
