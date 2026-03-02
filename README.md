# 천안버스 (Cheonan Bus)

Pure WebGL 기반 3D 버스 운행 게임 프로젝트입니다.  

## Gameplay Rules (현행)
- 목표: `120초` 안에 `정류장 8개` 처리
- 성공: `8개 정차 완료`
- 실패: `시간 초과` 또는 `미정차 3회 누적`
- 정차 품질:
  - `Perfect`: 정류장 중심 ±1.5m (보너스 점수 + 시간)
  - `Good`: 기본 보상
  - `Bad`: 보너스 없음
- 승하차 조건: `정류장 박스 내부` + `반경 15m 이내` + `속도 0` + `문 열림`일 때만 진행
- 승하차 수요: 각 정류장마다 `하차 1~4`, `탑승 2~8` 생성
- 승하차 속도: 정차 정확도(Perfect/Good/Bad)에 따라 처리 속도 차등
- 리스크-리워드: 과속/급브레이크/급조향으로 안전도 하락 및 점수 페널티
- 콤보: 연속 정차 성공 시 배율 증가, 미정차/충격 시 콤보 리셋
- 결과: `점수 · 정차성공률 · 안전도 · 등급(S/A/B/C)` 한 줄 표시

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
