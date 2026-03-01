Original prompt: 어설픈 2.5d로 인해 트랙과 지형지물이 깜박거리고, 고속이나 커브에서는 객체사이에 틈이나 줄이 보이고 매우 깜빡거림. 그리고 차량 움직일시 뚝둑 끊기고 출렁거림. 이로 인해 ai 들과 수정을 15시간 넘게 시도하였으나, 다들 코드를 엉망으로 만들고, 리셋을 시켜버리거나 수습불가능한 상태로 만들어버림. 결국 문제는 트랙,차량을 표현하는 방법이 문제가 많다는 결론. 그래서 true 3d로 전면 재작성하려고 함. 단, 차량과 트랙만 작업할게 아니라 지형지물(정류장, 나무 등)도 동일한 방식으로 같이 마이그레이션이 되어야함. 창작하지 말것 안되면 재문의. 그리고 정류장 게임 로직은 그대로 유지되어야 할 것. 기능 유지해야 함 지맘대로 창작하거나 수정하지말것 절대 리셋은 불허하며, 원인을 찾아서 수정을 해야지 땜질 처방이나 순간 모면을 위한 리셋은 절대 하지 말것.

## Work Log
- Context loaded: renderer uses camera-space segment stacking (2.5D-like), causing seam/flicker risk under curvature and speed.
- Plan locked: migrate track/car/props/stop-marker to one world-coordinate pipeline while preserving stop/game logic in updateState.

- Updated: rewrote src/game/state.js to world-space track/sample/prop/stop generation while preserving stop logic flow.
- Updated: rewrote src/renderer/scene.js to world-space camera + rendering pipeline (bus/track/props/stop marker in same coordinate system).

- Patch: fixed render-state interpolation handoff (game.js) to remove stutter from mismatched state references.
- Patch: fixed heading sign/camera smoothing in scene.js to align steering direction with visible motion.
- Patch: increased near prop spawn offset and skipped immediate forward segments in state.js to prevent bus-obstacle overlap in camera.
- Patch: replaced direct lateral strafe steering with damped lateral dynamics (accel+damping+recentering) to remove crab-walk motion while preserving stop-game logic.
- Patch: aligned chase camera with track forward vector and removed steer-driven look target drift that caused diagonal road/camera mismatch.
- Patch: bus yaw now follows track heading + dynamic yaw directly (no tiny scaled clamp), reducing 12-o'clock fixed-body look on curves.
- Patch: fixed Space command handling to key-down edge queue (prevents held-space multi-toggle / missed toggle behavior).
- Patch: fixed start-of-run rear road sampling by extrapolating negative-distance track points (removes bottom grass gap at start frame).
- Patch: steering sign re-aligned again to user intent (`A/Left = left`, `D/Right = right`) after regression.
- Patch: HUD stamp text now shows only stage progress (`구간 x/y`), removing stale `대기 중` prefix.
- Patch: fixed route seed behavior to vary per run (startRun now consumes `routeSeed`, stores `activeRouteSeed`, then increments seed). Added `routeSeed` to `render_game_to_text` payload for verification.
- Patch: reduced early straight bias (start straight 70m, lower straight chance/length) to avoid overly long straight openings.
- Patch: expanded world visibility window + larger ground plane to reduce near-horizon/background pop-in.
- Patch: flipped steering sign again to match user requirement explicitly (`A/Left => left yaw`, `D/Right => right yaw`) using `-input.steerAxis` in state integration.
- Correction: steering sign was re-verified with a direct state simulation; final mapping is now `steerInput = input.steerAxis` (`left=-1`, `right=+1`) so left input yields negative yaw/worldX and right yields positive yaw/worldX.
- Patch: steering input decoding is now forced from boolean keys only (`left && !right => -1`, `right && !left => +1`) to eliminate any axis-sign or stale-value inversion path.
- UI Patch: revamped start overlay markup in `src/main.js` with dedicated title-screen classes while preserving `#start-overlay` / `#start-btn` IDs and start flow.
- UI Patch: restyled start title screen in `src/style.css` to align with existing HUD palette/typography (dark transit panel + pixel-like title + yellow start CTA) and simplified content from help-panel style to title-first layout.
- Validation: `npm run build` passes (Vite build OK). Existing Node warning remains: local runtime is Node 18.20.3 while Vite recommends >=20.19.
- Test note: attempted skill Playwright client execution; blocked in this environment due missing browser install/module resolution from skill path. No automated screenshot artifact generated in this turn.
- UI Revision: simplified start screen to title-focused composition only (`천안 버스 / BUSDRIVE SHIFT` + START button), removing helper-style subtitle/kicker/hint blocks that felt inconsistent with gameplay tone.
- UI Revision: tightened start-screen CSS to HUD-consistent palette and pixel typography, centered composition, reduced visual clutter.
- Validation: `npm run build` passes after simplification (same existing Node version warning).
- Gameplay Patch: stop interaction now requires both conditions: inside stop box and within 15m radius (`STOP_ZONE_HALF_*`, `STOP_SERVICE_RADIUS`) using world-space stop interaction check.
- Gameplay Patch: boarding/alighting changed from instant batch to per-passenger flow (`STOP_FLOW_INTERVAL`) with per-stop demand generation (boarding + drop-off), including no-demand dwell branch.
- Gameplay Patch: mission loop clarified and connected: success on `stageStopsDone >= stageStopsTarget` (3 stops), fail on timeout or missed stops reaching 3 (`MAX_MISSED_STOPS`).
- HUD/UX Patch: HUD stamp now shows `목표 정차 x/3 · 미정차 y/3`; start overlay now includes explicit mission/success/fail rules.
- Validation: `npm run build` passes.
- Validation: Playwright loop run via local project client (`.web_game_playwright_client.mjs`) against `http://localhost:4173` with screenshots + state JSON; no console/page errors generated in artifacts (`output/web-game/logic-check-1`, `logic-check-2`).
- Validation: deterministic state simulation via Node confirms (1) far/outside-box no boarding, (2) in-box stop service increments stop count, (3) third serviced stop triggers success, (4) missed-stop accumulation triggers `missed-stops` end state at 3.
- Tooling note: skill path client (`$CODEX_HOME/skills/develop-web-game/scripts/web_game_playwright_client.js`) could not import `playwright` in this environment; used repo-local equivalent client to complete required action/screenshot/state/error verification.
- UI Patch: replaced seat panel from toy-like 6x4 blocks to compact occupancy HUD (count, occupancy bar, empty seats, load rate, strip indicators) in `src/game/hud.js` + `src/style.css`.
- Gameplay Patch: added score/combo loop hooks for stop clear and render text payload (`score`, `combo`, `bestCombo`) plus miss-stop time penalty reset behavior.
- Validation: `npm run build` passes after seat/gameplay patches.
- Validation: Playwright run produced fresh artifacts at `output/web-game/gameplay-refresh-3`; reviewed screenshots for top HUD + seat panel + speedometer bottom-right persistence.
