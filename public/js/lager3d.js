// 3D Lager Visualisierung - Realistischer Aufbau
const Lager3D = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  raycaster: null,
  mouse: null,
  paletteMeshes: [],
  animationId: null,
  container: null,
  tooltip: null,
  lagerData: {},
  isWalking: false,
  walkPath: [],
  walkIndex: 0,
  cameraTarget: new THREE.Vector3(),
  highlightedMesh: null,
  originalMaterial: null,

  // Hall dimensions (meters, approx)
  HALL_WIDTH: 60,
  HALL_DEPTH: 80,
  HALL_HEIGHT: 12,

  async init(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.container.style.position = 'relative';
    const width = this.container.clientWidth;
    const height = 650;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB);

    // Camera - looking into the hall from front
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 500);
    this.camera.position.set(0, 8, 45);
    this.camera.lookAt(0, 4, -20);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2.05;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 100;
    this.controls.target.set(0, 4, -10);

    // Raycaster
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Lighting
    this.setupLighting();

    // Build environment
    this.buildHall();

    // Load data
    await this.loadData();

    // Build racks with real data
    this.buildRacks();

    // Forklift
    this.createForklift(0, 0, 10);

    // Tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.style.cssText = `
      position:absolute;background:rgba(20,20,35,0.95);color:#fff;padding:12px 16px;
      border-radius:10px;font-size:13px;pointer-events:none;display:none;z-index:100;
      max-width:250px;line-height:1.6;box-shadow:0 8px 24px rgba(0,0,0,0.4);
      border:1px solid rgba(245,197,24,0.3);backdrop-filter:blur(4px);
    `;
    this.container.appendChild(this.tooltip);

    // Info overlay
    this.createInfoOverlay();

    // Events
    this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.renderer.domElement.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('resize', () => this.onResize());

    // Start animation
    this.animate();

    // Smooth intro camera animation
    this.introCameraAnimation();
  },

  setupLighting() {
    // Ambient
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambient);

    // Main hall lights (ceiling strip lights)
    const positions = [[-15, 11, -10], [0, 11, -10], [15, 11, -10], [-15, 11, -35], [0, 11, -35], [15, 11, -35]];
    positions.forEach(pos => {
      const light = new THREE.PointLight(0xfff5e0, 0.6, 40);
      light.position.set(...pos);
      light.castShadow = false;
      this.scene.add(light);

      // Light fixture visual
      const fixture = new THREE.Mesh(
        new THREE.BoxGeometry(3, 0.1, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xffffee })
      );
      fixture.position.set(...pos);
      this.scene.add(fixture);
    });

    // Directional sun from hall opening
    const sunLight = new THREE.DirectionalLight(0xfff8e8, 0.7);
    sunLight.position.set(5, 15, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 120;
    sunLight.shadow.camera.left = -40;
    sunLight.shadow.camera.right = 40;
    sunLight.shadow.camera.top = 40;
    sunLight.shadow.camera.bottom = -40;
    this.scene.add(sunLight);
  },

  buildHall() {
    const W = this.HALL_WIDTH;
    const D = this.HALL_DEPTH;
    const H = this.HALL_HEIGHT;

    // Concrete floor
    const floorTex = this.createConcreteTexture();
    const floorMat = new THREE.MeshLambertMaterial({ map: floorTex });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -D / 2 + 10);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Yellow floor markings - main aisle
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xF5C518 });
    // Left boundary of main aisle
    const lineL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, D - 5), lineMat);
    lineL.position.set(-5, 0.01, -D / 2 + 12);
    this.scene.add(lineL);
    // Right boundary of main aisle
    const lineR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, D - 5), lineMat);
    lineR.position.set(10, 0.01, -D / 2 + 12);
    this.scene.add(lineR);

    // Aisle arrows on floor
    for (let z = 5; z > -55; z -= 15) {
      this.createFloorArrow(2.5, z);
    }

    // Walls
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xd9d9d9, side: THREE.DoubleSide });
    const corrugatedMat = new THREE.MeshLambertMaterial({ color: 0xb8b8b8, side: THREE.DoubleSide });

    // Back wall
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), corrugatedMat);
    backWall.position.set(0, H / 2, -D + 10);
    this.scene.add(backWall);

    // Right wall
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(D, H), corrugatedMat);
    rightWall.position.set(W / 2, H / 2, -D / 2 + 10);
    rightWall.rotation.y = -Math.PI / 2;
    this.scene.add(rightWall);

    // Left wall
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(D, H), corrugatedMat);
    leftWall.position.set(-W / 2, H / 2, -D / 2 + 10);
    leftWall.rotation.y = Math.PI / 2;
    this.scene.add(leftWall);

    // Roof (slightly sloped)
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x999999, side: THREE.DoubleSide });
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(W, D), roofMat);
    roof.rotation.x = Math.PI / 2;
    roof.position.set(0, H, -D / 2 + 10);
    this.scene.add(roof);

    // Roof beams
    const beamMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
    for (let z = 5; z > -D + 10; z -= 8) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, 0.25), beamMat);
      beam.position.set(0, H - 0.5, z);
      this.scene.add(beam);
    }

    // Hall opening (front) - lighter area to show entry
    const openingLight = new THREE.RectAreaLight(0xffffff, 2, W * 0.6, H * 0.8);
    openingLight.position.set(0, H / 2, 10);
    openingLight.lookAt(0, H / 2, -10);
    this.scene.add(openingLight);

    // Outdoor floor in front
    const outdoorMat = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
    const outdoor = new THREE.Mesh(new THREE.PlaneGeometry(W, 20), outdoorMat);
    outdoor.rotation.x = -Math.PI / 2;
    outdoor.position.set(0, -0.01, 20);
    this.scene.add(outdoor);
  },

  createConcreteTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(0, 0, 512, 512);
    // Add subtle noise
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const gray = 160 + Math.random() * 40;
      ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
      ctx.fillRect(x, y, 2, 2);
    }
    // Grid lines (expansion joints)
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;
    for (let i = 0; i < 512; i += 128) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 10);
    return tex;
  },

  createFloorArrow(x, z) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.8);
    shape.lineTo(0.4, 0);
    shape.lineTo(0.15, 0);
    shape.lineTo(0.15, -0.8);
    shape.lineTo(-0.15, -0.8);
    shape.lineTo(-0.15, 0);
    shape.lineTo(-0.4, 0);
    shape.closePath();

    const geo = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({ color: 0xF5C518, transparent: true, opacity: 0.7 });
    const arrow = new THREE.Mesh(geo, mat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.rotation.z = Math.PI;
    arrow.position.set(x, 0.02, z);
    arrow.scale.set(1.5, 1.5, 1);
    this.scene.add(arrow);
  },

  async loadData() {
    const [A, B, C, D, E, F, BL] = await Promise.all([
      fetch('/api/lagerplaetze?regal=A').then(r => r.json()),
      fetch('/api/lagerplaetze?regal=B').then(r => r.json()),
      fetch('/api/lagerplaetze?regal=C').then(r => r.json()),
      fetch('/api/lagerplaetze?regal=D').then(r => r.json()),
      fetch('/api/lagerplaetze?regal=E').then(r => r.json()),
      fetch('/api/lagerplaetze?regal=F').then(r => r.json()),
      fetch('/api/lagerplaetze?regal=BL').then(r => r.json()),
    ]);
    this.lagerData = { A, B, C, D, E, F, BL };
  },

  buildRacks() {
    // LAYOUT:
    // LEFT SIDE: 3 parallel rack rows running front-to-back (Z-axis)
    // Each rack row is double-sided (palettes on both sides of aisle)
    // RIGHT SIDE: 1 rack row along the right wall
    // MIDDLE: Main aisle

    const RACK_LEVELS = 4;
    const LEVEL_HEIGHT = 2.8;
    const RACK_DEPTH_SPACING = 2.8; // spacing along Z for each slot
    const AISLE_WIDTH = 4.0;

    // === LEFT SIDE: 3 rack rows ===
    // Row positions (X): centered around -20
    // Rack row 1 (leftmost, near left wall)
    const leftRows = [
      { x: -27, label: 'A', regal: 'A', slotsPerSide: 25 },
      { x: -20, label: 'B/C', regalLeft: 'B', regalRight: 'C', slotsPerSide: 25 },
      { x: -13, label: 'D', regal: 'D', slotsPerSide: 25 },
    ];

    // Between row 1 and 2: aisle (Stapler Gang 1)
    // Between row 2 and 3: aisle (Stapler Gang 2)

    leftRows.forEach((row, rowIdx) => {
      const startZ = 5;
      const endZ = startZ - row.slotsPerSide * RACK_DEPTH_SPACING;

      // Create rack frame
      for (let slot = 0; slot < row.slotsPerSide; slot++) {
        const z = startZ - slot * RACK_DEPTH_SPACING;
        this.createRackSection(row.x, z, RACK_LEVELS, LEVEL_HEIGHT);
      }

      // Place palettes
      if (row.regal) {
        // Single-regal row (A or D)
        const data = this.lagerData[row.regal] || [];
        this.placePalettesOnRack(data, row.x, startZ, RACK_DEPTH_SPACING, RACK_LEVELS, LEVEL_HEIGHT, row.slotsPerSide);
      } else {
        // Double row (B left, C right)
        const dataLeft = this.lagerData[row.regalLeft] || [];
        const dataRight = this.lagerData[row.regalRight] || [];
        this.placePalettesOnRack(dataLeft, row.x - 1.2, startZ, RACK_DEPTH_SPACING, RACK_LEVELS, LEVEL_HEIGHT, row.slotsPerSide);
        this.placePalettesOnRack(dataRight, row.x + 1.2, startZ, RACK_DEPTH_SPACING, RACK_LEVELS, LEVEL_HEIGHT, row.slotsPerSide);
      }

      // Regal label
      this.addRegalLabel(row.label, row.x, RACK_LEVELS * LEVEL_HEIGHT + 2, startZ + 2);
    });

    // Aisle labels
    this.addFloorLabel('Gang 1', -23.5, 0);
    this.addFloorLabel('Gang 2', -16.5, 0);

    // === RIGHT SIDE: Rack row along right wall ===
    const rightX = 22;
    const rightData_E = this.lagerData.E || [];
    const rightData_F = this.lagerData.F || [];
    const rightSlots = 25;
    const startZ = 5;

    // E-Regal (lower part of right wall rack)
    for (let slot = 0; slot < rightSlots; slot++) {
      const z = startZ - slot * RACK_DEPTH_SPACING;
      this.createRackSection(rightX, z, RACK_LEVELS, LEVEL_HEIGHT);
    }
    this.placePalettesOnRack(rightData_E, rightX, startZ, RACK_DEPTH_SPACING, RACK_LEVELS, LEVEL_HEIGHT, rightSlots);
    this.addRegalLabel('E', rightX, RACK_LEVELS * LEVEL_HEIGHT + 2, startZ + 2);

    // F-Regal (continue behind E along wall)
    const fStartZ = startZ - rightSlots * RACK_DEPTH_SPACING - 3;
    const fSlots = 26;
    for (let slot = 0; slot < fSlots; slot++) {
      const z = fStartZ - slot * RACK_DEPTH_SPACING;
      this.createRackSection(rightX, z, RACK_LEVELS, LEVEL_HEIGHT);
    }
    this.placePalettesOnRack(rightData_F, rightX, fStartZ, RACK_DEPTH_SPACING, RACK_LEVELS, LEVEL_HEIGHT, fSlots);
    this.addRegalLabel('F', rightX, RACK_LEVELS * LEVEL_HEIGHT + 2, fStartZ + 2);

    // === BLOCKLAGER: in back area, ground level ===
    this.buildBlocklagerArea();

    // Main aisle label
    this.addFloorLabel('HAUPTGANG', 2.5, 5);
  },

  createRackSection(x, z, levels, levelHeight) {
    const postMat = new THREE.MeshLambertMaterial({ color: 0x707070 });
    const beamMat = new THREE.MeshLambertMaterial({ color: 0xE8A000 });
    const braceMat = new THREE.MeshLambertMaterial({ color: 0x5a5a5a });
    const totalH = levels * levelHeight + 0.5;

    // 4 vertical posts (corners of section)
    const postPositions = [[-1.2, -0.5], [-1.2, 0.5], [1.2, -0.5], [1.2, 0.5]];
    postPositions.forEach(([dx, dz]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, totalH, 0.08), postMat);
      post.position.set(x + dx, totalH / 2, z + dz);
      post.castShadow = true;
      this.scene.add(post);
    });

    // Horizontal beams (yellow/orange) at each level
    for (let level = 0; level < levels; level++) {
      const y = (level + 1) * levelHeight;
      // Front beam
      const beamF = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.18, 0.12), beamMat);
      beamF.position.set(x, y, z - 0.5);
      this.scene.add(beamF);
      // Back beam
      const beamB = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.18, 0.12), beamMat);
      beamB.position.set(x, y, z + 0.5);
      this.scene.add(beamB);
      // Cross supports
      const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.1), postMat);
      cross1.position.set(x - 1.0, y + 0.05, z);
      this.scene.add(cross1);
      const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.1), postMat);
      cross2.position.set(x + 1.0, y + 0.05, z);
      this.scene.add(cross2);
    }

    // Diagonal X-bracing on the sides
    for (let dz of [-0.5, 0.5]) {
      for (let level = 0; level < levels; level++) {
        const y1 = level * levelHeight + 0.5;
        const y2 = (level + 1) * levelHeight - 0.2;
        const midY = (y1 + y2) / 2;
        const h = y2 - y1;
        const diag = new THREE.Mesh(new THREE.BoxGeometry(0.04, Math.sqrt(h * h + 2.2 * 2.2), 0.04), braceMat);
        diag.position.set(x, midY, z + dz);
        diag.rotation.z = Math.atan2(2.2, h) * (level % 2 === 0 ? 1 : -1);
        this.scene.add(diag);
      }
    }
  },

  placePalettesOnRack(data, x, startZ, zSpacing, levels, levelHeight, maxSlots) {
    for (let i = 0; i < Math.min(data.length, maxSlots * levels); i++) {
      const platz = data[i];
      const slot = Math.floor(i / levels);
      const level = i % levels;
      if (slot >= maxSlots) break;

      const z = startZ - slot * zSpacing;
      const y = level * levelHeight + 0.3;

      if (platz.belegt) {
        const palette = this.createPalette(x, y, z, platz);
        this.paletteMeshes.push(palette);
      }
    }
  },

  createPalette(x, y, z, data) {
    const group = new THREE.Group();

    // EUR-Palette base (1.2 x 0.8m, 0.144m high)
    const woodColor = 0xB8860B + Math.floor(Math.random() * 0x202020);
    const paletteMat = new THREE.MeshLambertMaterial({ color: woodColor });

    // Top boards
    const topBoard = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.03, 0.9), paletteMat);
    topBoard.position.y = 0.12;
    group.add(topBoard);

    // Bottom boards
    const bottomBoard = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.03, 0.9), paletteMat);
    bottomBoard.position.y = 0;
    group.add(bottomBoard);

    // Blocks
    for (let bx of [-0.6, 0, 0.6]) {
      for (let bz of [-0.3, 0.3]) {
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.15), paletteMat);
        block.position.set(bx, 0.06, bz);
        group.add(block);
      }
    }

    // Goods on top
    const goodsTypes = [
      { color: 0xf5f0e8, h: 1.2 + Math.random() * 0.8, wrapped: true },
      { color: 0xe8dcc8, h: 0.8 + Math.random() * 0.6, wrapped: false },
      { color: 0xd4e8f4, h: 1.0 + Math.random() * 1.0, wrapped: true },
      { color: 0xfff5d4, h: 1.4 + Math.random() * 0.5, wrapped: true },
      { color: 0xe0e0e0, h: 0.6 + Math.random() * 0.8, wrapped: false },
      { color: 0xf0e8d4, h: 1.0 + Math.random() * 0.8, wrapped: true },
    ];
    const goods = goodsTypes[Math.floor(Math.random() * goodsTypes.length)];

    const goodsMat = new THREE.MeshLambertMaterial({ color: goods.color });
    const goodsMesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, goods.h, 0.8), goodsMat);
    goodsMesh.position.y = 0.12 + goods.h / 2;
    goodsMesh.castShadow = true;
    group.add(goodsMesh);

    // Stretch wrap
    if (goods.wrapped) {
      const wrapMat = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.2,
        shininess: 60
      });
      const wrap = new THREE.Mesh(new THREE.BoxGeometry(1.65, goods.h * 0.9, 0.85), wrapMat);
      wrap.position.y = 0.12 + goods.h / 2;
      group.add(wrap);
    }

    group.position.set(x, y, z);
    group.userData = {
      type: 'palette',
      bezeichnung: data.bezeichnung,
      eb_nummer: data.eb_nummer || null,
      kunde: data.kunde_name || null,
      belegt: true,
      regal: data.regal || data.bezeichnung?.charAt(0) || '?'
    };

    this.scene.add(group);
    return group;
  },

  buildBlocklagerArea() {
    const blockData = this.lagerData.BL || [];
    const startX = -8;
    const startZ = -55;

    // Floor marking for blocklager area
    const areaMat = new THREE.MeshBasicMaterial({ color: 0xF5C518, transparent: true, opacity: 0.15 });
    const area = new THREE.Mesh(new THREE.PlaneGeometry(20, 15), areaMat);
    area.rotation.x = -Math.PI / 2;
    area.position.set(startX + 8, 0.015, startZ - 5);
    this.scene.add(area);

    // "BLOCKLAGER" label on floor
    this.addFloorLabel('BLOCKLAGER', startX + 8, startZ + 3);

    // Grid floor lines
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xF5C518 });
    for (let i = 0; i <= 6; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 15), lineMat);
      line.position.set(startX + i * 3.2, 0.02, startZ - 5);
      this.scene.add(line);
    }

    // Place block storage palettes (ground level only)
    let idx = 0;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 6; col++) {
        if (idx >= blockData.length || idx >= 30) break;
        const platz = blockData[idx];
        if (platz.belegt) {
          const px = startX + col * 3.2 + 1.5;
          const pz = startZ - row * 3 - 1.5;
          const palette = this.createPalette(px, 0, pz, platz);
          this.paletteMeshes.push(palette);
        }
        idx++;
      }
    }
  },

  createForklift(x, y, z) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xF5C518 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const metalMat = new THREE.MeshLambertMaterial({ color: 0x555555 });

    // Main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 2.2), bodyMat);
    body.position.set(0, 1.2, 0);
    body.castShadow = true;
    group.add(body);

    // Counterweight (back)
    const cw = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 0.8), darkMat);
    cw.position.set(0, 1.0, 1.3);
    group.add(cw);

    // Mast (front)
    const mastMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    for (let mx of [-0.5, 0.5]) {
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.1, 6, 0.1), mastMat);
      mast.position.set(mx, 3.5, -1.2);
      group.add(mast);
    }
    // Mast cross bars
    for (let my = 1; my < 6; my += 1.5) {
      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.08), mastMat);
      crossbar.position.set(0, my, -1.2);
      group.add(crossbar);
    }

    // Forks
    for (let fx of [-0.3, 0.3]) {
      const fork = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 1.8), metalMat);
      fork.position.set(fx, 0.4, -2.0);
      group.add(fork);
      // Fork vertical part
      const forkV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.08), metalMat);
      forkV.position.set(fx, 1.0, -1.15);
      group.add(forkV);
    }

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
    for (let wz of [-0.5, 0.8]) {
      for (let wx of [-0.7, 0.7]) {
        const wheel = new THREE.Mesh(wheelGeo, darkMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.3, wz);
        group.add(wheel);
      }
    }

    // Overhead guard
    const guard = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 2.0), metalMat);
    guard.position.set(0, 2.5, 0);
    group.add(guard);
    // Guard posts
    for (let gx of [-0.7, 0.7]) {
      for (let gz of [-0.8, 0.8]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), metalMat);
        post.position.set(gx, 2.1, gz);
        group.add(post);
      }
    }

    // Seat
    const seatMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.5), seatMat);
    seat.position.set(0, 1.7, 0.3);
    group.add(seat);
    const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.1), seatMat);
    backrest.position.set(0, 2.0, 0.55);
    group.add(backrest);

    group.position.set(x, y, z);
    group.scale.set(1.3, 1.3, 1.3);
    this.scene.add(group);
  },

  addRegalLabel(text, x, y, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = 'rgba(26, 26, 46, 0.85)';
    ctx.roundRect(10, 10, 236, 108, 12);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#F5C518';
    ctx.lineWidth = 3;
    ctx.roundRect(10, 10, 236, 108, 12);
    ctx.stroke();

    // Text
    ctx.fillStyle = '#F5C518';
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 80);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(x, y, z);
    sprite.scale.set(4, 2, 1);
    this.scene.add(sprite);
  },

  addFloorLabel(text, x, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(245, 197, 24, 0.9)';
    ctx.font = 'bold 50px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, 256, 80);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), mat);
    label.rotation.x = -Math.PI / 2;
    label.position.set(x, 0.03, z);
    this.scene.add(label);
  },

  createInfoOverlay() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:absolute;top:12px;left:12px;background:rgba(20,20,35,0.88);color:#fff;
      padding:14px 18px;border-radius:10px;font-size:12px;line-height:1.8;z-index:50;
      border:1px solid rgba(245,197,24,0.2);backdrop-filter:blur(4px);
    `;
    overlay.innerHTML = `
      <div style="color:#F5C518;font-weight:700;font-size:14px;margin-bottom:6px;">🏭 Lager Navigation</div>
      <div>🖱️ Ziehen = Drehen</div>
      <div>🔍 Scroll = Zoom</div>
      <div>👆 Klick = Palette Details</div>
      <div style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;">
        <button id="btn3dWalk" style="background:#F5C518;color:#000;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;width:100%;">
          ▶ Durchs Lager gehen
        </button>
      </div>
      <div style="margin-top:6px;">
        <button id="btn3dReset" style="background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;width:100%;">
          ↺ Ansicht zurücksetzen
        </button>
      </div>
    `;
    this.container.appendChild(overlay);

    document.getElementById('btn3dWalk').addEventListener('click', () => this.startWalkthrough());
    document.getElementById('btn3dReset').addEventListener('click', () => this.resetCamera());
  },

  introCameraAnimation() {
    const startPos = { x: 0, y: 12, z: 55 };
    const endPos = { x: 5, y: 8, z: 35 };
    const startTarget = { x: 0, y: 5, z: 0 };
    const endTarget = { x: 0, y: 3, z: -15 };
    const duration = 2000;
    const startTime = Date.now();

    const animateIntro = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic

      this.camera.position.x = startPos.x + (endPos.x - startPos.x) * ease;
      this.camera.position.y = startPos.y + (endPos.y - startPos.y) * ease;
      this.camera.position.z = startPos.z + (endPos.z - startPos.z) * ease;

      this.controls.target.x = startTarget.x + (endTarget.x - startTarget.x) * ease;
      this.controls.target.y = startTarget.y + (endTarget.y - startTarget.y) * ease;
      this.controls.target.z = startTarget.z + (endTarget.z - startTarget.z) * ease;

      if (t < 1) requestAnimationFrame(animateIntro);
    };
    animateIntro();
  },

  startWalkthrough() {
    // Walk path through the warehouse
    this.walkPath = [
      // Start at entrance
      { pos: { x: 2.5, y: 2.5, z: 10 }, target: { x: 2.5, y: 2, z: -10 } },
      // Move down main aisle
      { pos: { x: 2.5, y: 2.5, z: 0 }, target: { x: -20, y: 3, z: -5 } },
      // Look left at racks
      { pos: { x: -5, y: 2.5, z: -5 }, target: { x: -20, y: 4, z: -10 } },
      // Enter Gang 1
      { pos: { x: -23.5, y: 2.5, z: 0 }, target: { x: -23.5, y: 3, z: -20 } },
      // Deep in Gang 1
      { pos: { x: -23.5, y: 2.5, z: -20 }, target: { x: -23.5, y: 5, z: -35 } },
      // Look up at high racks
      { pos: { x: -23.5, y: 2.5, z: -25 }, target: { x: -25, y: 10, z: -25 } },
      // Back to main aisle
      { pos: { x: -5, y: 2.5, z: -20 }, target: { x: 10, y: 3, z: -20 } },
      // Look at right wall rack
      { pos: { x: 10, y: 2.5, z: -15 }, target: { x: 22, y: 4, z: -15 } },
      // Move towards blocklager
      { pos: { x: 2.5, y: 2.5, z: -40 }, target: { x: 0, y: 1, z: -55 } },
      // Overview from above
      { pos: { x: 5, y: 15, z: 25 }, target: { x: 0, y: 0, z: -20 } },
    ];

    this.walkIndex = 0;
    this.isWalking = true;
    this.controls.enabled = false;
    this.walkToNext();
  },

  walkToNext() {
    if (this.walkIndex >= this.walkPath.length) {
      this.isWalking = false;
      this.controls.enabled = true;
      return;
    }

    const step = this.walkPath[this.walkIndex];
    const duration = 2500;
    const startPos = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
    const startTarget = { x: this.controls.target.x, y: this.controls.target.y, z: this.controls.target.z };
    const startTime = Date.now();

    const animateStep = () => {
      if (!this.isWalking) { this.controls.enabled = true; return; }
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic

      this.camera.position.x = startPos.x + (step.pos.x - startPos.x) * ease;
      this.camera.position.y = startPos.y + (step.pos.y - startPos.y) * ease;
      this.camera.position.z = startPos.z + (step.pos.z - startPos.z) * ease;

      this.controls.target.x = startTarget.x + (step.target.x - startTarget.x) * ease;
      this.controls.target.y = startTarget.y + (step.target.y - startTarget.y) * ease;
      this.controls.target.z = startTarget.z + (step.target.z - startTarget.z) * ease;

      if (t < 1) {
        requestAnimationFrame(animateStep);
      } else {
        this.walkIndex++;
        setTimeout(() => this.walkToNext(), 800);
      }
    };
    animateStep();
  },

  resetCamera() {
    this.isWalking = false;
    this.controls.enabled = true;

    const duration = 1000;
    const startPos = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
    const endPos = { x: 5, y: 8, z: 35 };
    const startTarget = { x: this.controls.target.x, y: this.controls.target.y, z: this.controls.target.z };
    const endTarget = { x: 0, y: 3, z: -15 };
    const startTime = Date.now();

    const animateReset = () => {
      const t = Math.min((Date.now() - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      this.camera.position.set(
        startPos.x + (endPos.x - startPos.x) * ease,
        startPos.y + (endPos.y - startPos.y) * ease,
        startPos.z + (endPos.z - startPos.z) * ease
      );
      this.controls.target.set(
        startTarget.x + (endTarget.x - startTarget.x) * ease,
        startTarget.y + (endTarget.y - startTarget.y) * ease,
        startTarget.z + (endTarget.z - startTarget.z) * ease
      );
      if (t < 1) requestAnimationFrame(animateReset);
    };
    animateReset();
  },

  onMouseMove(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.paletteMeshes, true);

    // Reset previous highlight
    if (this.highlightedMesh && this.originalMaterial) {
      this.highlightedMesh.material = this.originalMaterial;
      this.highlightedMesh = null;
      this.originalMaterial = null;
    }

    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && !obj.userData?.type) obj = obj.parent;

      if (obj.userData?.type === 'palette') {
        this.renderer.domElement.style.cursor = 'pointer';

        // Highlight
        const children = obj.children;
        if (children.length > 3) {
          const goodsMesh = children[3] || children[2];
          if (goodsMesh && goodsMesh.material) {
            this.highlightedMesh = goodsMesh;
            this.originalMaterial = goodsMesh.material;
            goodsMesh.material = new THREE.MeshLambertMaterial({
              color: 0xF5C518,
              emissive: 0x554400
            });
          }
        }

        const data = obj.userData;
        this.tooltip.innerHTML = `
          <div style="color:#F5C518;font-weight:700;margin-bottom:4px;">📦 Platz ${data.bezeichnung}</div>
          ${data.eb_nummer ? `<div>📋 EB-Nr: <strong>${data.eb_nummer}</strong></div>` : '<div style="color:#888;">Keine EB-Nr. hinterlegt</div>'}
          ${data.kunde ? `<div>👤 Kunde: ${data.kunde}</div>` : ''}
          <div style="margin-top:4px;color:#4CAF50;font-size:11px;">Klicken für Details</div>
        `;
        this.tooltip.style.display = 'block';
        this.tooltip.style.left = (event.clientX - this.container.getBoundingClientRect().left + 15) + 'px';
        this.tooltip.style.top = (event.clientY - this.container.getBoundingClientRect().top - 10) + 'px';
        return;
      }
    }

    this.renderer.domElement.style.cursor = 'grab';
    this.tooltip.style.display = 'none';
  },

  onClick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.paletteMeshes, true);

    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && !obj.userData?.type) obj = obj.parent;

      if (obj.userData?.type === 'palette') {
        const data = obj.userData;
        if (data.eb_nummer) {
          // Navigate to search with EB number
          App.navigate('suche');
          setTimeout(() => {
            const si = document.getElementById('searchInput');
            if (si) {
              si.value = data.eb_nummer;
              document.getElementById('searchBtn')?.click();
            }
          }, 200);
        } else {
          App.toast(`Platz ${data.bezeichnung} - Keine EB-Nummer hinterlegt`, 'info');
        }
      }
    }
  },

  onResize() {
    if (!this.container || !this.camera || !this.renderer) return;
    const width = this.container.clientWidth;
    const height = 650;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  },

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    if (this.controls.enabled) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  },

  destroy() {
    this.isWalking = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement) this.renderer.domElement.remove();
    }
    if (this.tooltip) this.tooltip.remove();
    this.paletteMeshes = [];
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
  }
};
