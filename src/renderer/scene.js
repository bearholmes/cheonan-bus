import { mat4, vec3 } from '../math/mat.js'
import { assertNoGLError, createProgram, drainGLErrors } from './gl.js'
import { createCubeGeometry, createPlaneGeometry } from './geometry.js'
import { bindMesh, createMesh } from './mesh.js'

const VERTEX_SHADER_SOURCE = `
attribute vec3 a_pos;
attribute vec3 a_col;
uniform mat4 u_mvp;
varying vec3 v_col;

void main() {
  gl_Position = u_mvp * vec4(a_pos, 1.0);
  v_col = a_col;
}
`

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;
varying vec3 v_col;

void main() {
  gl_FragColor = vec4(v_col, 1.0);
}
`

function drawSegmentBand(drawMesh, modelMatrix, width, depth, y, colorMesh, x, z) {
  mat4.identity(modelMatrix)
  mat4.translate(modelMatrix, modelMatrix, [x, y, z])
  drawMesh(colorMesh, modelMatrix)
}

export function createSceneRenderer(gl, reportError) {
  const program = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE)
  const positionLocation = gl.getAttribLocation(program, 'a_pos')
  const colorLocation = gl.getAttribLocation(program, 'a_col')
  const mvpLocation = gl.getUniformLocation(program, 'u_mvp')

  if (positionLocation < 0 || colorLocation < 0 || !mvpLocation) {
    throw new Error('Shader attribute/uniform lookup failed.')
  }

  const roadDepth = 5.2
  const roadWidth = 19.2
  const rumbleWidth = 2.1
  const shoulderWidth = 7.4
  const grassWidth = 32
  const rumbleOffset = roadWidth / 2 + rumbleWidth / 2
  const shoulderOffset = roadWidth / 2 + rumbleWidth + shoulderWidth / 2
  const grassOffset = roadWidth / 2 + rumbleWidth + shoulderWidth + grassWidth / 2

  const roadMesh = createMesh(gl, createPlaneGeometry(roadWidth, roadDepth, 0, [0.2, 0.21, 0.23]))
  const shoulderMesh = createMesh(gl, createPlaneGeometry(shoulderWidth, roadDepth, 0, [0.84, 0.81, 0.72]))
  const rumbleRedMesh = createMesh(gl, createPlaneGeometry(rumbleWidth, roadDepth, 0.01, [0.88, 0.18, 0.18]))
  const rumbleWhiteMesh = createMesh(gl, createPlaneGeometry(rumbleWidth, roadDepth, 0.01, [0.93, 0.93, 0.9]))
  const grassMesh = createMesh(gl, createPlaneGeometry(grassWidth, roadDepth, 0, [0.17, 0.47, 0.2]))
  const groundMesh = createMesh(gl, createPlaneGeometry(160, 110, -0.02, [0.14, 0.39, 0.17]))
  const laneDashMesh = createMesh(gl, createPlaneGeometry(0.25, 2.4, 0.01, [0.95, 0.95, 0.9]))

  const treeMesh = createMesh(gl, createCubeGeometry(0.9, 1.9, 0.9, [0.2, 0.5, 0.22]))
  const towerMesh = createMesh(gl, createCubeGeometry(1.4, 5.1, 1.4, [0.38, 0.56, 0.7]))
  const signMesh = createMesh(gl, createCubeGeometry(2.6, 1.3, 0.26, [0.82, 0.9, 0.98]))
  const signPoleMesh = createMesh(gl, createCubeGeometry(0.16, 1.8, 0.16, [0.18, 0.22, 0.27]))
  const stopPoleMesh = createMesh(gl, createCubeGeometry(0.14, 1.95, 0.14, [0.17, 0.2, 0.24]))
  const stopBoardMesh = createMesh(gl, createCubeGeometry(0.68, 0.72, 0.1, [0.95, 0.86, 0.23]))
  const stopBenchMesh = createMesh(gl, createCubeGeometry(1.25, 0.2, 0.42, [0.44, 0.3, 0.18]))
  const stopBenchLegMesh = createMesh(gl, createCubeGeometry(0.12, 0.34, 0.12, [0.26, 0.22, 0.18]))
  const stopZoneMesh = createMesh(gl, createPlaneGeometry(5.2, 7.8, 0.015, [0.95, 0.93, 0.35]))
  const stopZoneStripeMesh = createMesh(gl, createPlaneGeometry(4.8, 6.9, 0.02, [0.1, 0.13, 0.16]))
  const stopBeaconMesh = createMesh(gl, createCubeGeometry(0.6, 0.6, 0.6, [1, 0.84, 0.34]))
  const stopBeamMesh = createMesh(gl, createCubeGeometry(0.95, 8.4, 0.95, [0.98, 0.35, 0.25]))
  const stopPillarMesh = createMesh(gl, createCubeGeometry(0.18, 2.4, 0.18, [0.12, 0.16, 0.2]))

  const busBody = createMesh(gl, createCubeGeometry(3.2, 1.22, 7.05, [0.2, 0.62, 0.28]))
  const busUpper = createMesh(gl, createCubeGeometry(3.05, 1.04, 5.9, [0.13, 0.28, 0.2]))
  const busRoof = createMesh(gl, createCubeGeometry(2.88, 0.22, 6.45, [0.78, 0.82, 0.84]))
  const busFrontCap = createMesh(gl, createCubeGeometry(2.9, 0.62, 0.7, [0.16, 0.35, 0.22]))
  const busWindshield = createMesh(gl, createCubeGeometry(2.56, 0.72, 0.16, [0.53, 0.82, 0.95]))
  const busWindowPane = createMesh(gl, createCubeGeometry(0.12, 0.48, 0.72, [0.45, 0.72, 0.88]))
  const busWindowDivider = createMesh(gl, createCubeGeometry(0.08, 0.56, 0.1, [0.14, 0.2, 0.16]))
  const busDoor = createMesh(gl, createCubeGeometry(0.12, 0.78, 1.02, [0.08, 0.22, 0.16]))
  const busStripe = createMesh(gl, createCubeGeometry(3.06, 0.24, 6.85, [0.95, 0.46, 0.18]))
  const busBumper = createMesh(gl, createCubeGeometry(2.86, 0.28, 0.34, [0.14, 0.16, 0.2]))
  const busRoutePlate = createMesh(gl, createCubeGeometry(1.72, 0.3, 0.08, [0.98, 0.63, 0.14]))
  const wheel = createMesh(gl, createCubeGeometry(0.46, 0.46, 0.84, [0.06, 0.06, 0.07]))

  const projectionMatrix = mat4.create()
  const viewMatrix = mat4.create()
  const viewProjectionMatrix = mat4.create()
  const modelMatrix = mat4.create()
  const mvpMatrix = mat4.create()
  let smoothCamX = 0
  let smoothLookX = 0

  function drawMesh(mesh, model) {
    bindMesh(gl, mesh, positionLocation, colorLocation)
    mat4.multiply(mvpMatrix, viewProjectionMatrix, model)
    gl.uniformMatrix4fv(mvpLocation, false, mvpMatrix)
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0)
  }

  function drawProp(prop, worldX, worldZ) {
    const scale = prop.scale
    if (prop.kind === 'tree') {
      mat4.identity(modelMatrix)
      mat4.translate(modelMatrix, modelMatrix, [worldX, 0.86 * scale, worldZ])
      mat4.scale(modelMatrix, modelMatrix, [scale, scale, scale])
      drawMesh(treeMesh, modelMatrix)
      return
    }

    if (prop.kind === 'tower') {
      mat4.identity(modelMatrix)
      mat4.translate(modelMatrix, modelMatrix, [worldX, 2.2 * scale, worldZ])
      mat4.scale(modelMatrix, modelMatrix, [scale, scale, scale])
      drawMesh(towerMesh, modelMatrix)
      return
    }

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [worldX, 0.95 * scale, worldZ])
    mat4.scale(modelMatrix, modelMatrix, [scale, scale, scale])
    drawMesh(signPoleMesh, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [worldX, 1.9 * scale, worldZ])
    mat4.scale(modelMatrix, modelMatrix, [scale, scale, scale])
    drawMesh(signMesh, modelMatrix)
  }

  function drawStopMarker(stopMarker, worldShiftX, distanceToStop) {
    if (!stopMarker) return
    const x = stopMarker.x + worldShiftX
    const z = stopMarker.z
    const near = Math.abs(distanceToStop) < 60
    const flash = near ? 1.2 : 1
    const zoneX = (stopMarker.zoneX ?? stopMarker.centerX ?? 0) + worldShiftX

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [zoneX, 0.02, z])
    drawMesh(stopZoneMesh, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [zoneX, 0.025, z])
    drawMesh(stopZoneStripeMesh, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [x, 1.0, z])
    drawMesh(stopPoleMesh, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [zoneX, 1.25, z - 0.4])
    drawMesh(stopPillarMesh, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [x, 2.15, z])
    drawMesh(stopBoardMesh, modelMatrix)

    const benchX = stopMarker.side === 'right' ? x - 1.1 : x + 1.1
    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [benchX, 0.45, z + 0.2])
    drawMesh(stopBenchMesh, modelMatrix)

    for (const leg of [-0.45, 0.45]) {
      mat4.identity(modelMatrix)
      mat4.translate(modelMatrix, modelMatrix, [benchX + leg, 0.22, z + 0.2])
      drawMesh(stopBenchLegMesh, modelMatrix)
    }

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [x, 2.75, z])
    mat4.scale(modelMatrix, modelMatrix, [flash, flash, flash])
    drawMesh(stopBeaconMesh, modelMatrix)

    // Tall pulse beam so stop location is obvious even at distance.
    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [zoneX, 4.5, z])
    mat4.scale(modelMatrix, modelMatrix, [near ? 1.3 : 1, 1, near ? 1.3 : 1])
    drawMesh(stopBeamMesh, modelMatrix)
  }

  function draw(state) {
    const aspect = gl.canvas.width / gl.canvas.height
    mat4.perspective(projectionMatrix, (69 * Math.PI) / 180, aspect, 0.1, 360)

    gl.clearColor(0.36, 0.67, 0.93, 1)

    const laneOffset = (state.playerX ?? 0) - (state.trackX ?? 0)
    const nearSample = state.roadSamples?.[3]
    const farSample = state.roadSamples?.[12]
    const roadLook = nearSample && farSample ? (farSample.centerX - nearSample.centerX) * 0.08 : 0
    const desiredCamX = 0
    const desiredLookX = 0
    smoothCamX += (desiredCamX - smoothCamX) * 0.04
    smoothLookX += (desiredLookX - smoothLookX) * 0.03
    const cameraX = Math.max(-0.75, Math.min(0.75, smoothCamX))

    const eye = vec3.fromValues(cameraX, 2.86, 17.4)
    const target = vec3.fromValues(cameraX + smoothLookX, 0.78, -21.5)
    const up = vec3.fromValues(0, 1, 0)
    mat4.lookAt(viewMatrix, eye, target, up)
    mat4.multiply(viewProjectionMatrix, projectionMatrix, viewMatrix)

    gl.useProgram(program)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [cameraX * 0.22, -0.02, -40])
    drawMesh(groundMesh, modelMatrix)
    const worldShiftX = 0

    for (let i = 0; i < state.roadSamples.length; i += 1) {
      const sample = state.roadSamples[i]
      const prev = state.roadSamples[Math.max(0, i - 2)]
      const next = state.roadSamples[Math.min(i + 2, state.roadSamples.length - 1)]

      // Blend neighboring centers to avoid segment-by-segment kinks.
      const smoothCenterX = (prev.centerX * 0.27) + (sample.centerX * 0.46) + (next.centerX * 0.27)
      const x = smoothCenterX + worldShiftX
      const z = sample.z

      drawSegmentBand(drawMesh, modelMatrix, 0, 0, 0, roadMesh, x, z)
      const rumbleMesh = Math.floor(sample.segmentIndex / 4) % 2 === 0 ? rumbleRedMesh : rumbleWhiteMesh
      drawSegmentBand(drawMesh, modelMatrix, 0, 0, 0, rumbleMesh, x - rumbleOffset, z)
      drawSegmentBand(drawMesh, modelMatrix, 0, 0, 0, rumbleMesh, x + rumbleOffset, z)
      drawSegmentBand(drawMesh, modelMatrix, 0, 0, 0, shoulderMesh, x - shoulderOffset, z)
      drawSegmentBand(drawMesh, modelMatrix, 0, 0, 0, shoulderMesh, x + shoulderOffset, z)
      drawSegmentBand(drawMesh, modelMatrix, 0, 0, 0, grassMesh, x - grassOffset, z)
      drawSegmentBand(drawMesh, modelMatrix, 0, 0, 0, grassMesh, x + grassOffset, z)

      if (sample.segmentIndex % 5 !== 0) {
        drawSegmentBand(drawMesh, modelMatrix, 0, 0, 0, laneDashMesh, x, z)
      }
    }

    for (const prop of state.props) {
      drawProp(prop, prop.x + worldShiftX, prop.z)
    }
    drawStopMarker(state.stopMarker, worldShiftX, state.nextStopDistance - state.distance)

    const busX = Math.max(-0.75, Math.min(0.75, laneOffset * 0.2))
    const busZ = 8.1
    const carYaw = state.carYaw * 0.45
    const carRoll = state.carRoll * 0.16

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [busX, 0.58, busZ])
    mat4.rotateY(modelMatrix, modelMatrix, carYaw)
    mat4.rotateZ(modelMatrix, modelMatrix, carRoll)
    drawMesh(busBody, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [busX, 1.45, busZ + 0.1])
    mat4.rotateY(modelMatrix, modelMatrix, carYaw)
    mat4.rotateZ(modelMatrix, modelMatrix, carRoll)
    drawMesh(busUpper, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [busX, 1.18, busZ - 3.58])
    mat4.rotateY(modelMatrix, modelMatrix, carYaw)
    mat4.rotateZ(modelMatrix, modelMatrix, carRoll)
    drawMesh(busFrontCap, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [busX, 1.32, busZ - 3.78])
    mat4.rotateY(modelMatrix, modelMatrix, carYaw)
    mat4.rotateZ(modelMatrix, modelMatrix, carRoll)
    drawMesh(busWindshield, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [busX, 0.98, busZ])
    mat4.rotateY(modelMatrix, modelMatrix, carYaw)
    mat4.rotateZ(modelMatrix, modelMatrix, carRoll)
    drawMesh(busStripe, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [busX, 2.02, busZ + 0.05])
    mat4.rotateY(modelMatrix, modelMatrix, carYaw)
    mat4.rotateZ(modelMatrix, modelMatrix, carRoll)
    drawMesh(busRoof, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [busX, 0.5, busZ - 3.72])
    mat4.rotateY(modelMatrix, modelMatrix, carYaw)
    mat4.rotateZ(modelMatrix, modelMatrix, carRoll)
    drawMesh(busBumper, modelMatrix)

    for (const side of [-1, 1]) {
      for (const wz of [-2.2, -0.7, 0.8, 2.1]) {
        mat4.identity(modelMatrix)
        mat4.translate(modelMatrix, modelMatrix, [busX, 1.35, busZ])
        mat4.rotateY(modelMatrix, modelMatrix, carYaw)
        mat4.rotateZ(modelMatrix, modelMatrix, carRoll)
        mat4.translate(modelMatrix, modelMatrix, [side * 1.56, 0, wz])
        drawMesh(busWindowPane, modelMatrix)
      }
    }

    for (const side of [-1, 1]) {
      for (const wz of [-2.95, -1.45, 0.05, 1.55, 2.95]) {
        mat4.identity(modelMatrix)
        mat4.translate(modelMatrix, modelMatrix, [busX, 1.35, busZ])
        mat4.rotateY(modelMatrix, modelMatrix, carYaw)
        mat4.rotateZ(modelMatrix, modelMatrix, carRoll)
        mat4.translate(modelMatrix, modelMatrix, [side * 1.56, 0, wz])
        drawMesh(busWindowDivider, modelMatrix)
      }
    }

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [busX, 1.05, busZ])
    mat4.rotateY(modelMatrix, modelMatrix, carYaw)
    mat4.rotateZ(modelMatrix, modelMatrix, carRoll)
    mat4.translate(modelMatrix, modelMatrix, [1.58, 0, -1.55])
    drawMesh(busDoor, modelMatrix)

    for (const [wx, wz] of [[-1.52, -2.9], [1.52, -2.9], [-1.52, 2.45], [1.52, 2.45]]) {
      mat4.identity(modelMatrix)
      mat4.translate(modelMatrix, modelMatrix, [busX, 0.22, busZ])
      mat4.rotateY(modelMatrix, modelMatrix, carYaw)
      mat4.rotateZ(modelMatrix, modelMatrix, carRoll)
      mat4.translate(modelMatrix, modelMatrix, [wx, 0, wz])
      drawMesh(wheel, modelMatrix)
    }

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [busX, 1.63, busZ - 3.68])
    mat4.rotateY(modelMatrix, modelMatrix, carYaw)
    mat4.rotateZ(modelMatrix, modelMatrix, carRoll)
    drawMesh(busRoutePlate, modelMatrix)

    const drawErrors = drainGLErrors(gl)
    if (drawErrors.length > 0) {
      reportError(`WebGL draw error: ${drawErrors.join(', ')}`)
    }
  }

  assertNoGLError(gl, 'scene initialization')

  return {
    draw,
    roadWidth: 13.2,
    roadLength: roadDepth * 80
  }
}
