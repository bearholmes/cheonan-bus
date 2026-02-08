import { mat4, vec3 } from '../math/mat.js'
import { assertNoGLError, createProgram, drainGLErrors, getInstancedExt } from './gl.js'
import { createCubeGeometry, createPlaneGeometry, createCylinderGeometry, createConeGeometry } from './geometry.js'
import { bindMesh, createMesh, createInstanceBuffer, bindInstancedMesh } from './mesh.js'

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

const VERTEX_SHADER_INSTANCED_SOURCE = `
attribute vec3 a_pos;
attribute vec3 a_col;
attribute mat4 a_model;
uniform mat4 u_vp;
varying vec3 v_col;

void main() {
  gl_Position = u_vp * a_model * vec4(a_pos, 1.0);
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

function createRibbon(gl, maxSegments, color) {
  const vertexCapacity = (maxSegments + 1) * 2
  const vertices = new Float32Array(vertexCapacity * 6)
  const indices = new Uint16Array(maxSegments * 6)

  for (let i = 0; i < maxSegments; i += 1) {
    const a = i * 2
    const b = a + 1
    const c = a + 2
    const d = a + 3
    const idx = i * 6
    indices[idx + 0] = a
    indices[idx + 1] = c
    indices[idx + 2] = b
    indices[idx + 3] = b
    indices[idx + 4] = c
    indices[idx + 5] = d
  }

  const vertexBuffer = gl.createBuffer()
  const indexBuffer = gl.createBuffer()
  if (!vertexBuffer || !indexBuffer) {
    throw new Error('Unable to allocate ribbon buffers.')
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW)

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)

  return {
    vertexBuffer,
    indexBuffer,
    vertices,
    color,
    indexCount: 0
  }
}

function setRibbonVertex(v, base, x, y, z, color) {
  v[base + 0] = x
  v[base + 1] = y
  v[base + 2] = z
  v[base + 3] = color[0]
  v[base + 4] = color[1]
  v[base + 5] = color[2]
}

function updateRibbonGeometry(gl, ribbon, samples, offsetA, offsetB, y, colorFn = null) {
  if (!samples || samples.length < 2) {
    ribbon.indexCount = 0
    return
  }

  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i]
    const ax = s.centerX + s.rightX * offsetA
    const az = s.centerZ + s.rightZ * offsetA
    const bx = s.centerX + s.rightX * offsetB
    const bz = s.centerZ + s.rightZ * offsetB
    const color = colorFn ? colorFn(s) : ribbon.color

    const base = i * 12
    setRibbonVertex(ribbon.vertices, base, ax, y, az, color)
    setRibbonVertex(ribbon.vertices, base + 6, bx, y, bz, color)
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, ribbon.vertexBuffer)
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, ribbon.vertices.subarray(0, samples.length * 12))
  ribbon.indexCount = (samples.length - 1) * 6
}

function drawRibbon(gl, ribbon, positionLocation, colorLocation) {
  if (ribbon.indexCount <= 0) return

  gl.bindBuffer(gl.ARRAY_BUFFER, ribbon.vertexBuffer)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ribbon.indexBuffer)

  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 24, 0)
  gl.enableVertexAttribArray(colorLocation)
  gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 24, 12)

  gl.drawElements(gl.TRIANGLES, ribbon.indexCount, gl.UNSIGNED_SHORT, 0)
}

function isWorldVisible(worldX, worldZ, busX, busZ, forwardX, forwardZ, rightX, rightZ) {
  const dx = worldX - busX
  const dz = worldZ - busZ
  const forward = dx * forwardX + dz * forwardZ
  const lateral = dx * rightX + dz * rightZ
  return forward > -50 && forward < 320 && Math.abs(lateral) < 160
}

export function createSceneRenderer(gl, reportError) {
  const ext = getInstancedExt(gl)
  if (!ext) {
    console.warn('Angle_instanced_arrays not supported, performance may suffer.')
  }

  const program = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE)
  const positionLocation = gl.getAttribLocation(program, 'a_pos')
  const colorLocation = gl.getAttribLocation(program, 'a_col')
  const mvpLocation = gl.getUniformLocation(program, 'u_mvp')

  const programInstanced = createProgram(gl, VERTEX_SHADER_INSTANCED_SOURCE, FRAGMENT_SHADER_SOURCE)
  const positionLocI = gl.getAttribLocation(programInstanced, 'a_pos')
  const colorLocI = gl.getAttribLocation(programInstanced, 'a_col')
  const modelLocI = gl.getAttribLocation(programInstanced, 'a_model')
  const vpLocI = gl.getUniformLocation(programInstanced, 'u_vp')

  if (positionLocation < 0 || colorLocation < 0 || !mvpLocation) {
    throw new Error('Shader attribute/uniform lookup failed.')
  }

  function createBatch(mesh, initialCapacity = 256) {
    const data = new Float32Array(initialCapacity * 16)
    const instanceBuffer = createInstanceBuffer(gl, data, 16)
    const attributes = [{ buffer: instanceBuffer, location: modelLocI, numComponents: 16 }]

    return {
      mesh,
      data,
      count: 0,
      instanceBuffer,
      attributes,
      ensureCapacity(needed) {
        if (this.data.length / 16 < needed) {
          const next = new Float32Array(Math.max(needed, this.data.length * 2) * 16)
          next.set(this.data)
          this.data = next
        }
      },
      add(modelMatrix) {
        if (this.count * 16 + 16 > this.data.length) this.ensureCapacity(this.count + 64)
        this.data.set(modelMatrix, this.count * 16)
        this.count += 1
      },
      flush(viewProjectionMatrix) {
        if (this.count === 0) return

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer.buffer)
        gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.count * 16), gl.DYNAMIC_DRAW)

        bindInstancedMesh(gl, ext, this.mesh, positionLocI, colorLocI, this.attributes)
        gl.uniformMatrix4fv(vpLocI, false, viewProjectionMatrix)

        if (ext) {
          ext.drawElementsInstancedANGLE(gl.TRIANGLES, this.mesh.indexCount, gl.UNSIGNED_SHORT, 0, this.count)
        }

        this.count = 0
      }
    }
  }

  const roadWidth = 19.2
  const rumbleWidth = 2.1
  const shoulderWidth = 7.4
  const grassWidth = 32

  const roadHalf = roadWidth / 2
  const rumbleOuter = roadHalf + rumbleWidth
  const shoulderOuter = rumbleOuter + shoulderWidth
  const grassOuter = shoulderOuter + grassWidth

  const maxSegments = 120
  const ribbonRoad = createRibbon(gl, maxSegments, [0.2, 0.21, 0.23])
  const ribbonShoulderLeft = createRibbon(gl, maxSegments, [0.84, 0.81, 0.72])
  const ribbonShoulderRight = createRibbon(gl, maxSegments, [0.84, 0.81, 0.72])
  const ribbonGrassLeft = createRibbon(gl, maxSegments, [0.17, 0.47, 0.2])
  const ribbonGrassRight = createRibbon(gl, maxSegments, [0.17, 0.47, 0.2])
  const ribbonRumbleLeft = createRibbon(gl, maxSegments, [0.72, 0.72, 0.72])
  const ribbonRumbleRight = createRibbon(gl, maxSegments, [0.72, 0.72, 0.72])

  const groundMesh = createMesh(gl, createPlaneGeometry(220, 220, -0.25, [0.14, 0.39, 0.17]))
  const laneDashMesh = createMesh(gl, createPlaneGeometry(0.25, 2.4, 0.08, [0.95, 0.95, 0.9]))

  const treeTrunkMesh = createMesh(gl, createCylinderGeometry(0.3, 0.4, 1.2, 6, [0.3, 0.2, 0.1]))
  const treeLeavesMesh = createMesh(gl, createConeGeometry(2.2, 3.5, 7, [0.15, 0.45, 0.18]))
  const towerMesh = createMesh(gl, createCubeGeometry(1.4, 5.1, 1.4, [0.38, 0.56, 0.7]))
  const signMesh = createMesh(gl, createCubeGeometry(2.6, 1.3, 0.26, [0.82, 0.9, 0.98]))
  const signPoleMesh = createMesh(gl, createCylinderGeometry(0.12, 0.12, 1.8, 6, [0.18, 0.22, 0.27]))

  const stopPoleMesh = createMesh(gl, createCylinderGeometry(0.1, 0.1, 1.95, 6, [0.17, 0.2, 0.24]))
  const stopBoardMesh = createMesh(gl, createCubeGeometry(0.68, 0.72, 0.1, [0.95, 0.86, 0.23]))
  const stopBenchMesh = createMesh(gl, createCubeGeometry(1.25, 0.2, 0.42, [0.44, 0.3, 0.18]))
  const stopBenchLegMesh = createMesh(gl, createCubeGeometry(0.12, 0.34, 0.12, [0.26, 0.22, 0.18]))
  const stopZoneMesh = createMesh(gl, createPlaneGeometry(5.2, 7.8, 0.015, [0.95, 0.93, 0.35]))
  const stopZoneStripeMesh = createMesh(gl, createPlaneGeometry(4.8, 6.9, 0.02, [0.1, 0.13, 0.16]))
  const stopBeaconMesh = createMesh(gl, createCubeGeometry(0.6, 0.6, 0.6, [1, 0.84, 0.34]))
  const stopBeamMesh = createMesh(gl, createCubeGeometry(0.95, 8.4, 0.95, [0.98, 0.35, 0.25]))
  const stopPillarMesh = createMesh(gl, createCylinderGeometry(0.14, 0.14, 2.4, 6, [0.12, 0.16, 0.2]))

  const busBody = createMesh(gl, createCubeGeometry(3.2, 1.22, 7.05, [0.2, 0.62, 0.28]))
  const busUpper = createMesh(gl, createCubeGeometry(3.05, 1.04, 5.9, [0.13, 0.28, 0.2]))
  const busRoof = createMesh(gl, createCubeGeometry(2.88, 0.22, 6.45, [0.78, 0.82, 0.84]))
  const busWindshield = createMesh(gl, createCubeGeometry(2.56, 0.72, 0.16, [0.53, 0.82, 0.95]))
  const busBumper = createMesh(gl, createCubeGeometry(2.86, 0.28, 0.34, [0.14, 0.16, 0.2]))
  const wheel = createMesh(gl, createCylinderGeometry(0.45, 0.45, 0.45, 16, [0.06, 0.06, 0.07]))

  const treeTrunkBatch = createBatch(treeTrunkMesh)
  const treeLeavesBatch = createBatch(treeLeavesMesh)
  const towerBatch = createBatch(towerMesh)
  const signPoleBatch = createBatch(signPoleMesh)
  const signBatch = createBatch(signMesh)

  const projectionMatrix = mat4.create()
  const viewMatrix = mat4.create()
  const viewProjectionMatrix = mat4.create()
  const modelMatrix = mat4.create()
  const mvpMatrix = mat4.create()
  const busBaseMatrix = mat4.create()
  const partMatrix = mat4.create()

  const eye = vec3.create()
  const target = vec3.create()
  const up = vec3.fromValues(0, 1, 0)

  function drawMesh(mesh, model) {
    bindMesh(gl, mesh, positionLocation, colorLocation)
    mat4.multiply(mvpMatrix, viewProjectionMatrix, model)
    gl.uniformMatrix4fv(mvpLocation, false, mvpMatrix)
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0)
  }

  function queueProp(prop, busX, busZ, forwardX, forwardZ, rightX, rightZ) {
    if (!isWorldVisible(prop.x, prop.z, busX, busZ, forwardX, forwardZ, rightX, rightZ)) return

    const scale = prop.scale

    if (prop.kind === 'tree') {
      mat4.identity(modelMatrix)
      mat4.translate(modelMatrix, modelMatrix, [prop.x, 0.6 * scale, prop.z])
      mat4.scale(modelMatrix, modelMatrix, [scale, scale, scale])
      treeTrunkBatch.add(modelMatrix)

      mat4.identity(modelMatrix)
      mat4.translate(modelMatrix, modelMatrix, [prop.x, 2.2 * scale, prop.z])
      mat4.scale(modelMatrix, modelMatrix, [scale, scale, scale])
      treeLeavesBatch.add(modelMatrix)
      return
    }

    if (prop.kind === 'tower') {
      mat4.identity(modelMatrix)
      mat4.translate(modelMatrix, modelMatrix, [prop.x, 2.2 * scale, prop.z])
      mat4.scale(modelMatrix, modelMatrix, [scale, scale, scale])
      towerBatch.add(modelMatrix)
      return
    }

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [prop.x, 0.95 * scale, prop.z])
    mat4.rotateY(modelMatrix, modelMatrix, prop.heading || 0)
    mat4.scale(modelMatrix, modelMatrix, [scale, scale, scale])
    signPoleBatch.add(modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [prop.x, 1.9 * scale, prop.z])
    mat4.rotateY(modelMatrix, modelMatrix, prop.heading || 0)
    mat4.scale(modelMatrix, modelMatrix, [scale, scale, scale])
    signBatch.add(modelMatrix)
  }

  function drawStopMarker(stopMarker, distanceToStop, busX, busZ, forwardX, forwardZ, rightX, rightZ) {
    if (!stopMarker) return
    if (!isWorldVisible(stopMarker.x, stopMarker.z, busX, busZ, forwardX, forwardZ, rightX, rightZ)) return

    const near = Math.abs(distanceToStop) < 60
    const flash = near ? 1.2 : 1

    const heading = stopMarker.heading || 0
    const poleX = stopMarker.x
    const poleZ = stopMarker.z
    const zoneX = stopMarker.zoneX ?? stopMarker.centerX
    const zoneZ = stopMarker.zoneZ ?? stopMarker.centerZ

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [zoneX, 0.02, zoneZ])
    mat4.rotateY(modelMatrix, modelMatrix, heading)
    drawMesh(stopZoneMesh, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [zoneX, 0.025, zoneZ])
    mat4.rotateY(modelMatrix, modelMatrix, heading)
    drawMesh(stopZoneStripeMesh, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [poleX, 1.0, poleZ])
    drawMesh(stopPoleMesh, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [zoneX, 1.25, poleZ - 0.4])
    drawMesh(stopPillarMesh, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [poleX, 2.15, poleZ])
    drawMesh(stopBoardMesh, modelMatrix)

    const benchX = stopMarker.side === 'right' ? poleX - 1.1 : poleX + 1.1
    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [benchX, 0.45, poleZ + 0.2])
    drawMesh(stopBenchMesh, modelMatrix)

    for (const leg of [-0.45, 0.45]) {
      mat4.identity(modelMatrix)
      mat4.translate(modelMatrix, modelMatrix, [benchX + leg, 0.22, poleZ + 0.2])
      drawMesh(stopBenchLegMesh, modelMatrix)
    }

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [poleX, 2.75, poleZ])
    mat4.scale(modelMatrix, modelMatrix, [flash, flash, flash])
    drawMesh(stopBeaconMesh, modelMatrix)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [zoneX, 4.5, zoneZ])
    mat4.scale(modelMatrix, modelMatrix, [near ? 1.3 : 1, 1, near ? 1.3 : 1])
    drawMesh(stopBeamMesh, modelMatrix)
  }

  function draw(state) {
    const samples = state.roadSamples || []
    if (samples.length < 2) return

    let busIndex = samples.findIndex((s) => s.i === 0)
    if (busIndex < 0) busIndex = Math.min(15, samples.length - 1)

    const busSample = samples[busIndex]
    const laneOffset = state.renderPlayerX ?? state.playerX ?? 0

    const busX = state.renderWorldX ?? state.worldX ?? (busSample.centerX + busSample.rightX * laneOffset)
    const busZ = state.renderWorldZ ?? state.worldZ ?? (busSample.centerZ + busSample.rightZ * laneOffset)
    const busHeading = state.renderWorldYaw ?? state.worldYaw ?? busSample.heading

    const forwardX = Math.sin(busHeading)
    const forwardZ = Math.cos(busHeading)
    const rightX = forwardZ
    const rightZ = -forwardX

    const steeringValue = state.renderSteeringValue ?? state.steeringValue ?? 0

    const lookForwardX = forwardX
    const lookForwardZ = forwardZ
    const lookRightX = lookForwardZ
    const lookRightZ = -lookForwardX

    eye[0] = busX - lookForwardX * 16.8
    eye[1] = 5.3
    eye[2] = busZ - lookForwardZ * 16.8

    target[0] = busX + lookForwardX * 40
    target[1] = 0.95
    target[2] = busZ + lookForwardZ * 40

    const aspect = gl.canvas.width / gl.canvas.height
    mat4.perspective(projectionMatrix, (45 * Math.PI) / 180, aspect, 0.1, 700)
    mat4.lookAt(viewMatrix, eye, target, up)
    mat4.multiply(viewProjectionMatrix, projectionMatrix, viewMatrix)

    gl.useProgram(program)
    gl.clearColor(0.36, 0.67, 0.93, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    mat4.identity(modelMatrix)
    mat4.translate(modelMatrix, modelMatrix, [busX, -0.05, busZ - 10])
    drawMesh(groundMesh, modelMatrix)

    updateRibbonGeometry(gl, ribbonRoad, samples, -roadHalf, roadHalf, 0)
    updateRibbonGeometry(gl, ribbonShoulderLeft, samples, -shoulderOuter, -rumbleOuter, 0)
    updateRibbonGeometry(gl, ribbonShoulderRight, samples, rumbleOuter, shoulderOuter, 0)
    updateRibbonGeometry(gl, ribbonGrassLeft, samples, -grassOuter, -shoulderOuter, 0)
    updateRibbonGeometry(gl, ribbonGrassRight, samples, shoulderOuter, grassOuter, 0)
    updateRibbonGeometry(gl, ribbonRumbleLeft, samples, -rumbleOuter, -roadHalf, 0.08)
    updateRibbonGeometry(gl, ribbonRumbleRight, samples, roadHalf, rumbleOuter, 0.08)

    mat4.identity(modelMatrix)
    mat4.multiply(mvpMatrix, viewProjectionMatrix, modelMatrix)
    gl.uniformMatrix4fv(mvpLocation, false, mvpMatrix)

    drawRibbon(gl, ribbonGrassLeft, positionLocation, colorLocation)
    drawRibbon(gl, ribbonGrassRight, positionLocation, colorLocation)
    drawRibbon(gl, ribbonShoulderLeft, positionLocation, colorLocation)
    drawRibbon(gl, ribbonShoulderRight, positionLocation, colorLocation)
    drawRibbon(gl, ribbonRoad, positionLocation, colorLocation)
    drawRibbon(gl, ribbonRumbleLeft, positionLocation, colorLocation)
    drawRibbon(gl, ribbonRumbleRight, positionLocation, colorLocation)

    for (let i = 0; i < samples.length; i += 1) {
      const s = samples[i]
      if (s.i > 2 && s.segmentIndex % 5 !== 0) {
        mat4.identity(modelMatrix)
        mat4.translate(modelMatrix, modelMatrix, [s.centerX, 0.08, s.centerZ])
        mat4.rotateY(modelMatrix, modelMatrix, s.heading)
        drawMesh(laneDashMesh, modelMatrix)
      }
    }

    for (const prop of state.props || []) {
      queueProp(prop, busX, busZ, forwardX, forwardZ, rightX, rightZ)
    }

    gl.useProgram(programInstanced)
    treeTrunkBatch.flush(viewProjectionMatrix)
    treeLeavesBatch.flush(viewProjectionMatrix)
    towerBatch.flush(viewProjectionMatrix)
    signPoleBatch.flush(viewProjectionMatrix)
    signBatch.flush(viewProjectionMatrix)

    gl.useProgram(program)
    drawStopMarker(state.stopMarker, state.nextStopDistance - state.distance, busX, busZ, forwardX, forwardZ, rightX, rightZ)

    // Bus mesh faces local -Z, while movement forward is +Z in world at yaw=0.
    // Add PI so visual front matches physical forward direction.
    const carYaw = busHeading + Math.PI
    const carRoll = (state.renderCarRoll ?? state.carRoll ?? 0) * 0.18
    const carPitch = (state.renderPitch ?? state.pitch ?? 0) * 0.07

    mat4.identity(busBaseMatrix)
    mat4.translate(busBaseMatrix, busBaseMatrix, [busX, 0.58, busZ])
    mat4.rotateY(busBaseMatrix, busBaseMatrix, carYaw)
    mat4.rotateZ(busBaseMatrix, busBaseMatrix, carRoll)
    mat4.rotateX(busBaseMatrix, busBaseMatrix, carPitch)
    drawMesh(busBody, busBaseMatrix)

    function drawPart(mesh, offset, scale = [1, 1, 1], rotate = [0, 0, 0]) {
      mat4.copy(partMatrix, busBaseMatrix)
      mat4.translate(partMatrix, partMatrix, offset)
      if (rotate[0]) mat4.rotateX(partMatrix, partMatrix, rotate[0])
      if (rotate[1]) mat4.rotateY(partMatrix, partMatrix, rotate[1])
      if (rotate[2]) mat4.rotateZ(partMatrix, partMatrix, rotate[2])
      mat4.scale(partMatrix, partMatrix, scale)
      drawMesh(mesh, partMatrix)
    }

    drawPart(busUpper, [0, 0.87, 0.1])
    drawPart(busRoof, [0, 1.44, 0.05])
    drawPart(busWindshield, [0, 0.74, -3.78])
    drawPart(busBumper, [0, -0.08, -3.72])

    const wheelY = -0.15
    const wheelSpin = (state.renderDistance ?? state.distance ?? 0) * 0.45

    for (const side of [-1, 1]) {
      const frontSteer = steeringValue * 0.35
      drawPart(wheel, [side * 1.45, wheelY, -2.4], [1, 1, 1], [wheelSpin, frontSteer, Math.PI / 2])
      for (const dPos of [-0.2, 0.22]) {
        drawPart(wheel, [side * 1.25 + side * dPos, wheelY, 2.2], [1, 1, 1], [wheelSpin, 0, Math.PI / 2])
      }
    }

    const drawErrors = drainGLErrors(gl)
    if (drawErrors.length > 0) {
      reportError(`WebGL draw error: ${drawErrors.join(', ')}`)
    }
  }

  assertNoGLError(gl, 'scene initialization')

  return {
    draw,
    roadWidth: 13.2,
    roadLength: 5.2 * 80
  }
}
