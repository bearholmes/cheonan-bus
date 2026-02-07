import './style.css'
import { startGame } from './game/game.js'

const app = document.querySelector('#app')
if (!app) {
  throw new Error('Missing #app root element.')
}

app.innerHTML = `
  <canvas id="game-canvas"></canvas>
  <div id="start-overlay" class="overlay">
    <div class="overlay-card">
      <h1>천안 버스 · BUSDRIVE SHIFT</h1>
      <p>정류장에 정차해 승객을 태우고 시간을 연장하세요.</p>
      <p>조작: ↑ 가속 · ↓ 브레이크/후진 · ← → 조향 · F 전체화면</p>
      <button id="start-btn" type="button">START SHIFT</button>
    </div>
  </div>
  <div id="end-overlay" class="overlay hidden">
    <div class="overlay-card">
      <h1>천안 버스 운행 리포트</h1>
      <p id="end-summary">결과 집계중...</p>
      <button id="restart-btn" type="button">RESTART</button>
      <p class="overlay-credits">CHEONAN ROUTE DIVISION · 2026</p>
    </div>
  </div>
  <div id="hud">
    <div class="hud-main">
      <div class="hud-box">
        <div class="hud-label">TIME</div>
        <div class="hud-timer" data-role="timer">045 s</div>
      </div>
      <div class="hud-box">
        <div class="hud-label">SPEED</div>
        <div class="hud-speed-row">
          <span class="hud-speed-value" data-role="speed">000</span>
          <span class="hud-speed-unit">km/h</span>
        </div>
        <div class="hud-meter"><div class="hud-meter-fill" data-role="speed-fill"></div></div>
      </div>
    </div>
    <div class="hud-nav-row">
      <span class="hud-turn" data-role="turn">STRAIGHT</span>
      <span class="hud-nav" data-role="nav">정류장까지 000m</span>
    </div>
    <div class="hud-stop-row">
      <div class="hud-stop-meter"><div class="hud-stop-fill" data-role="stop-fill"></div></div>
      <span class="hud-stop-distance" data-role="stop-distance">000m</span>
    </div>
    <div class="hud-status" data-role="message"></div>
    <div class="hud-stamp" data-role="stamp"></div>
    <div class="hud-toast hidden" data-role="toast"></div>
    <div class="hud-errors" data-role="errors"></div>
  </div>
`

const canvas = document.querySelector('#game-canvas')
const hudRoot = document.querySelector('#hud')
const startOverlay = document.querySelector('#start-overlay')
const endOverlay = document.querySelector('#end-overlay')
const startButton = document.querySelector('#start-btn')
const restartButton = document.querySelector('#restart-btn')
const endSummary = document.querySelector('#end-summary')

if (!canvas || !hudRoot || !startOverlay || !endOverlay || !startButton || !restartButton || !endSummary) {
  throw new Error('Missing required game DOM nodes.')
}

const stopGame = startGame({
  canvas,
  hudRoot,
  startOverlay,
  endOverlay,
  startButton,
  restartButton,
  endSummary
})

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopGame()
  })
}
