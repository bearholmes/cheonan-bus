# BusDriveVite-prod (3D WebGL 2.5D Prototype)

Pure WebGL로 구현한 2.5D 도시 주행 프로토타입입니다.

## 핵심 구성
- 3D WebGL 렌더링(핸드메이드 GLSL + 버퍼 드로우)
- 시가지 타일맵 + 교차로 노드 그래프
- A* 경로 탐색 + 턴-바이-턴 네비
- 시간 제한 미션 루프(도착 2초 시퀀스 / 시간초과 재지령)
- 약한 드리프트/스키드마크 피드백

## 조작
- `W` / `ArrowUp`: 가속
- `S` / `ArrowDown`: 브레이크
- `A` / `ArrowLeft`: 좌회전
- `D` / `ArrowRight`: 우회전
- `Space`: 핸드브레이크
- `F`: 전체화면 토글

## 테스트 훅
- `window.render_game_to_text()`: 현재 플레이 상태 JSON 반환
- `window.advanceTime(ms)`: 고정 스텝 기반 시간 전진

## 실행
```bash
cd ~/Documents/BusDriveVite-prod
npm install
npm run dev
```

## 빌드
```bash
npm run build
```
