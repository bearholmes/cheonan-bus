# 천안버스 (Cheonan Bus)

Pure WebGL 기반 3D 버스 운행 게임 프로젝트입니다.  

## Tech Stack
- `Vite`
- `WebGL (pure)`
- `gl-matrix`
- `Playwright` (시나리오 검증)

## Quick Start
```bash
git clone <repo-url>
cd BusDriveVite-prod
npm install
npm run dev
```

## Scripts
- `npm run dev`: 개발 서버 실행 (`0.0.0.0:5173`)
- `npm run build`: 프로덕션 빌드
- `npm run preview`: 빌드 결과 미리보기 (`0.0.0.0:4173`)

## Controls
- `Enter` / `Space`: 메뉴/결과 화면에서 운행 시작
- `W` / `ArrowUp`: 가속
- `S` / `ArrowDown`: 브레이크
- `R`: 후진
- `A,D` / `ArrowLeft,ArrowRight`: 조향
- `Space`: 정지 상태에서 도어 열기/닫기
- `F`: 전체화면 토글

## Test Hooks
- `window.render_game_to_text()`: 현재 플레이 상태 JSON 반환
- `window.advanceTime(ms)`: 고정 스텝 기반 시간 전진

## Project Structure
```text
src/
  game/        # 상태/입력/HUD/게임 루프
  renderer/    # WebGL 렌더러
  math/        # 수학 유틸(gl-matrix 래핑)
```

