Original prompt: 어설픈 2.5d로 인해 트랙과 지형지물이 깜박거리고, 고속이나 커브에서는 객체사이에 틈이나 줄이 보이고 매우 깜빡거림. 그리고 차량 움직일시 뚝둑 끊기고 출렁거림. 이로 인해 ai 들과 수정을 15시간 넘게 시도하였으나, 다들 코드를 엉망으로 만들고, 리셋을 시켜버리거나 수습불가능한 상태로 만들어버림. 결국 문제는 트랙,차량을 표현하는 방법이 문제가 많다는 결론. 그래서 true 3d로 전면 재작성하려고 함. 단, 차량과 트랙만 작업할게 아니라 지형지물(정류장, 나무 등)도 동일한 방식으로 같이 마이그레이션이 되어야함. 창작하지 말것 안되면 재문의. 그리고 정류장 게임 로직은 그대로 유지되어야 할 것. 기능 유지해야 함 지맘대로 창작하거나 수정하지말것 절대 리셋은 불허하며, 원인을 찾아서 수정을 해야지 땜질 처방이나 순간 모면을 위한 리셋은 절대 하지 말것.

## Work Log
- Context loaded: renderer uses camera-space segment stacking (2.5D-like), causing seam/flicker risk under curvature and speed.
- Plan locked: migrate track/car/props/stop-marker to one world-coordinate pipeline while preserving stop/game logic in updateState.

- Updated: rewrote src/game/state.js to world-space track/sample/prop/stop generation while preserving stop logic flow.
- Updated: rewrote src/renderer/scene.js to world-space camera + rendering pipeline (bus/track/props/stop marker in same coordinate system).

- Patch: fixed render-state interpolation handoff (game.js) to remove stutter from mismatched state references.
- Patch: fixed heading sign/camera smoothing in scene.js to align steering direction with visible motion.
- Patch: increased near prop spawn offset and skipped immediate forward segments in state.js to prevent bus-obstacle overlap in camera.
