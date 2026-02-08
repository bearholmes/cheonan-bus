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
