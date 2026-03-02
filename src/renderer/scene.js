import * as THREE from 'three'

export function createSceneRenderer(canvas, reportError) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // 성능을 위해 비활성화, FXAA 등 후처리가 필요하다면 추후 추가
    powerPreference: 'high-performance'
  })
  renderer.setPixelRatio(1.0)
  renderer.shadowMap.enabled = false
  renderer.info.autoReset = false

  const scene = new THREE.Scene()
  const fogColor = new THREE.Color(0.36, 0.67, 0.93)
  scene.background = fogColor
  // 성능 우선: 고스트 거리의 거리기반 페이드 제거
  const SIMPLE_UNLIT = true

  const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 900)

  camera.position.set(0, 10, -50)
  camera.lookAt(0, 0, 0)

  // 환하고 화사한 환경광 (기존보다 밝은 자연광 톤)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.95)
  scene.add(ambientLight)

  // 주 조명 (태양광) - 방향과 색상을 따뜻하게 조정
  const dirLight = new THREE.DirectionalLight(0xfffaed, 2.5)
  dirLight.position.set(200, 300, -100)
  // 그림자 풀 퀄리티 (범위 확장 및 해상도 극대화)
  dirLight.castShadow = false
  dirLight.shadow.camera.near = 10
  dirLight.shadow.camera.far = 400
  dirLight.shadow.camera.left = -150
  dirLight.shadow.camera.right = 150
  dirLight.shadow.camera.top = 150
  dirLight.shadow.camera.bottom = -150
  dirLight.shadow.bias = -0.0005 // 픽셀 깨짐 방지
  if (!SIMPLE_UNLIT) scene.add(dirLight)

  // 도로 재질 (실제 아스팔트 느낌으로 어둡고 거칠게)
  const materials = {
    ground: new THREE.MeshBasicMaterial({ color: 0x2e4226 }),
    road: new THREE.MeshBasicMaterial({ color: 0x222222 }),
    shoulder: new THREE.MeshBasicMaterial({ color: 0x4a4a4a }),
    rumble: new THREE.MeshBasicMaterial({ color: 0x8a1b1b }),
    laneYellow: new THREE.MeshBasicMaterial({ color: 0xf5cf36 }), // 중앙선 노란색
    laneWhite: new THREE.MeshBasicMaterial({ color: 0xffffff }), // 일반 차선 흰색

    // 나무, 건물 (성능을 위해 음영 연산 최소화)
    treeTrunk: new THREE.MeshBasicMaterial({ color: 0x3d2817 }),
    treeLeaves: new THREE.MeshBasicMaterial({ color: 0x1d4722 }),
    tower: new THREE.MeshBasicMaterial({ color: 0x3d4a57 }),
    signPole: new THREE.MeshBasicMaterial({ color: 0x737a82 }),
    sign: new THREE.MeshBasicMaterial({ color: 0x073163 }),
    stopPole: new THREE.MeshBasicMaterial({ color: 0x2b333d }),
    stopBoard: new THREE.MeshBasicMaterial({ color: 0xf2db3b }),
    stopBench: new THREE.MeshBasicMaterial({ color: 0x704d2e }),
    stopBenchLeg: new THREE.MeshBasicMaterial({ color: 0x42382e }),
    stopZone: new THREE.MeshBasicMaterial({ color: 0xf2ed59 }),
    stopZoneStripe: new THREE.MeshBasicMaterial({ color: 0x1a2129 }),
    stopBeacon: new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6 }), // 푸른색 홀로그램 큐브로 변경
    stopBeam: new THREE.MeshBasicMaterial({ color: 0xfa5940, transparent: true, opacity: 0.7 }),
    stopPillar: new THREE.MeshBasicMaterial({ color: 0x1f2933 }),

    // 버스 부품 (고해상도 디테일을 위한 재질 세분화)
    busBody: new THREE.MeshBasicMaterial({ color: 0x00a35c }), // 시내버스 초록색
    busUpper: new THREE.MeshBasicMaterial({ color: 0xe8e8e8 }), // 상단 흰색
    busWindow: new THREE.MeshBasicMaterial({ color: 0x05131f, transparent: true, opacity: 0.85 }), // 짙은 유리
    busRoof: new THREE.MeshBasicMaterial({ color: 0xcccccc }),
    busBumper: new THREE.MeshBasicMaterial({ color: 0x111111 }),
    busDisplay: new THREE.MeshBasicMaterial({ color: 0xff5500 }), // 전면 LED 전광판 (자체 발광)
    busHeadlight: new THREE.MeshBasicMaterial({ color: 0xffffff }), // 헤드라이트 (자체 발광)
    busTaillight: new THREE.MeshBasicMaterial({ color: 0xff0000 }), // 후미등 (자체 발광)
    busDoor: new THREE.MeshBasicMaterial({ color: 0x1c1c1c }), // 출입구 문
    wheelRim: new THREE.MeshBasicMaterial({ color: 0xcccccc }), // 반짝이는 휠
    wheelTire: new THREE.MeshBasicMaterial({ color: 0x111111 })
  }

  // 지형 초기화
  const groundGeo = new THREE.PlaneGeometry(520, 520)
  const groundMesh = new THREE.Mesh(groundGeo, materials.ground)
  groundMesh.rotation.x = -Math.PI / 2
  groundMesh.position.y = -0.25 // 원본 베이스라인 높이 복원
  groundMesh.receiveShadow = false
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
      if (!SIMPLE_UNLIT) this.geometry.computeVertexNormals()

      this.mesh = new THREE.Mesh(this.geometry, material)
      this.mesh.receiveShadow = false
      // Dynamic ribbons move with streaming samples; avoid stale-bounds culling
      // (especially after removing per-frame bounding recomputation).
      this.mesh.frustumCulled = false
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
      // 치명적인 렉 원인 제거(매 프레임 경계 계산 제거)
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

  // 차선 대쉬 (명확하게 BoxGeometry로 두께를 주어 축 꼬임에서 완전히 해방됨)
  const laneGeo = new THREE.BoxGeometry(0.18, 0.02, 2.4)
  const MAX_LANES = 260
  const laneInstancedMesh = new THREE.InstancedMesh(laneGeo, materials.laneYellow, MAX_LANES)
  laneInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  // Dynamic instance matrices are updated every frame; keep culling off to avoid
  // incorrect bounds-based popping/disappearing on curves.
  laneInstancedMesh.frustumCulled = false
  scene.add(laneInstancedMesh)

  // 3. 인스턴싱 최적화 헬퍼 (배경 오브젝트들 - 성능 최적화를 위해 그림자 캐스팅 해제)
  const MAX_INSTANCES = 220
  function createPropInstanced(geo, mat) {
    const mesh = new THREE.InstancedMesh(geo, mat, MAX_INSTANCES)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.castShadow = false // M1 버벅임의 주범: 수백개 프랍의 그림자 투사를 끔
    mesh.receiveShadow = false
    mesh.frustumCulled = false
    scene.add(mesh)
    return mesh
  }

  // 모던 로우폴리(Low-Poly) 스타일 메쉬 (스케일 원복 복구)
  const treeLeavesGeo = new THREE.DodecahedronGeometry(3.2, 0)
  const treeTrunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 2.4, 7)
  const towerGeo = new THREE.BoxGeometry(2.4, 10.0, 2.4)

  // 고층 빌딩 느낌을 주도록 반사율(roughness) 조정 및 메탈 느낌 추가
  const lowPolyTowerMat = new THREE.MeshBasicMaterial({ color: 0x3d4a57 })
  const lowPolyLeafMat = new THREE.MeshBasicMaterial({ color: 0x1d4722 })

  const propMeshes = {
    treeTrunk: createPropInstanced(treeTrunkGeo, materials.treeTrunk),
    treeLeaves: createPropInstanced(treeLeavesGeo, lowPolyLeafMat),
    tower: createPropInstanced(towerGeo, lowPolyTowerMat),
    signPole: createPropInstanced(new THREE.CylinderGeometry(0.12, 0.12, 1.8, 6), materials.signPole),
    sign: createPropInstanced(new THREE.BoxGeometry(2.6, 1.3, 0.26), materials.sign),
  }

  // 4. 버스 조립 (Group 기반) - 둘리/김밥 비율을 각진 현대 버스로 완전 개조
  const busGroup = new THREE.Group()

  function addPart(geo, mat, offset, castShadow = true) {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(...offset)
    mesh.castShadow = false
    mesh.receiveShadow = false
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
    w.castShadow = false
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
    mesh.castShadow = false
    mesh.receiveShadow = false
    stopGroup.add(mesh)
    return mesh
  }

  // 진짜 버스 정차 공간 직사각형 라인 (4개의 선으로 주차 박스를 만듦)
  const stopZoneGroup = new THREE.Group()
  const zoneMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const l1 = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.015, 0.15), zoneMat)
  l1.position.set(0, 0, 1.4)
  const l2 = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.015, 0.15), zoneMat)
  l2.position.set(0, 0, -1.4)
  const l3 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.015, 3.0), zoneMat)
  l3.position.set(-2.3, 0, 0)
  const l4 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.015, 3.0), zoneMat)
  l4.position.set(2.3, 0, 0)
  l1.receiveShadow = true; l2.receiveShadow = true; l3.receiveShadow = true; l4.receiveShadow = true;
  l1.castShadow = false; l2.castShadow = false; l3.castShadow = false; l4.castShadow = false
  stopZoneGroup.add(l1, l2, l3, l4)
  scene.add(stopZoneGroup)

  // 진짜 한국형 통유리 버스 정류장 쉘터 (렉 없는 경량 재질)
  const shelterGroup = new THREE.Group()
  const shAdd = (geo, mat, x, y, z) => {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y, z)
    mesh.castShadow = false
    mesh.receiveShadow = false
    shelterGroup.add(mesh)
    return mesh
  }

  // 1. 쉘터 지붕
  const roofMat = new THREE.MeshBasicMaterial({ color: 0x223344, transparent: true, opacity: 0.9 })
  shAdd(new THREE.BoxGeometry(1.6, 0.1, 4.6), roofMat, 0, 2.5, 0)

  // 2. 쉘터 유리 (MeshBasicMaterial로 렉 원천 차단)
  const glassMat = new THREE.MeshBasicMaterial({ color: 0x88bbff, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
  shAdd(new THREE.BoxGeometry(0.1, 2.4, 4.4), glassMat, -0.7, 1.25, 0)
  shAdd(new THREE.BoxGeometry(1.5, 2.4, 0.1), glassMat, 0.0, 1.25, -2.2)
  shAdd(new THREE.BoxGeometry(1.5, 2.4, 0.1), glassMat, 0.0, 1.25, 2.2)

  // 3. 뼈대 기둥
  const frameMat = new THREE.MeshBasicMaterial({ color: 0x111111 })
  shAdd(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 8), frameMat, -0.7, 1.25, -2.2)
  shAdd(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 8), frameMat, -0.7, 1.25, 2.2)
  shAdd(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 8), frameMat, 0.7, 1.25, -2.2)
  shAdd(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 8), frameMat, 0.7, 1.25, 2.2)

  // 4. 벤치
  shAdd(new THREE.BoxGeometry(0.6, 0.1, 3.0), materials.stopBench, -0.2, 0.5, 0)
  shAdd(new THREE.BoxGeometry(0.4, 0.5, 0.1), materials.stopBenchLeg, -0.3, 0.25, -1.0)
  shAdd(new THREE.BoxGeometry(0.4, 0.5, 0.1), materials.stopBenchLeg, -0.3, 0.25, 1.0)

  // 5. 정류장 원형 표지판 세우기 (노란 판자 배제)
  const poleGroup = new THREE.Group()
  const pMesh1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 16), materials.stopPole)
  pMesh1.position.set(0, 1.1, 0)
  pMesh1.castShadow = false
  const pMesh2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16), new THREE.MeshBasicMaterial({ color: 0x0077ff }))
  pMesh2.rotation.x = Math.PI / 2
  pMesh2.position.set(0, 2.4, 0)
  pMesh2.castShadow = false
  poleGroup.add(pMesh1, pMesh2)
  poleGroup.position.set(2.0, 0, 0)
  shelterGroup.add(poleGroup)

  // 버스(11.5m) 크기에 맞춰 정류장 및 정지선 스케일 1.8배 뻥튀기 (비율 1:1 완벽 동기화)
  shelterGroup.scale.set(1.8, 1.8, 1.8)
  stopZoneGroup.scale.set(1.8, 1.0, 1.8)

  scene.add(shelterGroup)

  const dummyMatrix = new THREE.Matrix4()
  const posVec = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scaleVec = new THREE.Vector3()
  const Y_AXIS = new THREE.Vector3(0, 1, 0) // 매 프레임 메모리 누수 방지용 상수
  let heavyFrameToggle = 0

  // 렉 없는 초경량 정류장 위치 표시기 복구 (박스 삭제됨)
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.2, depthWrite: false })
  const stopBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 20.0, 8), beamMat)
  scene.add(stopBeam)

  const ENABLE_LANES = true
  const ENABLE_PROPS = true
  const ENABLE_DECOR_RIBBONS = true
  const ENABLE_GRASS_RIBBONS = false
  const LINE_BACK_CULL = -150
  const LINE_FAR_BASE = 420
  const LINE_FAR_SPEED_SCALE = 2.8
  const LINE_FAR_MAX_BONUS = 360
  const PROP_BACK_CULL = -150
  const PROP_FAR_BASE = 400
  const PROP_FAR_SPEED_SCALE = 2.8
  const PROP_FAR_MAX_BONUS = 340
  const PROP_SIDE_CULL = 260
  const decorSamples = []

  function draw(state, dt) {
    const samples = state.roadSamples || []
    if (samples.length < 2) return
    const updateHeavy = true
    const busSample = samples[Math.min(15, samples.length - 1)]
    const laneOffset = state.renderPlayerX ?? state.playerX ?? 0
    const busX = state.renderWorldX ?? state.worldX ?? (busSample.centerX + busSample.rightX * laneOffset)
    const busZ = state.renderWorldZ ?? state.worldZ ?? (busSample.centerZ + busSample.rightZ * laneOffset)
    const busHeading = state.renderWorldYaw ?? state.worldYaw ?? busSample.heading
    const camHeading = busHeading
    const speedAbs = Math.abs(state.speed ?? 0)
    const lineFarCull = LINE_FAR_BASE + Math.min(LINE_FAR_MAX_BONUS, speedAbs * LINE_FAR_SPEED_SCALE)
    const propFarCull = PROP_FAR_BASE + Math.min(PROP_FAR_MAX_BONUS, speedAbs * PROP_FAR_SPEED_SCALE)

    const forwardX = Math.sin(camHeading)
    const forwardZ = Math.cos(camHeading)
    const cullForwardX = Math.sin(camHeading)
    const cullForwardZ = Math.cos(camHeading)
    const cullRightX = cullForwardZ
    const cullRightZ = -cullForwardX

    // Clamp all decorative visibility to the currently sampled road envelope
    // so props/edge lines never appear farther than the road itself.
    let sampleForwardMin = Number.POSITIVE_INFINITY
    let sampleForwardMax = Number.NEGATIVE_INFINITY
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]
      const dx = s.centerX - busX
      const dz = s.centerZ - busZ
      const fd = dx * cullForwardX + dz * cullForwardZ
      if (fd < sampleForwardMin) sampleForwardMin = fd
      if (fd > sampleForwardMax) sampleForwardMax = fd
    }

    const effectiveLineBackCull = Math.max(LINE_BACK_CULL, sampleForwardMin - 8)
    const effectiveLineFarCull = Math.min(lineFarCull, sampleForwardMax + 8)
    const effectivePropBackCull = Math.max(PROP_BACK_CULL, effectiveLineBackCull)
    const effectivePropFarCull = Math.min(propFarCull, effectiveLineFarCull + 24)

    // 1. 카메라 설정 (이전 순수 WebGL의 고정 시점 코드를 정확히 복구하여 빙빙 도는 현상 원천 차단)
    camera.position.set(busX - forwardX * 16.8, 5.3, busZ - forwardZ * 16.8)
    camera.lookAt(busX + forwardX * 40, 0.95, busZ + forwardZ * 40)

    // 조명/그림자 추적
    if (!SIMPLE_UNLIT) {
      dirLight.position.set(busX + 60, 150, busZ - 30)
      dirLight.target.position.set(busX, 0, busZ)
      dirLight.target.updateMatrixWorld()
    }

    // 2. 물리적 바닥 지형이 버스를 무한정 따라다니게 추적 (원본 복원: 코스 이탈 시 허공에 뜨는 문제 완벽 해결)
    groundMesh.position.set(busX, -0.25, busZ - 10)

    // 1. 리본 업데이트
    ribbons.road.update(samples, -roadHalf, roadHalf, 0)
    if (ENABLE_DECOR_RIBBONS) {
      let decorCount = 0
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i]
        const dx = s.centerX - busX
        const dz = s.centerZ - busZ
        const forwardDist = dx * cullForwardX + dz * cullForwardZ
        if (forwardDist < effectiveLineBackCull || forwardDist > effectiveLineFarCull) continue
        decorSamples[decorCount++] = s
      }
      decorSamples.length = decorCount

      ribbons.shoulderL.update(decorSamples, -shoulderOuter, -rumbleOuter, 0)
      ribbons.shoulderR.update(decorSamples, rumbleOuter, shoulderOuter, 0)
      ribbons.rumbleL.update(decorSamples, -rumbleOuter, -roadHalf, 0.08)
      ribbons.rumbleR.update(decorSamples, roadHalf, rumbleOuter, 0.08)
      if (ENABLE_GRASS_RIBBONS) {
        ribbons.grassL.update(decorSamples, -grassOuter, -shoulderOuter, 0)
        ribbons.grassR.update(decorSamples, shoulderOuter, grassOuter, 0)
      } else {
        ribbons.grassL.geometry.setDrawRange(0, 0)
        ribbons.grassR.geometry.setDrawRange(0, 0)
      }
    } else {
      ribbons.shoulderL.geometry.setDrawRange(0, 0)
      ribbons.shoulderR.geometry.setDrawRange(0, 0)
      ribbons.grassL.geometry.setDrawRange(0, 0)
      ribbons.grassR.geometry.setDrawRange(0, 0)
      ribbons.rumbleL.geometry.setDrawRange(0, 0)
      ribbons.rumbleR.geometry.setDrawRange(0, 0)
    }

    // 2. 차선 업데이트 (프레임 드랍 원인 제거: 매 프레임 Color Update는 극한의 부하. 단일 노란색 재질로 통일시켜 해결)
    if (ENABLE_LANES && updateHeavy) {
      let laneIdx = 0
      // 끊어지는 대쉬 라인(한국형 노란 중앙선) 복구 및 % 연산으로 오버랩/렉 원천 차단
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i]
        // 5칸 주기 중 3칸만 그리고 2칸 비워 점선(대쉬) 효과 
        if (s.i > 2 && s.segmentIndex % 6 < 2 && laneIdx < MAX_LANES) {
          dummyMatrix.identity()
          // 차선 꺾임 오류 수정: s.heading 정방향 회전
          dummyMatrix.makeRotationY(s.heading)
          dummyMatrix.setPosition(s.centerX, 0.08, s.centerZ)
          laneInstancedMesh.setMatrixAt(laneIdx++, dummyMatrix)
        }
      }
      laneInstancedMesh.count = laneIdx
      laneInstancedMesh.instanceMatrix.needsUpdate = true
    }
    if (!ENABLE_LANES) {
      laneInstancedMesh.count = 0
    }
    // instanceColor 조작 제거로 M1 Max 렉 완벽 해결

    // 3. 배경 프랍 배치
    const props = state.props || []
    let counts = { treeTrunk: 0, treeLeaves: 0, tower: 0, signPole: 0, sign: 0 }

    if (ENABLE_PROPS && updateHeavy) {
      for (const prop of props) {
        // 카메라 뒤 멀리 있는건 Culling 하되, 가시거리를 대폭 넓혀 팝인(갑자기 나타남) 현상 방지
        const dx = prop.x - busX; const dz = prop.z - busZ
        const forwardDist = dx * cullForwardX + dz * cullForwardZ
        if (forwardDist < effectivePropBackCull || forwardDist > effectivePropFarCull) continue
        const sideDist = Math.abs(dx * cullRightX + dz * cullRightZ)
        if (sideDist > PROP_SIDE_CULL) continue


        const s = prop.scale
        scaleVec.set(s, s, s)

        if (prop.kind === 'tree') {
          if (counts.treeTrunk < MAX_INSTANCES) {
            dummyMatrix.compose(posVec.set(prop.x, 1.2 * s, prop.z), quat.identity(), scaleVec)
            propMeshes.treeTrunk.setMatrixAt(counts.treeTrunk++, dummyMatrix)
            dummyMatrix.compose(posVec.set(prop.x, 3.8 * s, prop.z), quat.identity(), scaleVec)
            propMeshes.treeLeaves.setMatrixAt(counts.treeLeaves++, dummyMatrix)
          }
        } else if (prop.kind === 'tower') {
          if (counts.tower < MAX_INSTANCES) {
            dummyMatrix.compose(posVec.set(prop.x, 5.0 * s, prop.z), quat.identity(), scaleVec)
            propMeshes.tower.setMatrixAt(counts.tower++, dummyMatrix)
          }
        } else {
          // 표지판: GC 렉(버벅임)을 거는 new THREE.Vector3 객체 무한 생성 버그를 상수(Y_AXIS)로 해결
          quat.setFromAxisAngle(Y_AXIS, -(prop.heading || 0))
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
        }

    if (!ENABLE_PROPS) {
      propMeshes.treeTrunk.count = 0
      propMeshes.treeLeaves.count = 0
      propMeshes.tower.count = 0
      propMeshes.signPole.count = 0
      propMeshes.sign.count = 0
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

      // 바닥 정차 구역 주차 박스 라인(Stripe 직사각형) 표시 및 회전
      stopZoneGroup.position.set(zoneX, 0.015, zoneZ)
      stopZoneGroup.rotation.set(0, heading, 0)
      stopZoneGroup.visible = true

      // 정류장(쉘터 등)의 일체형 배치 및 회전
      shelterGroup.position.set(marker.x, 0, marker.z)
      let facingRotation = heading
      if (marker.side === 'right') facingRotation += Math.PI
      shelterGroup.rotation.set(0, facingRotation, 0)
      shelterGroup.visible = true

      // 부하 없는 정적인 위치 마커 표시
      stopBeam.position.set(zoneX, 10.0, marker.z)

      const near = Math.abs(stopDistance) < 60
      beamMat.opacity = near ? 0.4 : 0.15

    } else {
      stopZoneGroup.visible = false
      shelterGroup.visible = false
      stopBeam.visible = false
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
