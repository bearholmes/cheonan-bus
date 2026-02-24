import * as THREE from 'three'

export function createSceneRenderer(canvas, reportError) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // 성능을 위해 비활성화, FXAA 등 후처리가 필요하다면 추후 추가
    powerPreference: 'high-performance'
  })
  renderer.setPixelRatio(1.0)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  const fogColor = new THREE.Color(0.36, 0.67, 0.93)
  scene.background = fogColor
  scene.fog = new THREE.FogExp2(fogColor, 0.002)

  const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 700)

  // 1. 조명 (사실적인 분위기 연출)
  const ambientLight = new THREE.AmbientLight(0xdbe6f2, 0.6) // 하늘빛 환경광
  scene.add(ambientLight)

  const dirLight = new THREE.DirectionalLight(0xfff7e6, 1.2) // 따뜻한 태양광
  dirLight.position.set(200, 300, -100)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.width = 2048
  dirLight.shadow.mapSize.height = 2048
  dirLight.shadow.camera.near = 0.5
  dirLight.shadow.camera.far = 800
  dirLight.shadow.camera.left = -200
  dirLight.shadow.camera.right = 200
  dirLight.shadow.camera.top = 200
  dirLight.shadow.camera.bottom = -200
  dirLight.shadow.bias = -0.001
  scene.add(dirLight)

  // 자주 쓰이는 재질 (PBR)
  const materials = {
    road: new THREE.MeshStandardMaterial({ color: 0x33353b, roughness: 0.8 }),
    shoulder: new THREE.MeshStandardMaterial({ color: 0xd6cfb8, roughness: 0.9 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x2b7833, roughness: 1.0 }),
    rumble: new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.9 }),
    ground: new THREE.MeshStandardMaterial({ color: 0x24632b, roughness: 1.0 }),
    lane: new THREE.MeshBasicMaterial({ color: 0xf2f2e6 }), // 빛에 영향을 받지 않도록
    treeTrunk: new THREE.MeshStandardMaterial({ color: 0x4d331a, roughness: 0.9 }),
    treeLeaves: new THREE.MeshStandardMaterial({ color: 0x26732e, roughness: 0.8 }),
    tower: new THREE.MeshStandardMaterial({ color: 0x618fB3, roughness: 0.5 }),
    sign: new THREE.MeshStandardMaterial({ color: 0xd1e6fa, roughness: 0.4 }),
    signPole: new THREE.MeshStandardMaterial({ color: 0x2e3845, roughness: 0.6, metalness: 0.5 }),
    stopPole: new THREE.MeshStandardMaterial({ color: 0x2b333d, roughness: 0.6 }),
    stopBoard: new THREE.MeshStandardMaterial({ color: 0xf2db3b, roughness: 0.4 }),
    stopBench: new THREE.MeshStandardMaterial({ color: 0x704d2e, roughness: 0.8 }),
    stopBenchLeg: new THREE.MeshStandardMaterial({ color: 0x42382e, roughness: 0.6 }),
    stopZone: new THREE.MeshStandardMaterial({ color: 0xf2ed59, roughness: 0.9 }),
    stopZoneStripe: new THREE.MeshStandardMaterial({ color: 0x1a2129, roughness: 0.9 }),
    stopBeacon: new THREE.MeshBasicMaterial({ color: 0xffd657 }), // 야간에도 빛나게 Basic
    stopBeam: new THREE.MeshBasicMaterial({ color: 0xfa5940, transparent: true, opacity: 0.7 }),
    stopPillar: new THREE.MeshStandardMaterial({ color: 0x1f2933, roughness: 0.6 }),

    // 버스 부품 (반사를 줘서 입체감을 살린 페인트 및 금속 재질)
    busBody: new THREE.MeshStandardMaterial({ color: 0x247a3f, roughness: 0.2, metalness: 0.3 }),
    busUpper: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3 }),
    busWindow: new THREE.MeshStandardMaterial({ color: 0x10212e, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.85 }),
    busRoof: new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.6 }),
    busBumper: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }),
    wheelRim: new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.7 }),
    wheelTire: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 })
  }

  // 지형 초기화
  const groundGeo = new THREE.PlaneGeometry(520, 520)
  const groundMesh = new THREE.Mesh(groundGeo, materials.ground)
  groundMesh.rotation.x = -Math.PI / 2
  groundMesh.position.y = -0.25
  groundMesh.receiveShadow = true
  scene.add(groundMesh)

  // 2. 리본 버퍼(차도/인도) 동적 관리를 위한 헬퍼 클래스
  class DynamicRibbon {
    constructor(maxSegments, material) {
      this.geometry = new THREE.BufferGeometry()
      const maxVertices = (maxSegments + 1) * 2
      const positions = new Float32Array(maxVertices * 3)
      this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

      const indices = new Array(maxSegments * 6)
      for (let i = 0; i < maxSegments; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3
        const idx = i * 6
        indices[idx] = a; indices[idx + 1] = c; indices[idx + 2] = b
        indices[idx + 3] = b; indices[idx + 4] = c; indices[idx + 5] = d
      }
      this.geometry.setIndex(indices)
      this.geometry.setDrawRange(0, 0)
      this.geometry.computeVertexNormals() // 실시간 조명 적용을 위해 필요

      this.mesh = new THREE.Mesh(this.geometry, material)
      this.mesh.receiveShadow = true
      // scene.add(this.mesh)
    }

    update(samples, offsetA, offsetB, yPos) {
      if (!samples || samples.length < 2) {
        this.geometry.setDrawRange(0, 0)
        return
      }

      const positions = this.geometry.attributes.position.array
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i]
        const ax = s.centerX + s.rightX * offsetA
        const az = s.centerZ + s.rightZ * offsetA
        const bx = s.centerX + s.rightX * offsetB
        const bz = s.centerZ + s.rightZ * offsetB

        const base = i * 6
        positions[base] = ax; positions[base + 1] = yPos; positions[base + 2] = az
        positions[base + 3] = bx; positions[base + 4] = yPos; positions[base + 5] = bz
      }

      this.geometry.attributes.position.needsUpdate = true
      this.geometry.computeVertexNormals()
      this.geometry.setDrawRange(0, (samples.length - 1) * 6)
    }
  }

  const maxSegments = 600
  const ribbons = {
    road: new DynamicRibbon(maxSegments, materials.road),
    shoulderL: new DynamicRibbon(maxSegments, materials.shoulder),
    shoulderR: new DynamicRibbon(maxSegments, materials.shoulder),
    grassL: new DynamicRibbon(maxSegments, materials.grass),
    grassR: new DynamicRibbon(maxSegments, materials.grass),
    rumbleL: new DynamicRibbon(maxSegments, materials.rumble),
    rumbleR: new DynamicRibbon(maxSegments, materials.rumble),
  }
  Object.values(ribbons).forEach(r => scene.add(r.mesh))

  const roadWidth = 19.2
  const rumbleWidth = 2.1
  const shoulderWidth = 7.4
  const grassWidth = 32

  const roadHalf = roadWidth / 2
  const rumbleOuter = roadHalf + rumbleWidth
  const shoulderOuter = rumbleOuter + shoulderWidth
  const grassOuter = shoulderOuter + grassWidth

  // 차선 대쉬
  const laneGeo = new THREE.PlaneGeometry(0.25, 2.4)
  laneGeo.rotateX(-Math.PI / 2) // 땅을 보게
  let laneInstancedMesh = null

  // 3. 인스턴싱 최적화 헬퍼 (배경 오브젝트들)
  const MAX_INSTANCES = 500
  function createPropInstanced(geo, mat) {
    const mesh = new THREE.InstancedMesh(geo, mat, MAX_INSTANCES)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
    return mesh
  }

  const propMeshes = {
    treeTrunk: createPropInstanced(new THREE.CylinderGeometry(0.3, 0.4, 1.2, 8), materials.treeTrunk),
    treeLeaves: createPropInstanced(new THREE.ConeGeometry(2.2, 3.5, 8), materials.treeLeaves),
    tower: createPropInstanced(new THREE.BoxGeometry(1.4, 5.1, 1.4), materials.tower),
    signPole: createPropInstanced(new THREE.CylinderGeometry(0.12, 0.12, 1.8, 8), materials.signPole),
    sign: createPropInstanced(new THREE.BoxGeometry(2.6, 1.3, 0.26), materials.sign),
  }

  // 4. 버스 조립 (Group 기반) - 실제 대형 버스(운전석이 낮고 차체가 긴) 비율 적용
  const busGroup = new THREE.Group()

  function addPart(geo, mat, x, y, z, castShadow = true) {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y, z)
    mesh.castShadow = castShadow
    mesh.receiveShadow = true
    busGroup.add(mesh)
    return mesh
  }

  // 버스 메인 바디 (길이 연장, 얄상하게)
  addPart(new THREE.BoxGeometry(2.8, 1.2, 10.5), materials.busBody, 0, 0.5, 0)
  // 유리창 (바디보다 살짝 작게, 길게)
  addPart(new THREE.BoxGeometry(2.85, 1.1, 10.3), materials.busWindow, 0, 1.6, 0, false)
  // 상단 지붕대
  addPart(new THREE.BoxGeometry(2.7, 1.3, 10.5), materials.busUpper, 0, 1.5, 0)
  // 에어컨 루프 (살짝 앞쪽으로 배치)
  addPart(new THREE.BoxGeometry(2.4, 0.25, 4.0), materials.busRoof, 0, 2.25, -1.0)
  // 앞뒤 범퍼
  addPart(new THREE.BoxGeometry(2.9, 0.35, 0.3), materials.busBumper, 0, 0.0, -5.3)
  addPart(new THREE.BoxGeometry(2.9, 0.35, 0.3), materials.busBumper, 0, 0.0, 5.3)

  // 바퀴 ("김밥"처럼 굵은 형태 제거, 반경은 살리고 폭을 얇게)
  const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.25, 24)
  wheelGeo.rotateZ(Math.PI / 2) // 실린더를 뉘여서 바퀴 모양으로
  const wheels = []

  function createWheel(x, y, z) {
    const anchor = new THREE.Group() // 조향 회전을 위한 앵커 그룹
    anchor.position.set(x, y, z)

    const w = new THREE.Mesh(wheelGeo, materials.wheelTire)
    w.castShadow = true
    anchor.add(w)

    busGroup.add(anchor)
    wheels.push({ anchor, mesh: w })
  }

  const wheelY = -0.05 // 실제 바닥(-0.5) 근처로 약간 위로 조정
  // 전륜 (조향 가능, 1축)
  createWheel(1.4, wheelY, -3.8)
  createWheel(-1.4, wheelY, -3.8)
  // 후륜 (이중 타이어, 간격 좁힘)
  createWheel(1.3, wheelY, 3.4); createWheel(1.6, wheelY, 3.4)
  createWheel(-1.3, wheelY, 3.4); createWheel(-1.6, wheelY, 3.4)

  scene.add(busGroup)

  // 정류장 (항상 1개만 활성화된다고 가정, 정적 Mesh로 구성하여 위치만 변경)
  const stopGroup = new THREE.Group()
  const sAdd = (geo, mat, x, y, z) => {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    stopGroup.add(mesh)
    return mesh
  }

  const stopZoneMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 7.8), materials.stopZone)
  stopZoneMesh.rotation.x = -Math.PI / 2
  stopZoneMesh.position.y = 0.015
  stopZoneMesh.receiveShadow = true
  stopGroup.add(stopZoneMesh)

  const stopZoneStripeMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 6.9), materials.stopZoneStripe)
  stopZoneStripeMesh.rotation.x = -Math.PI / 2
  stopZoneStripeMesh.position.y = 0.02
  stopZoneStripeMesh.receiveShadow = true
  stopGroup.add(stopZoneStripeMesh)

  const stopPole = sAdd(new THREE.CylinderGeometry(0.1, 0.1, 1.95, 8), materials.stopPole, 0, 1.0, 0)
  const stopPillar = sAdd(new THREE.CylinderGeometry(0.14, 0.14, 2.4, 8), materials.stopPillar, 0, 1.25, -0.4)
  const stopBoard = sAdd(new THREE.BoxGeometry(0.68, 0.72, 0.1), materials.stopBoard, 0, 2.15, 0)
  const stopBench = sAdd(new THREE.BoxGeometry(1.25, 0.2, 0.42), materials.stopBench, 1.1, 0.45, 0.2) // 기본위치, 동적수정
  const stopBenchL1 = sAdd(new THREE.BoxGeometry(0.12, 0.34, 0.12), materials.stopBenchLeg, 1.1 - 0.45, 0.22, 0.2)
  const stopBenchL2 = sAdd(new THREE.BoxGeometry(0.12, 0.34, 0.12), materials.stopBenchLeg, 1.1 + 0.45, 0.22, 0.2)
  const stopBeacon = sAdd(new THREE.BoxGeometry(0.6, 0.6, 0.6), materials.stopBeacon, 0, 2.75, 0)
  const stopBeam = sAdd(new THREE.BoxGeometry(0.95, 8.4, 0.95), materials.stopBeam, 0, 4.5, 0)

  scene.add(stopGroup)

  const dummyMatrix = new THREE.Matrix4()
  const posVec = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scaleVec = new THREE.Vector3()

  function draw(state, dt) {
    const samples = state.roadSamples || []
    if (samples.length < 2) return
    const busSample = samples.find(s => s.i === 0) || samples[Math.min(15, samples.length - 1)]
    const laneOffset = state.renderPlayerX ?? state.playerX ?? 0
    const busX = state.renderWorldX ?? state.worldX ?? (busSample.centerX + busSample.rightX * laneOffset)
    const busZ = state.renderWorldZ ?? state.worldZ ?? (busSample.centerZ + busSample.rightZ * laneOffset)
    const busHeading = state.renderWorldYaw ?? state.worldYaw ?? busSample.heading

    const forwardX = Math.sin(busHeading)
    const forwardZ = Math.cos(busHeading)
    const rightX = forwardZ
    const rightZ = -forwardX

    // 1. 카메라 설정 (이전 순수 WebGL의 고정 시점 코드를 정확히 복구하여 빙빙 도는 현상 원천 차단)
    camera.position.set(busX - forwardX * 16.8, 5.3, busZ - forwardZ * 16.8)
    camera.lookAt(busX + forwardX * 40, 0.95, busZ + forwardZ * 40)

    // 조명/그림자 추적
    dirLight.position.set(busX + 60, 150, busZ - 30)
    dirLight.target.position.set(busX, 0, busZ)
    dirLight.target.updateMatrixWorld()

    // 1. 리본 업데이트
    ribbons.road.update(samples, -roadHalf, roadHalf, 0)
    ribbons.shoulderL.update(samples, -shoulderOuter, -rumbleOuter, 0)
    ribbons.shoulderR.update(samples, rumbleOuter, shoulderOuter, 0)
    ribbons.grassL.update(samples, -grassOuter, -shoulderOuter, 0)
    ribbons.grassR.update(samples, shoulderOuter, grassOuter, 0)
    ribbons.rumbleL.update(samples, -rumbleOuter, -roadHalf, 0.08)
    ribbons.rumbleR.update(samples, roadHalf, rumbleOuter, 0.08)

    // 2. 차선 업데이트 (InstancedMesh 재생성 방식. 차선 개수가 많지 않으므로 매 프레임 업데이트)
    let dashCount = 0
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]
      if (s.i > 2 && s.segmentIndex % 5 !== 0) dashCount++
    }

    if (laneInstancedMesh) {
      scene.remove(laneInstancedMesh)
      laneInstancedMesh.dispose()
    }
    if (dashCount > 0) {
      laneInstancedMesh = new THREE.InstancedMesh(laneGeo, materials.lane, dashCount)
      let idx = 0
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i]
        if (s.i > 2 && s.segmentIndex % 5 !== 0) {
          dummyMatrix.identity()
          dummyMatrix.makeRotationY(-s.heading)
          dummyMatrix.setPosition(s.centerX, 0.08, s.centerZ)
          laneInstancedMesh.setMatrixAt(idx++, dummyMatrix)
        }
      }
      laneInstancedMesh.instanceMatrix.needsUpdate = true
      scene.add(laneInstancedMesh)
    }

    // 3. 배경 프랍 배치
    const props = state.props || []
    let counts = { treeTrunk: 0, treeLeaves: 0, tower: 0, signPole: 0, sign: 0 }

    for (const prop of props) {
      // 카메라 뒤 멀리 있는건 Culling
      const dx = prop.x - busX; const dz = prop.z - busZ
      const forwardDist = dx * forwardX + dz * forwardZ
      if (forwardDist < -90 || forwardDist > 460) continue

      const s = prop.scale
      scaleVec.set(s, s, s)

      if (prop.kind === 'tree') {
        if (counts.treeTrunk < MAX_INSTANCES) {
          dummyMatrix.compose(posVec.set(prop.x, 0.6 * s, prop.z), quat.identity(), scaleVec)
          propMeshes.treeTrunk.setMatrixAt(counts.treeTrunk++, dummyMatrix)
          dummyMatrix.compose(posVec.set(prop.x, 2.2 * s, prop.z), quat.identity(), scaleVec)
          propMeshes.treeLeaves.setMatrixAt(counts.treeLeaves++, dummyMatrix)
        }
      } else if (prop.kind === 'tower') {
        if (counts.tower < MAX_INSTANCES) {
          dummyMatrix.compose(posVec.set(prop.x, 2.2 * s, prop.z), quat.identity(), scaleVec)
          propMeshes.tower.setMatrixAt(counts.tower++, dummyMatrix)
        }
      } else {
        // 표지판
        quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -(prop.heading || 0))
        if (counts.signPole < MAX_INSTANCES) {
          dummyMatrix.compose(posVec.set(prop.x, 0.95 * s, prop.z), quat, scaleVec)
          propMeshes.signPole.setMatrixAt(counts.signPole++, dummyMatrix)
          dummyMatrix.compose(posVec.set(prop.x, 1.9 * s, prop.z), quat, scaleVec)
          propMeshes.sign.setMatrixAt(counts.sign++, dummyMatrix)
        }
      }
    }

    for (let key in counts) {
      propMeshes[key].count = counts[key]
      propMeshes[key].instanceMatrix.needsUpdate = true
    }

    // 4. 버스 배치 및 바퀴 조향
    const carYaw = busHeading + Math.PI // Three.js 카메라와 100% 동일한 회전 동기화를 위해 원본과 똑같이 처리
    const carRoll = -(state.renderCarRoll ?? state.carRoll ?? 0) * 0.18 // 축 방향을 동일하게 맞춤
    const carPitch = -(state.renderPitch ?? state.pitch ?? 0) * 0.07

    busGroup.position.set(busX, 0.45, busZ) // 지면 밀착
    busGroup.rotation.set(-carPitch, carYaw, carRoll, 'YXZ')

    const steeringValue = state.renderSteeringValue ?? state.steeringValue ?? 0
    const wheelSpin = (state.renderDistance ?? state.distance ?? 0) * 0.45
    const frontSteer = steeringValue * 0.35 // 원본 조향 각도 배율

    // 조향(Y축)과 굴러감(X축) 분리
    wheels[0].anchor.rotation.y = frontSteer
    wheels[1].anchor.rotation.y = frontSteer

    wheels.forEach(w => w.mesh.rotation.x = wheelSpin)

    // 5. 정류장
    const marker = state.stopMarker
    const stopDistance = state.nextStopDistance - state.distance
    if (marker && Math.abs(stopDistance) < 500) {
      stopGroup.visible = true

      const zoneX = marker.zoneX ?? marker.centerX
      const zoneZ = marker.zoneZ ?? marker.centerZ
      const heading = marker.heading || 0

      stopZoneMesh.position.set(zoneX, 0.015, zoneZ)
      stopZoneMesh.rotation.z = -heading
      stopZoneStripeMesh.position.set(zoneX, 0.02, zoneZ)
      stopZoneStripeMesh.rotation.z = -heading

      stopPole.position.set(marker.x, 1.0, marker.z)
      stopPillar.position.set(zoneX, 1.25, marker.z - 0.4)
      stopBoard.position.set(marker.x, 2.15, marker.z)

      const benchX = marker.side === 'right' ? marker.x - 1.1 : marker.x + 1.1
      stopBench.position.set(benchX, 0.45, marker.z + 0.2)
      stopBenchL1.position.set(benchX - 0.45, 0.22, marker.z + 0.2)
      stopBenchL2.position.set(benchX + 0.45, 0.22, marker.z + 0.2)

      stopBeacon.position.set(marker.x, 2.75, marker.z)
      stopBeam.position.set(zoneX, 4.5, marker.z)

      const near = Math.abs(stopDistance) < 60
      const flash = near ? 1.2 : 1.0
      stopBeacon.scale.set(flash, flash, flash)
      stopBeam.scale.set(near ? 1.3 : 1, 1, near ? 1.3 : 1)
      materials.stopBeam.opacity = near ? 0.9 : 0.4
    } else {
      stopGroup.visible = false
    }

    try {
      renderer.render(scene, camera)
    } catch (e) {
      reportError("Renderer Error: " + e.message)
    }
  }

  return {
    draw,
    renderer,
    roadWidth: 13.2,
    roadLength: 5.2 * 80
  }
}
