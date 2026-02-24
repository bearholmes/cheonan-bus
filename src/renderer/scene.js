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
  renderer.info.autoReset = false

  const scene = new THREE.Scene()
  const fogColor = new THREE.Color(0.36, 0.67, 0.93)
  scene.background = fogColor
  scene.fog = new THREE.FogExp2(fogColor, 0.002)

  const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 800)

  camera.position.set(0, 10, -50)
  camera.lookAt(0, 0, 0)

  // 환하고 화사한 환경광 (기존보다 밝은 자연광 톤)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.95)
  scene.add(ambientLight)

  // 주 조명 (태양광) - 방향과 색상을 따뜻하게 조정
  const dirLight = new THREE.DirectionalLight(0xfffaed, 2.5)
  dirLight.position.set(200, 300, -100)
  // 그림자 풀 퀄리티 (범위 확장 및 해상도 극대화)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.width = 4096
  dirLight.shadow.mapSize.height = 4096
  dirLight.shadow.camera.near = 10
  dirLight.shadow.camera.far = 400
  dirLight.shadow.camera.left = -150
  dirLight.shadow.camera.right = 150
  dirLight.shadow.camera.top = 150
  dirLight.shadow.camera.bottom = -150
  dirLight.shadow.bias = -0.0005 // 픽셀 깨짐 방지
  scene.add(dirLight)

  // 도로 재질 (실제 아스팔트 느낌으로 어둡고 거칠게)
  const materials = {
    ground: new THREE.MeshStandardMaterial({ color: 0x2e4226, roughness: 1.0, metalness: 0.0 }), // 잔디밭
    road: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.1 }), // 진한 아스팔트
    shoulder: new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.9 }),
    rumble: new THREE.MeshStandardMaterial({ color: 0x8a1b1b, roughness: 0.8 }), // 붉은색 럼블 스트립
    laneYellow: new THREE.MeshBasicMaterial({ color: 0xf5cf36 }), // 중앙선 노란색
    laneWhite: new THREE.MeshBasicMaterial({ color: 0xffffff }), // 일반 차선 흰색

    // 나무, 건물 (성능을 위해 음영 연산 최소화)
    treeTrunk: new THREE.MeshLambertMaterial({ color: 0x3d2817 }),
    treeLeaves: new THREE.MeshLambertMaterial({ color: 0x1d4722 }),
    tower: new THREE.MeshLambertMaterial({ color: 0x3d4a57 }),
    signPole: new THREE.MeshLambertMaterial({ color: 0x737a82 }),
    sign: new THREE.MeshLambertMaterial({ color: 0x073163 }),
    stopPole: new THREE.MeshStandardMaterial({ color: 0x2b333d, roughness: 0.6 }),
    stopBoard: new THREE.MeshStandardMaterial({ color: 0xf2db3b, roughness: 0.4 }),
    stopBench: new THREE.MeshStandardMaterial({ color: 0x704d2e, roughness: 0.8 }),
    stopBenchLeg: new THREE.MeshStandardMaterial({ color: 0x42382e, roughness: 0.6 }),
    stopZone: new THREE.MeshStandardMaterial({ color: 0xf2ed59, roughness: 0.9 }),
    stopZoneStripe: new THREE.MeshStandardMaterial({ color: 0x1a2129, roughness: 0.9 }),
    stopBeacon: new THREE.MeshBasicMaterial({ color: 0xffd657 }), // 야간에도 빛나게 Basic
    stopBeam: new THREE.MeshBasicMaterial({ color: 0xfa5940, transparent: true, opacity: 0.7 }),
    stopPillar: new THREE.MeshStandardMaterial({ color: 0x1f2933, roughness: 0.6 }),

    // 버스 부품 (고해상도 디테일을 위한 재질 세분화)
    busBody: new THREE.MeshStandardMaterial({ color: 0x00a35c, roughness: 0.3, metalness: 0.2 }), // 시내버스 초록색
    busUpper: new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.3, metalness: 0.1 }), // 상단 흰색
    busWindow: new THREE.MeshStandardMaterial({ color: 0x05131f, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.85 }), // 짙은 유리
    busRoof: new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.6 }),
    busBumper: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }),
    busDisplay: new THREE.MeshBasicMaterial({ color: 0xff5500 }), // 전면 LED 전광판 (자체 발광)
    busHeadlight: new THREE.MeshBasicMaterial({ color: 0xffffff }), // 헤드라이트 (자체 발광)
    busTaillight: new THREE.MeshBasicMaterial({ color: 0xff0000 }), // 후미등 (자체 발광)
    busDoor: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.6 }), // 출입구 문
    wheelRim: new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.4, metalness: 0.8 }), // 반짝이는 휠
    wheelTire: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 })
  }

  // 지형 초기화
  const groundGeo = new THREE.PlaneGeometry(520, 520)
  const groundMesh = new THREE.Mesh(groundGeo, materials.ground)
  groundMesh.rotation.x = -Math.PI / 2
  groundMesh.position.y = -0.25 // 원본 베이스라인 높이 복원
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
      this.geometry.computeBoundingSphere() // 핵심 수정: 카메라도로(프러스텀) 컬링 방지를 위한 바운딩 영역 강제 재계산
      this.geometry.computeBoundingBox()    // 이 두 줄이 누락되어 도로가 허공에서 잘려 나갔음
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

  // 차선 대쉬 (매 프레임 생성하던 악성 버그 제거, 1번만 할당하여 재사용)
  const laneGeo = new THREE.PlaneGeometry(0.24, 2.4)
  laneGeo.rotateX(-Math.PI / 2) // 땅을 보게
  const MAX_LANES = 600
  const laneInstancedMesh = new THREE.InstancedMesh(laneGeo, materials.lane, MAX_LANES)
  laneInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  laneInstancedMesh.frustumCulled = false
  scene.add(laneInstancedMesh)

  // 3. 인스턴싱 최적화 헬퍼 (배경 오브젝트들 - 성능 최적화를 위해 그림자 캐스팅 해제)
  const MAX_INSTANCES = 500
  function createPropInstanced(geo, mat) {
    const mesh = new THREE.InstancedMesh(geo, mat, MAX_INSTANCES)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.castShadow = false // M1 버벅임의 주범: 수백개 프랍의 그림자 투사를 끔
    mesh.receiveShadow = true
    mesh.frustumCulled = false
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

  // 4. 버스 조립 (Group 기반) - 둘리/김밥 비율을 각진 현대 버스로 완전 개조
  const busGroup = new THREE.Group()

  function addPart(geo, mat, offset, castShadow = true) {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(...offset)
    mesh.castShadow = castShadow
    mesh.receiveShadow = true
    busGroup.add(mesh)
    return mesh
  }

  // 버스 차체를 위아래로 길고 앞뒤로 늘리며 각지게 (둘리 완벽 탈피, 극한의 디테일 추가)
  // 메인 바디 및 상단부
  addPart(new THREE.BoxGeometry(2.9, 1.4, 11.5), materials.busBody, [0, 0.6, 0])
  addPart(new THREE.BoxGeometry(2.9, 0.4, 11.5), materials.busUpper, [0, 2.5, 0])
  // 루프 에어컨 박스 (2개)
  addPart(new THREE.BoxGeometry(2.2, 0.3, 3.5), materials.busRoof, [0, 2.85, -2.0])
  addPart(new THREE.BoxGeometry(2.2, 0.3, 2.0), materials.busRoof, [0, 2.85, 2.5])

  // 측면 통유리창 (양옆을 덮는 거대한 블랙 글래스)
  addPart(new THREE.BoxGeometry(2.95, 1.3, 9.8), materials.busWindow, [0, 1.65, -0.2], false)
  // 전면 유리창 (운전석 윈드실드)
  addPart(new THREE.BoxGeometry(2.8, 1.5, 0.2), materials.busWindow, [0, 1.8, -5.76], false)
  // 후면 유리창
  addPart(new THREE.BoxGeometry(2.8, 0.8, 0.2), materials.busWindow, [0, 2.0, 5.76], false)

  // 전방 LED 전광판 세부 묘사
  addPart(new THREE.BoxGeometry(2.6, 0.3, 0.1), materials.busDisplay, [0, 2.7, -5.76], false)

  // 헤드라이트 (좌/우 듀얼 라이트 형상화)
  addPart(new THREE.BoxGeometry(0.5, 0.2, 0.1), materials.busHeadlight, [1.0, 0.35, -5.76], false)
  addPart(new THREE.BoxGeometry(0.5, 0.2, 0.1), materials.busHeadlight, [-1.0, 0.35, -5.76], false)

  // 후미등 (테일램프)
  addPart(new THREE.BoxGeometry(0.4, 0.6, 0.1), materials.busTaillight, [1.1, 0.6, 5.76], false)
  addPart(new THREE.BoxGeometry(0.4, 0.6, 0.1), materials.busTaillight, [-1.1, 0.6, 5.76], false)

  // 버스 승측용 출입문 (폴딩도어 느낌)
  addPart(new THREE.BoxGeometry(0.1, 2.3, 1.2), materials.busDoor, [1.46, 1.05, -3.8], false)
  addPart(new THREE.BoxGeometry(0.1, 2.3, 1.2), materials.busDoor, [1.46, 1.05, 1.5], false)

  // 사이드미러 (더듬이 거울 추가)
  addPart(new THREE.CylinderGeometry(0.04, 0.04, 1.0), materials.busBumper, [1.6, 1.8, -5.4]).rotation.z = Math.PI / 4
  addPart(new THREE.BoxGeometry(0.2, 0.5, 0.4), materials.busBumper, [1.9, 1.5, -5.4])
  addPart(new THREE.CylinderGeometry(0.04, 0.04, 1.0), materials.busBumper, [-1.6, 1.8, -5.4]).rotation.z = -Math.PI / 4
  addPart(new THREE.BoxGeometry(0.2, 0.5, 0.4), materials.busBumper, [-1.9, 1.5, -5.4])

  // 범퍼
  addPart(new THREE.BoxGeometry(3.0, 0.4, 0.3), materials.busBumper, [0, -0.1, -5.85])
  addPart(new THREE.BoxGeometry(3.0, 0.4, 0.3), materials.busBumper, [0, -0.1, 5.85])

  // 바퀴 두께(0.25) 유지, 지름(0.5) 
  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.25, 24)
  wheelGeo.rotateZ(Math.PI / 2) // 실린더를 원본처럼 뉘어서 바퀴 모양으로
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

  const wheelY = 0.0
  // 전륜
  createWheel(1.3, wheelY, -4.2)
  createWheel(-1.3, wheelY, -4.2)
  // 후륜 (이중 타이어)
  createWheel(1.2, wheelY, 3.5); createWheel(1.5, wheelY, 3.5)
  createWheel(-1.2, wheelY, 3.5); createWheel(-1.5, wheelY, 3.5)

  scene.add(busGroup)

  // 정류장 (항상 1개만 활성화된다고 가정) - 고퀄리티(두께감 있는 Mesh)로 교체
  const stopGroup = new THREE.Group()
  const sAdd = (geo, mat, x, y, z) => {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    stopGroup.add(mesh)
    return mesh
  }

  // 기존 꼬임이 심하던 PlaneGeometry 대신 얇은 BoxGeometry를 사용하여 Rotation X(-90도)를 안해도 되게 고침. (대각선 근본 원인 해결)
  // 원본 비율에 맞게 크기를 복원 (5.2 * 2배)
  const stopZoneMesh = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.01, 7.8), materials.stopZone)
  stopZoneMesh.receiveShadow = true
  stopGroup.add(stopZoneMesh)

  const stopZoneStripeMesh = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.015, 6.9), materials.stopZoneStripe)
  stopZoneStripeMesh.receiveShadow = true
  stopGroup.add(stopZoneStripeMesh)

  // 정류장 시설물 크기 및 디테일 강화
  const stopPole = sAdd(new THREE.CylinderGeometry(0.15, 0.15, 1.95, 16), materials.stopPole, 0, 1.0, 0)
  const stopPillar = sAdd(new THREE.CylinderGeometry(0.2, 0.2, 2.4, 16), materials.stopPillar, 0, 1.25, -0.4)
  const stopBoard = sAdd(new THREE.BoxGeometry(1.2, 0.9, 0.15), materials.stopBoard, 0, 2.15, 0) // 안내판 크기 확장

  // 벤치 비율 (원래 너무 작았던 것을 넓게 핌)
  const stopBench = sAdd(new THREE.BoxGeometry(2.5, 0.2, 0.6), materials.stopBench, 1.1, 0.45, 0.2)
  const stopBenchL1 = sAdd(new THREE.BoxGeometry(0.15, 0.34, 0.15), materials.stopBenchLeg, 1.1 - 1.0, 0.22, 0.2)
  const stopBenchL2 = sAdd(new THREE.BoxGeometry(0.15, 0.34, 0.15), materials.stopBenchLeg, 1.1 + 1.0, 0.22, 0.2)

  const stopBeacon = sAdd(new THREE.BoxGeometry(0.8, 0.8, 0.8), materials.stopBeacon, 0, 2.8, 0)
  const stopBeam = sAdd(new THREE.BoxGeometry(1.2, 8.4, 1.2), materials.stopBeam, 0, 4.5, 0)

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

    // 2. 물리적 바닥 지형이 버스를 무한정 따라다니게 추적 (원본 복원: 코스 이탈 시 허공에 뜨는 문제 완벽 해결)
    groundMesh.position.set(busX, -0.25, busZ - 10)

    // 1. 리본 업데이트
    ribbons.road.update(samples, -roadHalf, roadHalf, 0)
    ribbons.shoulderL.update(samples, -shoulderOuter, -rumbleOuter, 0)
    ribbons.shoulderR.update(samples, rumbleOuter, shoulderOuter, 0)
    ribbons.grassL.update(samples, -grassOuter, -shoulderOuter, 0)
    ribbons.grassR.update(samples, shoulderOuter, grassOuter, 0)
    ribbons.rumbleL.update(samples, -rumbleOuter, -roadHalf, 0.08)
    ribbons.rumbleR.update(samples, roadHalf, rumbleOuter, 0.08)

    // 2. 차선 업데이트 
    let laneIdx = 0
    // 노란색 이중 중앙선 (고퀄리티 차선 구현)
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]
      if (s.i > 2 && laneIdx < MAX_LANES - 2) {
        // 중앙선 1
        dummyMatrix.identity()
        dummyMatrix.makeRotationY(-s.heading)
        dummyMatrix.setPosition(s.centerX - 0.2, 0.08, s.centerZ)
        laneInstancedMesh.setMatrixAt(laneIdx, dummyMatrix)
        laneInstancedMesh.setColorAt(laneIdx++, new THREE.Color(0xf5cf36))

        // 중앙선 2
        dummyMatrix.identity()
        dummyMatrix.makeRotationY(-s.heading)
        dummyMatrix.setPosition(s.centerX + 0.2, 0.08, s.centerZ)
        laneInstancedMesh.setMatrixAt(laneIdx, dummyMatrix)
        laneInstancedMesh.setColorAt(laneIdx++, new THREE.Color(0xf5cf36))
      }
    }
    laneInstancedMesh.count = laneIdx
    laneInstancedMesh.instanceMatrix.needsUpdate = true
    laneInstancedMesh.instanceColor.needsUpdate = true

    // 3. 배경 프랍 배치
    const props = state.props || []
    let counts = { treeTrunk: 0, treeLeaves: 0, tower: 0, signPole: 0, sign: 0 }

    for (const prop of props) {
      // 카메라 뒤 멀리 있는건 Culling 하되, 가시거리를 대폭 넓혀 팝인(갑자기 나타남) 현상 방지
      const dx = prop.x - busX; const dz = prop.z - busZ
      const forwardDist = dx * forwardX + dz * forwardZ
      if (forwardDist < -120 || forwardDist > 800) continue // 표시 한계를 800m 밖으로 확장


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

    busGroup.position.set(busX, 0.58, busZ) // 원본 지면 밀착 높이(0.58)로 복원
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

      // BoxGeometry 교체로 인해 이제 아주 단순하게 Y축으로만 회전하면 됨 (대각선 버그 사라짐)
      stopZoneMesh.position.set(zoneX, 0.015, zoneZ)
      stopZoneMesh.rotation.set(0, heading, 0)
      stopZoneStripeMesh.position.set(zoneX, 0.02, zoneZ)
      stopZoneStripeMesh.rotation.set(0, heading, 0)

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
