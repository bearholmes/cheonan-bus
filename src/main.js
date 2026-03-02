import './style.css'
import { startGame } from './game/game.js'

const app = document.querySelector('#app')
if (!app) {
  throw new Error('Missing #app root element.')
}

const introImageSrc = `${import.meta.env.BASE_URL}intro-bus.svg`

app.innerHTML = `
  <canvas id="game-canvas"></canvas>
  <div id="start-overlay" class="overlay overlay-start">
    <div class="start-aura" aria-hidden="true"></div>
    <div class="overlay-card overlay-card-start">
      <img src="${introImageSrc}" class="start-intro-img" alt="천안 버스" />
      <button id="start-btn" type="button">
        <span>START SHIFT</span>
      </button>
    </div>
  </div>
  <div id="help-overlay" class="overlay hidden">
    <div class="overlay-card overlay-card-help">
      <h1>운행 도움말</h1>
      <p>목표: 120초 안에 정류장 8개 처리</p>
      <p>성공: 정차 8/8 완료</p>
      <p>실패: 시간 0초 또는 미정차 3회</p>
      <p>정차 인정: 정류장 박스 + 15m 이내 + 완전 정지 + 문 열림</p>
      <p>미정차 상태: 정류장을 지나쳐 놓치면 1회 누적</p>
      <p>점수: 정차 성공 시 획득 (Perfect > Good > Bad)</p>
      <p class="help-live">
        현재 상태:
        <span data-role="help-stops">정차 0/8</span> ·
        <span data-role="help-missed">미정차 0/3</span> ·
        <span data-role="help-score">점수 0</span> ·
        <span data-role="help-passengers">승객 0/24</span>
      </p>
      <p class="help-close">ESC로 닫기</p>
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
        <div class="hud-label">남은시간</div>
        <div class="hud-timer" data-role="timer">045 s</div>
      </div>
      <div class="hud-box">
        <div class="hud-label hidden">SPEED</div>
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
    <div class="hud-stamp" data-role="stamp"></div>
    <div class="hud-toast hidden" data-role="toast"></div>
    <div class="hud-errors" data-role="errors"></div>
  </div>
`

const canvas = document.querySelector('#game-canvas')
const hudRoot = document.querySelector('#hud')
const startOverlay = document.querySelector('#start-overlay')
const helpOverlay = document.querySelector('#help-overlay')
const endOverlay = document.querySelector('#end-overlay')
const startButton = document.querySelector('#start-btn')
const restartButton = document.querySelector('#restart-btn')
const endSummary = document.querySelector('#end-summary')

if (!canvas || !hudRoot || !startOverlay || !helpOverlay || !endOverlay || !startButton || !restartButton || !endSummary) {
  throw new Error('Missing required game DOM nodes.')
}

const stopGame = startGame({
  canvas,
  hudRoot,
  startOverlay,
  helpOverlay,
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
