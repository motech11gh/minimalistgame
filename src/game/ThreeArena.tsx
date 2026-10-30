import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BIOMES,
  WEAPONS,
  WALL_BLUEPRINTS,
  OPERATOR_SKINS,
  GameState,
  MapId,
  BattleModeId,
  BotHardnessId,
  FriendProfile,
  SplitScreenP2Telemetry,
  WeaponId,
  OpticId,
  BarrelId,
  UnderbarrelId,
  MagId,
  SkinId,
  EmoteId,
  WallType,
  PlayerPhysicsState,
  ObstacleBox,
  NpcEntity,
  NpcArchetype,
  ProjectedOpponentOverlay,
  SalvageNode,
  BuiltWallEntity,
  ActiveInputDevice,
  VirtualTouchInputState,
  SmartControlConfig,
  WeatherAtmosphereMode,
  ProceduralChunkBlueprint,
  DYNAMIC_ENVIRONMENT_EVENTS,
  DynamicEnvironmentEventDef,
  ReplayCameraMode,
  ReplayFrameSnapshot,
  ReplayHighlightMarker,
  MatchReplayRecording,
} from './types';
import {
  computeWeaponStats,
  getTerrainHeight,
  evaluateMovementPhysics,
  canBuildWall,
  computeTrainingWaveConfig,
  computeTeamMatchRoster,
  stepAiDecisionPolicy,
  parseStandardGamepadState,
  ParsedGamepadFrame,
  evaluateSmartAimAssist,
  stepDynamicEnvironmentEventState,
  interpolateReplayFrames,
  WORLD_CHUNK_SIZE,
  BOT_DISCOVERY_RADIUS,
  getChunkCoordFromWorld,
  getStreamingChunkCoords,
  generateProceduralChunkBlueprint,
} from './rules';
import { soundEngine } from './sound';

export interface HudTelemetrySnapshot {
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  stamina: number;
  ammo: number;
  magSize: number;
  isReloading: boolean;
  salvage: number;
  selectedWallType: WallType;
  buildModeActive: boolean;
  movementMode: PlayerPhysicsState['movementMode'];
  abilityCooldown: number;
  abilityActiveTimer: number;
  stimCooldown: number;
  stimActiveTimer: number;
  wave: number;
  totalWaves: number;
  matchElapsedSec: number;
  enemiesRemaining: number;
  totalEnemiesInWave: number;
  score: number;
  eliminations: number;
  wallsConstructed: number;
  activeEmoteBanner: string | null;
  interactionPrompt: string | null;
  hitMarkerActive: boolean;
  killMarkerActive: boolean;
  damageVignetteIntensity: number;
  smartTargetLocked: boolean;
  activeChunkKey: string;
  loadedChunkCount: number;
  chunksDiscovered: number;
  discoveredByCount: number;
  arenaSizeLabel: string;
  useChunkStreaming: boolean;
  brPlayersAlive: number | null;
  weatherMode: WeatherAtmosphereMode;
  activeEnvironmentEvent: {
    id: string;
    name: string;
    subtitle: string;
    accentColor: string;
    remainingSec: number;
  } | null;
  nextEventCooldownSec: number;
  splitScreenP2: SplitScreenP2Telemetry | null;
  opponentsOverlay: ProjectedOpponentOverlay[];
  minimapEntities: {
    playerX: number;
    playerZ: number;
    playerYaw: number;
    enemies: Array<{ x: number; z: number; archetype: NpcArchetype; isWindup: boolean }>;
    walls: Array<{ x: number; z: number; type: WallType }>;
    crates: Array<{ x: number; z: number; ready: boolean }>;
    squadmates: Array<{ x: number; z: number; callsign: string }>;
  };
}

export interface RemoteSquadOperator {
  id: string;
  callsign: string;
  skinId: string;
  emoteId: string;
  activeEmote: string | null;
  emoteExpiresAt: number;
  weaponId: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  hp: number;
  maxHp: number;
  score: number;
  eliminations: number;
  mapId: string;
}

interface ThreeArenaProps {
  gameState: GameState;
  mapId: MapId;
  battleMode: BattleModeId;
  botHardness: BotHardnessId;
  weatherMode: WeatherAtmosphereMode;
  partyMembers: FriendProfile[];
  trainingLevel: number;
  callsign: string;
  skinId: SkinId;
  emoteId: EmoteId;
  weaponId: WeaponId;
  opticId: OpticId;
  barrelId: BarrelId;
  underbarrelId: UnderbarrelId;
  magId: MagId;
  selectedWallType: WallType;
  stimBuff: {
    label: string;
    speedMultiplier: number;
    recoilReduction: number;
    regenPerSec: number;
    damageBonus: number;
  };
  remoteOperators: RemoteSquadOperator[];
  sharedWalls: BuiltWallEntity[];
  restartNonce: number;
  smartControl: SmartControlConfig;
  triggerEventNonce: number;
  replayRecording: MatchReplayRecording | null;
  replayTimeSec: number;
  replayCameraMode: ReplayCameraMode;
  touchInputRef: React.MutableRefObject<VirtualTouchInputState>;
  onDetectedInputDevice?: (device: ActiveInputDevice, gamepadLabel?: string | null) => void;
  onSelectWallType: (type: WallType) => void;
  onHudUpdate: (snapshot: HudTelemetrySnapshot) => void;
  onReplayUpdated: (recording: MatchReplayRecording) => void;
  onStateChange: (
    nextState: GameState,
    outcome?: {
      victory: boolean;
      score: number;
      eliminations: number;
      wallsConstructed: number;
      waveReached: number;
      durationSec: number;
    }
  ) => void;
  onSendMultiplayerUpdate: (payload: Record<string, unknown>) => void;
}

// Reusable module-scope math objects (Zero GC in rAF loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _projVec = new THREE.Vector3();
const _dummyObj = new THREE.Object3D();
const _color = new THREE.Color();

// Procedural CanvasTexture generator for crisp PBR ground/stone/metal micro-relief
function createProceduralSurfaceTextures(
  renderer: THREE.WebGLRenderer,
  primaryHex: string,
  secondaryHex: string
) {
  const size = 256;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const ctx = albedoCanvas.getContext('2d')!;

  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, size, size);

  // Deterministic tactical grid + natural mineral speckle
  ctx.strokeStyle = secondaryHex;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 2;
  for (let i = 0; i <= size; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  for (let i = 0; i < 900; i++) {
    const x = (i * 73) % size;
    const y = (i * 137) % size;
    const w = 2 + (i % 5);
    ctx.fillStyle = i % 2 === 0 ? secondaryHex : '#0f172a';
    ctx.globalAlpha = 0.08 + (i % 4) * 0.03;
    ctx.fillRect(x, y, w, w);
  }

  const albedoTex = new THREE.CanvasTexture(albedoCanvas);
  albedoTex.colorSpace = THREE.SRGBColorSpace;
  albedoTex.wrapS = THREE.RepeatWrapping;
  albedoTex.wrapT = THREE.RepeatWrapping;
  albedoTex.repeat.set(28, 28);
  albedoTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  // Grayscale bump map
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 128;
  bumpCanvas.height = 128;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 600; i++) {
    const x = (i * 41) % 128;
    const y = (i * 89) % 128;
    bCtx.fillStyle = i % 2 === 0 ? '#a8a8a8' : '#555555';
    bCtx.fillRect(x, y, 3, 3);
  }
  const bumpTex = new THREE.CanvasTexture(bumpCanvas);
  bumpTex.wrapS = THREE.RepeatWrapping;
  bumpTex.wrapT = THREE.RepeatWrapping;
  bumpTex.repeat.set(28, 28);

  return { albedoTex, bumpTex };
}

// Radial contact shadow texture
function createContactShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.65)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Composite 3-12 part First-Person Weapon + Dynamic Attachments Viewmodel
function buildWeaponViewModel(
  weaponId: WeaponId,
  opticId: OpticId,
  barrelId: BarrelId,
  underbarrelId: UnderbarrelId,
  magId: MagId,
  skinId: SkinId
): THREE.Group {
  const group = new THREE.Group();
  const wep = WEAPONS[weaponId] || WEAPONS['vx-carbine'];
  const skin = OPERATOR_SKINS[skinId] || OPERATOR_SKINS['vanguard-obsidian'];

  const receiverMat = new THREE.MeshStandardMaterial({
    color: wep.primaryColorHex,
    roughness: 0.35,
    metalness: 0.78,
  });
  const skinAccentMat = new THREE.MeshStandardMaterial({
    color: skin.primaryHex,
    roughness: 0.55,
    metalness: 0.4,
  });
  const metalTrimMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.22,
    metalness: 0.92,
  });
  const emissiveAccentMat = new THREE.MeshStandardMaterial({
    color: wep.accentColorHex,
    emissive: wep.accentColorHex,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });

  // 1. Primary Receiver Body
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.11, 0.46), receiverMat);
  receiver.position.set(0, 0, 0);
  group.add(receiver);

  // 2. Upper Picatinny Rail & Shroud
  const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.045, 0.38), skinAccentMat);
  shroud.position.set(0, 0.065, -0.06);
  group.add(shroud);

  // 3. Ergonomic Pistol Grip & Stock
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.13, 0.07), skinAccentMat);
  grip.position.set(0, -0.09, 0.12);
  grip.rotation.x = 0.28;
  group.add(grip);

  // 4. Barrel + Barrel Attachment
  const baseBarrelLen = weaponId === 'solaris-dmr' ? 0.52 : weaponId === 'aegis-smg' ? 0.28 : 0.4;
  const barrelMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.022, baseBarrelLen, 12),
    metalTrimMat
  );
  barrelMesh.rotation.x = Math.PI / 2;
  barrelMesh.position.set(0, 0.02, -0.23 - baseBarrelLen * 0.5);
  group.add(barrelMesh);

  if (barrelId === 'tactical-suppressor') {
    const suppressor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.22, 16),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.65, metalness: 0.5 })
    );
    suppressor.rotation.x = Math.PI / 2;
    suppressor.position.set(0, 0.02, -0.23 - baseBarrelLen - 0.08);
    group.add(suppressor);
  } else if (barrelId === 'muzzle-compensator') {
    const brake = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.048, 0.09), metalTrimMat);
    brake.position.set(0, 0.02, -0.23 - baseBarrelLen - 0.03);
    group.add(brake);
  } else if (barrelId === 'heavy-fluted') {
    const shroudRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.18, 12),
      emissiveAccentMat
    );
    shroudRing.rotation.x = Math.PI / 2;
    shroudRing.position.set(0, 0.02, -0.23 - baseBarrelLen * 0.7);
    group.add(shroudRing);
  }

  // 5. Optic Attachment
  if (opticId === 'iron-sight') {
    const frontPost = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.035, 0.016), metalTrimMat);
    frontPost.position.set(0, 0.098, -0.22);
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.02), metalTrimMat);
    rearSight.position.set(0, 0.095, 0.1);
    group.add(frontPost, rearSight);
  } else if (opticId === 'holo-reflex') {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.062, 0.09), receiverMat);
    housing.position.set(0, 0.11, -0.02);
    const lens = new THREE.Mesh(
      new THREE.PlaneGeometry(0.048, 0.042),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      })
    );
    lens.position.set(0, 0.115, -0.02);
    group.add(housing, lens);
  } else if (opticId === 'acog-4x' || opticId === 'thermal-bio-scope') {
    const scopeTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.024, 0.19, 16),
      receiverMat
    );
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.118, -0.02);
    const objectiveLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.01, 16),
      new THREE.MeshBasicMaterial({
        color: opticId === 'thermal-bio-scope' ? 0x10b981 : 0xf59e0b,
      })
    );
    objectiveLens.rotation.x = Math.PI / 2;
    objectiveLens.position.set(0, 0.118, 0.076);
    group.add(scopeTube, objectiveLens);
  }

  // 6. Underbarrel Attachment
  if (underbarrelId === 'angled-foregrip') {
    const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.085, 0.09), skinAccentMat);
    gripMesh.position.set(0, -0.065, -0.18);
    gripMesh.rotation.x = -0.55;
    group.add(gripMesh);
  } else if (underbarrelId === 'vertical-stabilizer') {
    const vGrip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.022, 0.11, 12),
      skinAccentMat
    );
    vGrip.position.set(0, -0.08, -0.18);
    group.add(vGrip);
  } else if (underbarrelId === 'laser-targeter') {
    const peqBox = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.032, 0.08), metalTrimMat);
    peqBox.position.set(0.045, 0.02, -0.2);
    const laserBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0025, 0.0025, 4.5, 6),
      new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.65 })
    );
    laserBeam.rotation.x = Math.PI / 2;
    laserBeam.position.set(0.045, 0.02, -2.45);
    group.add(peqBox, laserBeam);
  }

  // 7. Magazine Attachment
  if (magId === 'extended-drum') {
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.08, 18),
      receiverMat
    );
    drum.rotation.x = Math.PI / 2;
    drum.position.set(0, -0.11, -0.05);
    group.add(drum);
  } else if (magId === 'bio-catalyst-cell') {
    const bioCell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.16, 14),
      emissiveAccentMat
    );
    bioCell.position.set(0, -0.11, -0.05);
    group.add(bioCell);
  } else {
    const stdMag = new THREE.Mesh(
      new THREE.BoxGeometry(0.046, magId === 'fast-mag' ? 0.17 : 0.15, 0.075),
      metalTrimMat
    );
    stdMag.position.set(0, -0.11, -0.05);
    stdMag.rotation.x = 0.16;
    group.add(stdMag);
  }

  // 8. Accent LED Telemetry Strip
  const accentStrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.012, 0.22),
    emissiveAccentMat
  );
  accentStrip.position.set(0, 0.035, -0.04);
  group.add(accentStrip);

  return group;
}

// Composite 8-part Operator / AI NPC 3D Character Group (pivoted at bottom-center y=0)
function buildOperatorCharacterGroup(
  archetype: NpcArchetype | 'SQUAD',
  contactShadowTex: THREE.Texture,
  skinHex?: { primary: string; secondary: string; visor: string }
): {
  root: THREE.Group;
  bodyMesh: THREE.Mesh;
  visorMesh: THREE.Mesh;
  telegraphRing: THREE.Mesh;
  shieldMesh: THREE.Mesh | null;
} {
  const root = new THREE.Group();

  let primaryColor = 0x334155;
  let secondaryColor = 0x1e293b;
  let visorColor = 0xef4444;

  if (skinHex) {
    primaryColor = new THREE.Color(skinHex.primary).getHex();
    secondaryColor = new THREE.Color(skinHex.secondary).getHex();
    visorColor = new THREE.Color(skinHex.visor).getHex();
  } else if (archetype === 'rusher') {
    primaryColor = 0x7f1d1d;
    secondaryColor = 0x18181b;
    visorColor = 0xf97316;
  } else if (archetype === 'marksman') {
    primaryColor = 0x1e3a8a;
    secondaryColor = 0x0f172a;
    visorColor = 0x38bdf8;
  } else if (archetype === 'flanker') {
    primaryColor = 0x065f46;
    secondaryColor = 0x0f172a;
    visorColor = 0x10b981;
  } else if (archetype === 'juggernaut') {
    primaryColor = 0x3f3f46;
    secondaryColor = 0x18181b;
    visorColor = 0xfacc15;
  }

  const armorMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    roughness: 0.42,
    metalness: 0.62,
  });
  const undersuitMat = new THREE.MeshStandardMaterial({
    color: secondaryColor,
    roughness: 0.78,
    metalness: 0.2,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: visorColor,
    emissive: visorColor,
    emissiveIntensity: 1.8,
    roughness: 0.15,
  });

  // 1. Soft radial contact shadow on ground (y = 0.015)
  const shadowDisc = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.015;
  root.add(shadowDisc);

  // 2. Left & Right Armored Boots/Legs
  const legGeo = new THREE.BoxGeometry(0.24, 0.82, 0.26);
  const leftLeg = new THREE.Mesh(legGeo, undersuitMat);
  leftLeg.position.set(-0.18, 0.41, 0);
  const rightLeg = new THREE.Mesh(legGeo, undersuitMat);
  rightLeg.position.set(0.18, 0.41, 0);
  root.add(leftLeg, rightLeg);

  // 3. Primary Armored Torso Hull
  const isJug = archetype === 'juggernaut';
  const bodyMesh = new THREE.Mesh(
    new THREE.BoxGeometry(isJug ? 0.86 : 0.64, 0.82, isJug ? 0.52 : 0.38),
    armorMat
  );
  bodyMesh.position.set(0, 1.22, 0);
  bodyMesh.castShadow = true;
  root.add(bodyMesh);

  // 4. Tactical Backpack / Power Cell
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.22), undersuitMat);
  pack.position.set(0, 1.24, -0.26);
  root.add(pack);

  // 5. Shoulder Pauldrons & Arms
  const armGeo = new THREE.BoxGeometry(0.2, 0.66, 0.22);
  const leftArm = new THREE.Mesh(armGeo, armorMat);
  leftArm.position.set(isJug ? -0.54 : -0.42, 1.2, 0.08);
  const rightArm = new THREE.Mesh(armGeo, armorMat);
  rightArm.position.set(isJug ? 0.54 : 0.42, 1.2, 0.16);
  rightArm.rotation.x = -0.5;
  root.add(leftArm, rightArm);

  // 6. Equipped Rifle Barrel in Right Hand
  const gunMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.14, 0.68),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.85 })
  );
  gunMesh.position.set(isJug ? 0.54 : 0.42, 1.15, 0.44);
  root.add(gunMesh);

  // 7. Helmet + Glowing Tactical Visor
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.44), armorMat);
  helmet.position.set(0, 1.85, 0);
  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.06), visorMat);
  visorMesh.position.set(0, 1.86, 0.21);
  root.add(helmet, visorMesh);

  // 8. Optional Ballistic Shield for Juggernauts
  let shieldMesh: THREE.Mesh | null = null;
  if (isJug) {
    shieldMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.88, 1.38, 0.08),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.2,
        metalness: 0.5,
        transparent: true,
        opacity: 0.55,
      })
    );
    shieldMesh.position.set(-0.35, 1.15, 0.42);
    root.add(shieldMesh);
  }

  // 9. Telegraph Windup Ring around head/torso
  const telegraphRing = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.72, 24),
    new THREE.MeshBasicMaterial({
      color: 0xf97316,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    })
  );
  telegraphRing.position.set(0, 2.25, 0);
  telegraphRing.visible = false;
  root.add(telegraphRing);

  return { root, bodyMesh, visorMesh, telegraphRing, shieldMesh };
}

// Composite 6-part Buildable Defensive Wall Group (pivoted at bottom-center y=0)
function buildDefensiveWallGroup(wallType: WallType): THREE.Group {
  const blueprint = WALL_BLUEPRINTS[wallType];
  const group = new THREE.Group();

  const plateMat = new THREE.MeshStandardMaterial({
    color: wallType === 'bastion' ? 0x064e3b : wallType === 'rampart' ? 0x334155 : 0x475569,
    roughness: 0.45,
    metalness: 0.72,
  });
  const strutMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.75,
    metalness: 0.35,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: blueprint.accentColor,
    emissive: blueprint.accentColor,
    emissiveIntensity: 1.2,
    roughness: 0.25,
  });

  // 1. Ground Plinth Base
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(blueprint.width, 0.26, blueprint.depth + 0.16),
    strutMat
  );
  plinth.position.y = 0.13;
  group.add(plinth);

  // 2. Main Armored Bulkhead
  const mainBody = new THREE.Mesh(
    new THREE.BoxGeometry(blueprint.width - 0.16, blueprint.height - 0.26, blueprint.depth),
    plateMat
  );
  mainBody.position.y = 0.26 + (blueprint.height - 0.26) * 0.5;
  mainBody.castShadow = true;
  mainBody.receiveShadow = true;
  group.add(mainBody);

  // 3. Left & Right Vertical Steel Buttress Pillars
  const pillarGeo = new THREE.BoxGeometry(0.28, blueprint.height + 0.08, blueprint.depth + 0.12);
  const leftPillar = new THREE.Mesh(pillarGeo, strutMat);
  leftPillar.position.set(-blueprint.width * 0.5 + 0.14, blueprint.height * 0.5, 0);
  const rightPillar = new THREE.Mesh(pillarGeo, strutMat);
  rightPillar.position.set(blueprint.width * 0.5 - 0.14, blueprint.height * 0.5, 0);
  group.add(leftPillar, rightPillar);

  // 4. Accent Beacon Strip & Climbing Rungs
  const topTrim = new THREE.Mesh(
    new THREE.BoxGeometry(blueprint.width - 0.4, 0.09, blueprint.depth + 0.04),
    accentMat
  );
  topTrim.position.y = blueprint.height - 0.1;
  group.add(topTrim);

  if (wallType === 'rampart' || wallType === 'bastion') {
    for (let r = 0; r < 4; r++) {
      const rung = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.06, blueprint.depth + 0.16),
        accentMat
      );
      rung.position.set(0, 0.55 + r * 0.55, 0);
      group.add(rung);
    }
  }

  return group;
}

export const ThreeArena: React.FC<ThreeArenaProps> = (props) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // Store mutable callbacks and state in refs so React HUD updates never tear down the WebGL canvas
  const internalRef = useRef<{
    rebuildBiome?: (mapId: MapId) => void;
    rebuildWeaponMesh?: () => void;
    resetSession?: () => void;
    forceTriggerEnvironmentEvent?: () => void;
    syncLobbyAvatars?: () => void;
    onGameStateTransition?: (nextState: GameState) => void;
  }>({});

  // Trigger biome rebuild when mapId changes
  useEffect(() => {
    internalRef.current.rebuildBiome?.(props.mapId);
  }, [props.mapId]);

  // Immediately sync scene visibility & camera when gameState transitions
  useEffect(() => {
    internalRef.current.onGameStateTransition?.(props.gameState);
  }, [props.gameState]);

  // Trigger weapon viewmodel & lobby avatar rebuild when weapon, attachments, skin, or party changes
  useEffect(() => {
    internalRef.current.rebuildWeaponMesh?.();
    internalRef.current.syncLobbyAvatars?.();
  }, [
    props.weaponId,
    props.opticId,
    props.barrelId,
    props.underbarrelId,
    props.magId,
    props.skinId,
    props.partyMembers,
  ]);

  // Reset session when restartNonce, trainingLevel, battleMode, or botHardness changes
  useEffect(() => {
    internalRef.current.resetSession?.();
  }, [props.restartNonce, props.trainingLevel, props.battleMode, props.botHardness]);

  // Trigger dynamic environment event when requested from UI
  useEffect(() => {
    if (props.triggerEventNonce > 0) {
      internalRef.current.forceTriggerEnvironmentEvent?.();
    }
  }, [props.triggerEventNonce]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software-WebGL detection per Three.js skill
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

    container.innerHTML = '';
    renderer.domElement.setAttribute('data-testid', 'tactical-webgl-canvas');
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      70,
      (container.clientWidth || window.innerWidth) /
        Math.max(1, container.clientHeight || window.innerHeight),
      0.1,
      360
    );
    camera.position.set(0, 2.2, 20.65);
    scene.add(camera);

    // Second PerspectiveCamera for Offline Co-Op Split-Screen (Player 2)
    const p2Camera = new THREE.PerspectiveCamera(
      70,
      ((container.clientWidth || window.innerWidth) * 0.5) /
        Math.max(1, container.clientHeight || window.innerHeight),
      0.1,
      360
    );
    scene.add(p2Camera);

    // Mandatory Studio Environment Reflection (RoomEnvironment + PMREMGenerator)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const contactShadowTex = createContactShadowTexture();

    // Warm/Cool Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x90cdf4, 0x334155, 0.85);
    hemiLight.position.set(0, 60, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff3d1, 2.3);
    sunLight.position.set(42, 68, 36);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    const d = 80;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 5;
    sunLight.shadow.camera.far = 220;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);

    // Scene Subgroup Containers
    const environmentGroup = new THREE.Group();
    const wallsGroup = new THREE.Group();
    const npcsGroup = new THREE.Group();
    const alliesGroup = new THREE.Group();
    const cratesGroup = new THREE.Group();
    const remotePlayersGroup = new THREE.Group();
    const lobbyPartyGroup = new THREE.Group();
    const arenaBoundaryGroup = new THREE.Group();
    const weaponRigGroup = new THREE.Group();
    const p2WeaponRigGroup = new THREE.Group();
    camera.add(weaponRigGroup);
    p2Camera.add(p2WeaponRigGroup);

    scene.add(
      environmentGroup,
      wallsGroup,
      npcsGroup,
      alliesGroup,
      cratesGroup,
      remotePlayersGroup,
      lobbyPartyGroup,
      arenaBoundaryGroup
    );

    // Pooled InstancedMesh Particle Ring Buffer (36 particles)
    const PARTICLE_CAP = 36;
    const particleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const particleInstanced = new THREE.InstancedMesh(particleGeo, particleMat, PARTICLE_CAP);
    particleInstanced.frustumCulled = false;
    scene.add(particleInstanced);

    const particlePool = Array.from({ length: PARTICLE_CAP }, () => ({
      active: false,
      x: 0,
      y: -100,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 0.4,
      colorHex: 0xf59e0b,
    }));
    let particleCursor = 0;

    function spawnParticles(
      x: number,
      y: number,
      z: number,
      count: number,
      colorHex: number,
      speed = 6
    ) {
      for (let i = 0; i < count; i++) {
        const p = particlePool[particleCursor];
        particleCursor = (particleCursor + 1) % PARTICLE_CAP;
        p.active = true;
        p.x = x;
        p.y = y;
        p.z = z;
        p.vx = (Math.random() - 0.5) * speed;
        p.vy = Math.random() * speed * 0.8 + 1.2;
        p.vz = (Math.random() - 0.5) * speed;
        p.maxLife = 0.25 + Math.random() * 0.25;
        p.life = p.maxLife;
        p.colorHex = colorHex;
      }
    }

    // Build Ghost Preview Mesh for Wall Placement
    const wallPreviewMesh = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.45, 0.55),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.65,
      })
    );
    wallPreviewMesh.visible = false;
    scene.add(wallPreviewMesh);

    // 3D Dynamic Weather Particle InstancedMesh (42 atmospheric event particles)
    const WEATHER_CAP = 42;
    const weatherGeo = new THREE.OctahedronGeometry(0.14, 0);
    const weatherMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.78,
    });
    const weatherInstanced = new THREE.InstancedMesh(weatherGeo, weatherMat, WEATHER_CAP);
    weatherInstanced.frustumCulled = false;
    weatherInstanced.visible = false;
    scene.add(weatherInstanced);

    const weatherPool = Array.from({ length: WEATHER_CAP }, (_, i) => ({
      offsetX: ((i * 19) % 36) - 18,
      offsetY: (i * 7) % 14,
      offsetZ: ((i * 23) % 36) - 18,
      fallSpeed: 3.2 + (i % 4) * 1.1,
    }));

    // Continuous 3D Light Rain Streaks & Ground Splash Rings (masks infinite chunk horizon)
    const RAIN_STREAK_CAP = 140;
    const rainStreakGeo = new THREE.BoxGeometry(0.022, 1.45, 0.022);
    const rainStreakMat = new THREE.MeshBasicMaterial({
      color: 0xcbd5e1,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
    });
    const rainStreakInstanced = new THREE.InstancedMesh(
      rainStreakGeo,
      rainStreakMat,
      RAIN_STREAK_CAP
    );
    rainStreakInstanced.frustumCulled = false;
    scene.add(rainStreakInstanced);

    const rainStreakPool = Array.from({ length: RAIN_STREAK_CAP }, (_, i) => ({
      offsetX: ((i * 31) % 68) - 34,
      offsetY: (i * 5.3) % 20,
      offsetZ: ((i * 43) % 68) - 34,
      fallSpeed: 13.5 + (i % 5) * 2.4,
      slantX: 0.08 + (i % 3) * 0.02,
    }));

    const RAIN_SPLASH_CAP = 32;
    const rainSplashGeo = new THREE.RingGeometry(0.06, 0.24, 12);
    rainSplashGeo.rotateX(-Math.PI / 2);
    const rainSplashMat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const rainSplashInstanced = new THREE.InstancedMesh(
      rainSplashGeo,
      rainSplashMat,
      RAIN_SPLASH_CAP
    );
    rainSplashInstanced.frustumCulled = false;
    scene.add(rainSplashInstanced);

    const rainSplashPool = Array.from({ length: RAIN_SPLASH_CAP }, (_, i) => ({
      offsetX: ((i * 17) % 36) - 18,
      offsetZ: ((i * 29) % 36) - 18,
      phase: (i * 0.37) % 1.0,
    }));

    // 3D Local Player Avatar for Lobby Centerpiece Showcase & 3rd-Person Match Replay
    let replayOperatorAvatar = buildOperatorCharacterGroup(
      'SQUAD',
      contactShadowTex,
      {
        primary: OPERATOR_SKINS[propsRef.current.skinId]?.primaryHex || '#1e293b',
        secondary: OPERATOR_SKINS[propsRef.current.skinId]?.secondaryHex || '#334155',
        visor: OPERATOR_SKINS[propsRef.current.skinId]?.visorHex || '#f59e0b',
      }
    );
    replayOperatorAvatar.root.visible = false;
    scene.add(replayOperatorAvatar.root);

    // 3D Split-Screen Player 2 Avatar
    const p2OperatorAvatar = buildOperatorCharacterGroup('SQUAD', contactShadowTex, {
      primary: '#0f766e',
      secondary: '#115e59',
      visor: '#38bdf8',
    });
    p2OperatorAvatar.root.visible = false;
    scene.add(p2OperatorAvatar.root);

    function syncLobbyAvatars() {
      const p = propsRef.current;
      const skinDef = OPERATOR_SKINS[p.skinId] || OPERATOR_SKINS['vanguard-obsidian'];
      const wasVisible = replayOperatorAvatar.root.visible;
      const prevPos = replayOperatorAvatar.root.position.clone();
      const prevRotY = replayOperatorAvatar.root.rotation.y;
      scene.remove(replayOperatorAvatar.root);

      replayOperatorAvatar = buildOperatorCharacterGroup('SQUAD', contactShadowTex, {
        primary: skinDef.primaryHex,
        secondary: skinDef.secondaryHex,
        visor: skinDef.visorHex,
      });
      replayOperatorAvatar.root.visible = wasVisible;
      replayOperatorAvatar.root.position.copy(prevPos);
      replayOperatorAvatar.root.rotation.y = prevRotY;
      scene.add(replayOperatorAvatar.root);

      while (lobbyPartyGroup.children.length > 0) {
        lobbyPartyGroup.remove(lobbyPartyGroup.children[0]);
      }
      const offsets = [
        { x: -1.85, z: 15.1, rotY: 0.25 },
        { x: 1.85, z: 15.1, rotY: -0.25 },
        { x: -3.35, z: 14.3, rotY: 0.35 },
      ];
      p.partyMembers.slice(0, 3).forEach((friend, idx) => {
        const fSkin = OPERATOR_SKINS[friend.skinId] || OPERATOR_SKINS['alpine-ghost'];
        const fBuilt = buildOperatorCharacterGroup('SQUAD', contactShadowTex, {
          primary: fSkin.primaryHex,
          secondary: fSkin.secondaryHex,
          visor: fSkin.visorHex,
        });
        const slot = offsets[idx] || offsets[0];
        const gy = getTerrainHeight(slot.x, slot.z, p.mapId);
        fBuilt.root.position.set(slot.x, gy, slot.z);
        fBuilt.root.rotation.y = slot.rotY;

        // Add glowing party pedestal ring under each accepted party friend's 3D avatar
        const friendPedRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.05, 0.04, 8, 24),
          new THREE.MeshBasicMaterial({ color: 0x10b981 })
        );
        friendPedRing.rotation.x = Math.PI / 2;
        friendPedRing.position.set(slot.x, gy + 0.08, slot.z);
        lobbyPartyGroup.add(friendPedRing);
        lobbyPartyGroup.add(fBuilt.root);
      });
    }

    // Static obstacles & dynamic built walls
    let staticObstacles: ObstacleBox[] = [];
    let localBuiltWalls: BuiltWallEntity[] = [];
    const wallMeshMap = new Map<string, THREE.Group>();

    // Salvage Crates
    let salvageNodes: SalvageNode[] = [];
    const crateMeshMap = new Map<string, THREE.Group>();

    // AI NPCs
    let npcs: NpcEntity[] = [];
    const npcMeshMap = new Map<
      string,
      ReturnType<typeof buildOperatorCharacterGroup>
    >();

    // Friendly AI / Party Squadmates (for 2v2, 3v3, 4v4)
    let allyNpcs: NpcEntity[] = [];
    const allyMeshMap = new Map<
      string,
      ReturnType<typeof buildOperatorCharacterGroup>
    >();

    // Remote Squadmates
    const remoteMeshMap = new Map<
      string,
      ReturnType<typeof buildOperatorCharacterGroup>
    >();

    // Player Combat & Physics State
    let playerState: PlayerPhysicsState = {
      x: 0,
      y: 0,
      z: 20,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      pitch: 0,
      grounded: true,
      coyoteTimer: 0.1,
      jumpBufferTimer: 0,
      isSliding: false,
      slideTimer: 0,
      slideCooldown: 0,
      isVaulting: false,
      vaultTimer: 0,
      isClimbing: false,
      eyeHeight: 1.72,
      stamina: 100,
      movementMode: 'WALK',
    };

    // Player 2 Combat & Physics State (Offline Co-Op Split-Screen)
    let p2State: PlayerPhysicsState = {
      x: 3.6,
      y: 0,
      z: 20,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      pitch: 0,
      grounded: true,
      coyoteTimer: 0.1,
      jumpBufferTimer: 0,
      isSliding: false,
      slideTimer: 0,
      slideCooldown: 0,
      isVaulting: false,
      vaultTimer: 0,
      isClimbing: false,
      eyeHeight: 1.72,
      stamina: 100,
      movementMode: 'WALK',
    };
    let p2Hp = 100;
    const p2MaxHp = 100;
    let p2Shield = 50;
    const p2MaxShield = 50;
    let p2Ammo = 30;
    let p2FireCooldown = 0;
    let p2Eliminations = 0;

    let playerHp = 100;
    const playerMaxHp = 100;
    let playerShield = 50;
    const playerMaxShield = 50;
    let playerSalvage = 100;
    let currentWave = 1;
    let totalWavesInMatch = 2;
    let playerScore = 0;
    let playerEliminations = 0;
    let wallsConstructedCount = 0;
    let currentAmmo = 30;
    let reloadTimer = 0;
    let fireCooldown = 0;
    let abilityCooldown = 0;
    let abilityActiveTimer = 0;
    let stimCooldown = 0;
    let stimActiveTimer = 0;
    let buildModeActive = false;
    let activeEmoteBanner: string | null = null;
    let emoteBannerTimer = 0;
    let hitstopTimer = 0;
    let cameraTrauma = 0;
    let hitMarkerTimer = 0;
    let killMarkerTimer = 0;
    let damageVignette = 0;
    let sessionEnded = false;
    let smartTargetLocked = false;
    let firedThisStep = false;
    let brPlayersAlive = 100;
    let brReserveBots = 0;
    let brSimElimTimer = 0;

    // Dynamic Environment Event State
    let activeEnvEvent: DynamicEnvironmentEventDef | null = null;
    let envEventActiveTimer = 0;
    let envEventCooldownTimer = 6.5; // First dynamic biome event triggers 6.5s into combat
    let pendingForceEnvEvent = false;

    // Match Replay Recording Buffers
    let matchElapsedSec = 0;
    let lastReplayCaptureSec = -1;
    let replayFrames: ReplayFrameSnapshot[] = [];
    let replayHighlights: ReplayHighlightMarker[] = [];

    function recordReplayHighlight(
      type: ReplayHighlightMarker['type'],
      label: string,
      colorHex: string
    ) {
      replayHighlights.push({
        id: `hl-${Date.now()}-${replayHighlights.length}`,
        timestamp: Number(matchElapsedSec.toFixed(2)),
        frameIndex: Math.max(0, replayFrames.length - 1),
        type,
        label,
        colorHex,
      });
    }

    function captureReplayFrame(forceCapture = false) {
      if (!forceCapture && matchElapsedSec - lastReplayCaptureSec < 0.12) return;
      lastReplayCaptureSec = matchElapsedSec;
      const snap: ReplayFrameSnapshot = {
        timestamp: Number(matchElapsedSec.toFixed(2)),
        playerX: Number(playerState.x.toFixed(2)),
        playerY: Number(playerState.y.toFixed(2)),
        playerZ: Number(playerState.z.toFixed(2)),
        playerYaw: Number(playerState.yaw.toFixed(3)),
        playerPitch: Number(playerState.pitch.toFixed(3)),
        eyeHeight: Number(playerState.eyeHeight.toFixed(2)),
        hp: Math.round(playerHp),
        shield: Math.round(playerShield),
        score: Math.round(playerScore),
        eliminations: playerEliminations,
        movementMode: playerState.movementMode,
        firedShot: firedThisStep,
        activeEventId: activeEnvEvent ? activeEnvEvent.id : null,
        npcs: npcs.map((n) => ({
          id: n.id,
          callsign: n.callsign,
          archetype: n.archetype,
          x: Number(n.x.toFixed(2)),
          y: Number(n.y.toFixed(2)),
          z: Number(n.z.toFixed(2)),
          rotY: Number(n.rotY.toFixed(2)),
          hp: Math.round(n.hp),
          maxHp: Math.round(n.maxHp),
          state: n.state,
        })),
        walls: localBuiltWalls.map((w) => ({
          id: w.id,
          type: w.type,
          x: Number(w.x.toFixed(2)),
          y: Number(w.y.toFixed(2)),
          z: Number(w.z.toFixed(2)),
          rotY: Number(w.rotY.toFixed(2)),
          hp: Math.round(w.hp),
        })),
      };
      firedThisStep = false;
      replayFrames.push(snap);
      if (replayFrames.length > 600) {
        replayFrames.shift();
      }
    }

    function publishReplayRecording() {
      const p = propsRef.current;
      let framesToPublish = [...replayFrames];
      let highlightsToPublish = [...replayHighlights];

      // If fewer than 4 frames have been recorded yet, synthesize a 12s Tactical Highlight Replay
      // so the player can test and scrub 3D Match Replay immediately from the Lobby or early match.
      if (framesToPublish.length < 4) {
        const envDef = DYNAMIC_ENVIRONMENT_EVENTS[p.mapId] || DYNAMIC_ENVIRONMENT_EVENTS['alpine-outpost'];
        framesToPublish = Array.from({ length: 41 }, (_, idx) => {
          const t = Number((idx * 0.3).toFixed(2));
          const progress = idx / 40;
          const px = Math.sin(progress * Math.PI * 1.5) * 6.5;
          const pz = 20 - progress * 18;
          const py = getTerrainHeight(px, pz, p.mapId);
          return {
            timestamp: t,
            playerX: Number(px.toFixed(2)),
            playerY: Number(py.toFixed(2)),
            playerZ: Number(pz.toFixed(2)),
            playerYaw: Number((Math.sin(progress * Math.PI * 2) * 0.35).toFixed(3)),
            playerPitch: Number((Math.cos(progress * Math.PI * 3) * 0.08).toFixed(3)),
            eyeHeight: idx >= 14 && idx <= 18 ? 0.9 : 1.72,
            hp: Math.max(65, 100 - idx),
            shield: 50,
            score: idx * 25,
            eliminations: idx >= 30 ? 2 : idx >= 18 ? 1 : 0,
            movementMode: idx >= 14 && idx <= 18 ? 'SLIDE' : 'SPRINT',
            firedShot: idx % 4 === 0,
            activeEventId: idx >= 10 ? envDef.id : null,
            npcs: npcs.map((n, nIdx) => ({
              id: n.id,
              callsign: n.callsign,
              archetype: n.archetype,
              x: Number((n.x + Math.sin(progress * 4 + nIdx) * 3.5).toFixed(2)),
              y: Number(n.y.toFixed(2)),
              z: Number((n.z + progress * 6).toFixed(2)),
              rotY: Number(n.rotY.toFixed(2)),
              hp: nIdx === 0 && idx >= 18 ? 0 : nIdx === 1 && idx >= 30 ? 0 : n.maxHp,
              maxHp: n.maxHp,
              state:
                (nIdx === 0 && idx >= 18) || (nIdx === 1 && idx >= 30)
                  ? 'ko'
                  : idx % 7 === 0
                    ? 'windup'
                    : 'seek',
            })),
            walls: localBuiltWalls.map((w) => ({
              id: w.id,
              type: w.type,
              x: w.x,
              y: w.y,
              z: w.z,
              rotY: w.rotY,
              hp: w.hp,
            })),
          };
        });
        highlightsToPublish = [
          {
            id: 'hl-demo-1',
            timestamp: 2.1,
            frameIndex: 7,
            type: 'WALL_BUILT',
            label: 'Built Ballistic Barricade',
            colorHex: '#38bdf8',
          },
          {
            id: 'hl-demo-2',
            timestamp: 3.0,
            frameIndex: 10,
            type: 'ENV_EVENT',
            label: envDef.name,
            colorHex: envDef.accentColor,
          },
          {
            id: 'hl-demo-3',
            timestamp: 5.4,
            frameIndex: 18,
            type: 'HEADSHOT',
            label: 'Headshot RUSHER-01',
            colorHex: '#f59e0b',
          },
          {
            id: 'hl-demo-4',
            timestamp: 9.0,
            frameIndex: 30,
            type: 'ELIMINATION',
            label: 'Eliminated MARKSMAN-02',
            colorHex: '#ef4444',
          },
        ];
      }

      const durationSec =
        framesToPublish.length > 0
          ? Math.max(0.5, framesToPublish[framesToPublish.length - 1].timestamp)
          : 12.0;
      p.onReplayUpdated({
        id: `replay-${Date.now()}`,
        mapId: p.mapId,
        trainingLevel: p.trainingLevel,
        callsign: p.callsign,
        weaponId: p.weaponId,
        skinId: p.skinId,
        durationSec,
        finalScore: Math.max(playerScore, framesToPublish[framesToPublish.length - 1]?.score ?? 0),
        finalEliminations: Math.max(
          playerEliminations,
          framesToPublish[framesToPublish.length - 1]?.eliminations ?? 0
        ),
        frames: framesToPublish,
        highlights: highlightsToPublish,
      });
    }

    // Infinite Procedural Chunk Streaming State (64m x 64m chunks, 5x5 active grid = 25 chunks)
    interface LoadedChunkEntry {
      key: string;
      cx: number;
      cz: number;
      group: THREE.Group;
      terrainGeo: THREE.PlaneGeometry;
      obstacles: ObstacleBox[];
      crates: SalvageNode[];
      spawnAgeSec: number;
      isInitialChunk: boolean;
    }

    const loadedChunks = new Map<string, LoadedChunkEntry>();
    const discoveredChunkKeys = new Set<string>(['0,0']);
    let currentPlayerChunkKey = '0,0';
    let sharedTerrainMat: THREE.MeshStandardMaterial | null = null;
    let sharedStructMat: THREE.MeshStandardMaterial | null = null;
    let sharedTrimMat: THREE.MeshStandardMaterial | null = null;
    let sharedBeaconMat: THREE.MeshStandardMaterial | null = null;
    let sharedTrunkMat: THREE.MeshStandardMaterial | null = null;
    let sharedCanopyMat: THREE.MeshStandardMaterial | null = null;
    let sharedCrownMat: THREE.MeshStandardMaterial | null = null;
    const sharedTrunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 3.2, 8);
    const sharedCanopyGeo = new THREE.ConeGeometry(2.4, 4.6, 8);
    const sharedCrownGeo = new THREE.ConeGeometry(1.7, 3.6, 8);
    const sharedCrateBoxGeo = new THREE.BoxGeometry(1.1, 0.75, 0.85);
    const sharedCrateLidGeo = new THREE.BoxGeometry(1.16, 0.14, 0.9);
    const sharedCrateBoxMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.7,
    });
    const sharedCrateLidMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.8,
      roughness: 0.3,
    });

    function buildSingleChunkRecord(
      cx: number,
      cz: number,
      mapId: MapId,
      isInitialChunk: boolean
    ): LoadedChunkEntry {
      const biome = BIOMES[mapId] || BIOMES['alpine-outpost'];
      const bp: ProceduralChunkBlueprint = generateProceduralChunkBlueprint(cx, cz, mapId);
      const chunkGroup = new THREE.Group();

      // 1. Seamless 64m x 64m Sculpted Terrain Tile with world-space continuous heights
      const tileGeo = new THREE.PlaneGeometry(WORLD_CHUNK_SIZE, WORLD_CHUNK_SIZE, 16, 16);
      tileGeo.rotateX(-Math.PI / 2);
      const posAttr = tileGeo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const localX = posAttr.getX(i);
        const localZ = posAttr.getZ(i);
        const worldX = bp.centerX + localX;
        const worldZ = bp.centerZ + localZ;
        posAttr.setY(i, getTerrainHeight(worldX, worldZ, mapId));
      }
      tileGeo.computeVertexNormals();

      const tileMesh = new THREE.Mesh(
        tileGeo,
        sharedTerrainMat || new THREE.MeshStandardMaterial({ color: 0x475569 })
      );
      tileMesh.position.set(bp.centerX, 0, bp.centerZ);
      tileMesh.receiveShadow = true;
      chunkGroup.add(tileMesh);

      const chunkObstacles: ObstacleBox[] = [];

      // 2. If Origin Chunk (0,0), include Iconic Central Landmark & Lobby Pedestal
      if (cx === 0 && cz === 0 && sharedStructMat && sharedTrimMat && sharedBeaconMat) {
        const basePad = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 10), sharedTrimMat);
        basePad.position.set(0, 0.4, -18);
        basePad.receiveShadow = true;
        chunkGroup.add(basePad);

        if (biome.landmarkType === 'playground-fort') {
          // Tactical Playground Park: Multi-deck climbing castle + spiral tube slide
          const fortPostMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 });
          const slideMat = new THREE.MeshStandardMaterial({
            color: 0xf43f5e,
            roughness: 0.3,
            metalness: 0.2,
          });
          const roofMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4 });
          for (const px of [-2.4, 2.4]) {
            for (const pz of [-20.4, -15.6]) {
              const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 8.5, 10), fortPostMat);
              post.position.set(px, 4.25, pz);
              chunkGroup.add(post);
            }
          }
          const deck = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.5, 5.6), sharedStructMat);
          deck.position.set(0, 5.2, -18);
          const pyramidRoof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 3.2, 4), roofMat);
          pyramidRoof.position.set(0, 9.8, -18);
          pyramidRoof.rotation.y = Math.PI / 4;
          const tubeSlide = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.65, 10, 24, Math.PI * 1.35), slideMat);
          tubeSlide.position.set(2.8, 3.2, -18);
          tubeSlide.rotation.x = Math.PI / 3;
          chunkGroup.add(deck, pyramidRoof, tubeSlide);
        } else if (biome.landmarkType === 'forest-watchtower') {
          // Redwood Deep Forest: Tall timber fire-lookout watchtower
          const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.85 });
          for (const px of [-2.1, 2.1]) {
            for (const pz of [-20.1, -15.9]) {
              const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 11.0, 8), woodMat);
              leg.position.set(px, 5.5, pz);
              chunkGroup.add(leg);
            }
          }
          const cabin = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.2, 5.4), woodMat);
          cabin.position.set(0, 11.4, -18);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(4.5, 2.6, 4), sharedTrimMat);
          roof.position.set(0, 14.2, -18);
          roof.rotation.y = Math.PI / 4;
          const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 12), sharedBeaconMat);
          beacon.position.set(0, 15.8, -18);
          chunkGroup.add(cabin, roof, beacon);
        } else if (biome.landmarkType === 'water-slide-tower') {
          // Water Splash Aqua Park: Hydro-flume tower + twin aqua slides + splash pool ring
          const poolBasin = new THREE.Mesh(
            new THREE.CylinderGeometry(6.8, 7.2, 0.9, 24),
            new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.2, metalness: 0.3 })
          );
          poolBasin.position.set(0, 0.45, -18);
          const hydroCore = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 12, 16), sharedStructMat);
          hydroCore.position.set(0, 6.2, -18);
          const flumeA = new THREE.Mesh(
            new THREE.TorusGeometry(3.4, 0.62, 10, 24, Math.PI * 1.5),
            new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.2 })
          );
          flumeA.position.set(2.2, 4.8, -18);
          flumeA.rotation.x = Math.PI / 2.6;
          const bucketTop = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.3, 2.4, 14), sharedBeaconMat);
          bucketTop.position.set(0, 13.6, -18);
          chunkGroup.add(poolBasin, hydroCore, flumeA, bucketTop);
        } else if (biome.landmarkType === 'ferris-wheel') {
          // Abandoned Theme Park: Giant rusted Ferris Wheel + neon hub
          const wheelRim = new THREE.Mesh(
            new THREE.TorusGeometry(6.2, 0.32, 10, 28),
            sharedBeaconMat
          );
          wheelRim.position.set(0, 8.8, -18);
          const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 10, 8), sharedStructMat);
          legL.position.set(-2.6, 4.8, -18);
          legL.rotation.z = -0.24;
          const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 10, 8), sharedStructMat);
          legR.position.set(2.6, 4.8, -18);
          legR.rotation.z = 0.24;
          chunkGroup.add(wheelRim, legL, legR);
          for (let g = 0; g < 8; g++) {
            const ang = (g / 8) * Math.PI * 2;
            const gondola = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 1.1), sharedTrimMat);
            gondola.position.set(Math.cos(ang) * 6.2, 8.8 + Math.sin(ang) * 6.2, -18);
            chunkGroup.add(gondola);
          }
        } else {
          const towerCore = new THREE.Mesh(
            new THREE.BoxGeometry(4.6, 11.5, 4.6),
            sharedStructMat
          );
          towerCore.position.set(0, 5.9, -18);
          towerCore.castShadow = true;
          towerCore.receiveShadow = true;
          chunkGroup.add(towerCore);

          const upperRing = new THREE.Mesh(
            new THREE.CylinderGeometry(3.8, 2.9, 1.8, 16),
            sharedTrimMat
          );
          upperRing.position.set(0, 12.2, -18);
          chunkGroup.add(upperRing);

          const domeCrown = new THREE.Mesh(
            biome.landmarkType === 'cryo-monolith' || biome.landmarkType === 'obsidian-reactor'
              ? new THREE.OctahedronGeometry(2.7, 1)
              : new THREE.SphereGeometry(2.6, 18, 14),
            sharedBeaconMat
          );
          domeCrown.position.set(0, 14.6, -18);
          chunkGroup.add(domeCrown);
        }

        const pedY = getTerrainHeight(0, 16, mapId);
        const pedDisc = new THREE.Mesh(
          new THREE.CylinderGeometry(2.1, 2.4, 0.16, 24),
          sharedTrimMat
        );
        pedDisc.position.set(0, pedY + 0.08, 16);
        const pedRing = new THREE.Mesh(
          new THREE.TorusGeometry(2.15, 0.05, 8, 32),
          sharedBeaconMat
        );
        pedRing.rotation.x = Math.PI / 2;
        pedRing.position.set(0, pedY + 0.16, 16);
        chunkGroup.add(pedDisc, pedRing);

        chunkObstacles.push({
          id: 'landmark-core-0-0',
          x: 0,
          y: 0,
          z: -18,
          width: 5.0,
          height: 12,
          depth: 5.0,
          climbable: true,
          vaultable: false,
        });
      } else if (bp.hasOutpostSpire && sharedStructMat && sharedTrimMat && sharedBeaconMat) {
        // Distant Sector Relay Spire on procedural outpost chunks
        const spireY = getTerrainHeight(bp.centerX, bp.centerZ, mapId);
        const spireGroup = new THREE.Group();
        spireGroup.position.set(bp.centerX, spireY, bp.centerZ);
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(1.1, 1.6, 8.8, 10),
          sharedStructMat
        );
        pillar.position.y = 4.4;
        const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(1.35, 0), sharedBeaconMat);
        beacon.position.y = 9.6;
        spireGroup.add(pillar, beacon);
        chunkGroup.add(spireGroup);
      }

      // 3. Procedural Chunk Cover Bunkers, Themed Props & Climbable Sniper Towers
      if (sharedStructMat && sharedTrimMat && sharedBeaconMat) {
        for (const obs of bp.obstacles) {
          const cg = new THREE.Group();
          cg.position.set(obs.x, obs.y, obs.z);

          const body = new THREE.Mesh(
            new THREE.BoxGeometry(obs.width, obs.height, obs.depth),
            obs.climbable ? sharedStructMat : sharedTrimMat
          );
          body.position.y = obs.height * 0.5;
          body.castShadow = true;
          body.receiveShadow = true;
          cg.add(body);

          const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(obs.width + 0.06, 0.1, obs.depth + 0.06),
            sharedBeaconMat
          );
          stripe.position.y = obs.height - 0.12;
          cg.add(stripe);

          // Add distinctive themed silhouettes on top/side of cover obstacles
          if (obs.themePropType === 'slide') {
            const ramp = new THREE.Mesh(
              new THREE.BoxGeometry(1.2, 0.18, obs.height * 1.25),
              sharedBeaconMat
            );
            ramp.position.set(0, obs.height * 0.55, obs.depth * 0.65);
            ramp.rotation.x = 0.55;
            cg.add(ramp);
          } else if (obs.themePropType === 'swing') {
            const topBar = new THREE.Mesh(
              new THREE.CylinderGeometry(0.08, 0.08, obs.width + 1.2, 8),
              sharedBeaconMat
            );
            topBar.rotation.z = Math.PI / 2;
            topBar.position.y = obs.height + 1.1;
            cg.add(topBar);
          } else if (obs.themePropType === 'log-bunker') {
            const logMesh = new THREE.Mesh(
              new THREE.CylinderGeometry(0.55, 0.55, obs.width + 0.4, 10),
              sharedTrunkMat || sharedTrimMat
            );
            logMesh.rotation.z = Math.PI / 2;
            logMesh.position.y = obs.height + 0.35;
            cg.add(logMesh);
          } else if (obs.themePropType === 'pool-wall') {
            const fountainJet = new THREE.Mesh(
              new THREE.CylinderGeometry(0.18, 0.42, 1.4, 10),
              sharedBeaconMat
            );
            fountainJet.position.y = obs.height + 0.7;
            cg.add(fountainJet);
          } else if (obs.themePropType === 'coaster-arch') {
            const archRing = new THREE.Mesh(
              new THREE.TorusGeometry(obs.width * 0.45, 0.12, 8, 16, Math.PI),
              sharedBeaconMat
            );
            archRing.position.y = obs.height;
            cg.add(archRing);
          }

          if (obs.climbable) {
            for (let r = 0; r < 4; r++) {
              const rung = new THREE.Mesh(
                new THREE.BoxGeometry(0.75, 0.06, obs.depth + 0.14),
                sharedBeaconMat
              );
              rung.position.y = 0.55 + r * 0.6;
              cg.add(rung);
            }
          }

          chunkGroup.add(cg);
          chunkObstacles.push(obs);
        }
      }

      // 4. Procedural Chunk Composite 3-Part Trees / Monoliths
      if (bp.trees.length > 0 && sharedTrunkMat && sharedCanopyMat && sharedCrownMat) {
        const tCount = bp.trees.length;
        const trunkInst = new THREE.InstancedMesh(sharedTrunkGeo, sharedTrunkMat, tCount);
        const canopyInst = new THREE.InstancedMesh(sharedCanopyGeo, sharedCanopyMat, tCount);
        const crownInst = new THREE.InstancedMesh(sharedCrownGeo, sharedCrownMat, tCount);

        bp.trees.forEach((tr, idx) => {
          _dummyObj.position.set(tr.x, tr.y + 1.5 * tr.scale, tr.z);
          _dummyObj.rotation.set(0, tr.rotY, 0);
          _dummyObj.scale.set(tr.scale, tr.scale, tr.scale);
          _dummyObj.updateMatrix();
          trunkInst.setMatrixAt(idx, _dummyObj.matrix);

          _dummyObj.position.set(tr.x, tr.y + 4.1 * tr.scale, tr.z);
          _dummyObj.updateMatrix();
          canopyInst.setMatrixAt(idx, _dummyObj.matrix);

          _dummyObj.position.set(tr.x, tr.y + 6.1 * tr.scale, tr.z);
          _dummyObj.updateMatrix();
          crownInst.setMatrixAt(idx, _dummyObj.matrix);

          _color.set(biome.terrainSecondaryHex).offsetHSL(0, 0, ((idx % 3) - 1) * 0.05);
          canopyInst.setColorAt(idx, _color);
          crownInst.setColorAt(idx, _color);
        });

        trunkInst.instanceMatrix.needsUpdate = true;
        canopyInst.instanceMatrix.needsUpdate = true;
        crownInst.instanceMatrix.needsUpdate = true;
        if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;
        if (crownInst.instanceColor) crownInst.instanceColor.needsUpdate = true;
        trunkInst.computeBoundingSphere();
        canopyInst.computeBoundingSphere();
        crownInst.computeBoundingSphere();
        chunkGroup.add(trunkInst, canopyInst, crownInst);
      }

      // 5. Procedural Chunk Salvage Crates
      const chunkCrates: SalvageNode[] = bp.salvageCrates.map((c) => ({ ...c }));
      for (const node of chunkCrates) {
        const crateG = new THREE.Group();
        crateG.position.set(node.x, node.y, node.z);
        const box = new THREE.Mesh(sharedCrateBoxGeo, sharedCrateBoxMat);
        box.position.y = 0.375;
        const lid = new THREE.Mesh(sharedCrateLidGeo, sharedCrateLidMat);
        lid.position.y = 0.78;
        crateG.add(box, lid);
        cratesGroup.add(crateG);
        crateMeshMap.set(node.id, crateG);
      }

      // Newly streamed distant chunks smoothly rise into place inside the horizon rain mist
      if (!isInitialChunk) {
        chunkGroup.position.y = -1.6;
      }
      environmentGroup.add(chunkGroup);

      return {
        key: bp.key,
        cx,
        cz,
        group: chunkGroup,
        terrainGeo: tileGeo,
        obstacles: chunkObstacles,
        crates: chunkCrates,
        spawnAgeSec: isInitialChunk ? 10 : 0,
        isInitialChunk,
      };
    }

    function spawnChunkPatrolNpcs(cx: number, cz: number) {
      const p = propsRef.current;
      const roster = computeTeamMatchRoster(
        p.battleMode,
        p.botHardness,
        currentWave,
        p.partyMembers.length
      );
      // Only spawn dynamic chunk patrol bots in open-world chunk-streaming modes (Practice / Battle Royale)
      if (!roster.useChunkStreaming) return;

      const archetypes: NpcArchetype[] = ['rusher', 'marksman', 'flanker', 'juggernaut'];
      const patrolCount = p.battleMode === 'battle-royale' ? 3 : 2;
      const originX = cx * WORLD_CHUNK_SIZE;
      const originZ = cz * WORLD_CHUNK_SIZE;

      for (let i = 0; i < patrolCount; i++) {
        if (p.battleMode === 'battle-royale' && brReserveBots <= 0) break;
        if (p.battleMode === 'battle-royale') brReserveBots = Math.max(0, brReserveBots - 1);

        const arch = archetypes[Math.abs(cx + cz + i) % archetypes.length];
        const nx = originX + (i === 0 ? -14 : i === 1 ? 14 : 0);
        const nz = originZ + (i === 0 ? -12 : i === 1 ? 12 : -18);
        const ny = getTerrainHeight(nx, nz, p.mapId);
        const baseHp = arch === 'juggernaut' ? 185 : 105;
        const maxHp = Math.round(baseHp * roster.hpMultiplier);
        const maxShield = arch === 'juggernaut' ? 80 : 30;
        const id = `npc-chunk-${cx}-${cz}-${i}-${Date.now()}`;
        const callsign =
          p.battleMode === 'battle-royale'
            ? `SURVIVOR-${Math.max(2, brPlayersAlive - i)}`
            : `SECTOR-${Math.abs(cx)}${Math.abs(cz)}-${i + 1}`;
        const npc: NpcEntity = {
          id,
          callsign,
          archetype: arch,
          x: nx,
          y: ny,
          z: nz,
          vx: 0,
          vz: 0,
          rotY: 0,
          hp: maxHp,
          maxHp,
          shield: maxShield,
          maxShield,
          state: 'patrol',
          windupTimer: 0.45,
          attackCooldown: 1.35 * roster.fireCooldownMultiplier,
          koTimer: 0,
          hitFlashTimer: 0,
          strafeSign: i % 2 === 0 ? 1 : -1,
        };
        npcs.push(npc);
        const built = buildOperatorCharacterGroup(arch, contactShadowTex);
        built.root.position.set(nx, ny, nz);
        npcsGroup.add(built.root);
        npcMeshMap.set(id, built);
      }
    }

    function rebuildArenaBoundaryPerimeter(mapId: MapId) {
      while (arenaBoundaryGroup.children.length > 0) {
        arenaBoundaryGroup.remove(arenaBoundaryGroup.children[0]);
      }
      const p = propsRef.current;
      const roster = computeTeamMatchRoster(
        p.battleMode,
        p.botHardness,
        currentWave,
        p.partyMembers.length
      );
      if (roster.useChunkStreaming) return;

      const r = roster.arenaRadius;
      const biome = BIOMES[mapId] || BIOMES['alpine-outpost'];
      const railMat = new THREE.MeshBasicMaterial({
        color: biome.accentHex,
        transparent: true,
        opacity: 0.42,
      });
      const postMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.7,
        roughness: 0.3,
      });

      const corners = [
        { x: -r, z: -r },
        { x: r, z: -r },
        { x: r, z: r },
        { x: -r, z: r },
      ];
      for (const c of corners) {
        const py = getTerrainHeight(c.x, c.z, mapId);
        const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 6.5, 8), postMat);
        pylon.position.set(c.x, py + 3.25, c.z);
        const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), railMat);
        beacon.position.set(c.x, py + 7.0, c.z);
        arenaBoundaryGroup.add(pylon, beacon);
      }

      const span = r * 2;
      const northRail = new THREE.Mesh(new THREE.BoxGeometry(span, 2.2, 0.18), railMat);
      northRail.position.set(0, getTerrainHeight(0, -r, mapId) + 1.1, -r);
      const southRail = new THREE.Mesh(new THREE.BoxGeometry(span, 2.2, 0.18), railMat);
      southRail.position.set(0, getTerrainHeight(0, r, mapId) + 1.1, r);
      const eastRail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, span), railMat);
      eastRail.position.set(r, getTerrainHeight(r, 0, mapId) + 1.1, 0);
      const westRail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, span), railMat);
      westRail.position.set(-r, getTerrainHeight(-r, 0, mapId) + 1.1, 0);
      arenaBoundaryGroup.add(northRail, southRail, eastRail, westRail);
    }

    function syncInfiniteChunks(
      centerX: number,
      centerZ: number,
      mapId: MapId,
      forceRebuild = false
    ) {
      const p = propsRef.current;
      const roster = computeTeamMatchRoster(
        p.battleMode,
        p.botHardness,
        currentWave,
        p.partyMembers.length
      );
      const centerChunk = roster.useChunkStreaming
        ? getChunkCoordFromWorld(centerX, centerZ)
        : { cx: 0, cz: 0 };
      const nextKey = `${centerChunk.cx},${centerChunk.cz}`;

      if (!forceRebuild && nextKey === currentPlayerChunkKey && loadedChunks.size > 0) {
        return;
      }

      const prevKey = currentPlayerChunkKey;
      currentPlayerChunkKey = nextKey;

      if (!discoveredChunkKeys.has(nextKey)) {
        discoveredChunkKeys.add(nextKey);
        if (
          p.gameState === 'playing' &&
          prevKey !== nextKey &&
          roster.useChunkStreaming
        ) {
          spawnChunkPatrolNpcs(centerChunk.cx, centerChunk.cz);
        }
      }

      // Fixed-player modes (1v1, 2v2, 3v3, 4v4, party-vs) use a bounded tailored map without chunk streaming
      const desiredCoords = roster.useChunkStreaming
        ? getStreamingChunkCoords(centerX, centerZ, 2)
        : getStreamingChunkCoords(0, 0, roster.arenaRadius > 32 ? 1 : 0);
      const desiredKeySet = new Set(desiredCoords.map((c) => c.key));

      // Unload chunks outside the active streaming radius
      for (const [key, entry] of loadedChunks.entries()) {
        if (!desiredKeySet.has(key)) {
          environmentGroup.remove(entry.group);
          entry.terrainGeo.dispose();
          for (const c of entry.crates) {
            const cm = crateMeshMap.get(c.id);
            if (cm) {
              cratesGroup.remove(cm);
              crateMeshMap.delete(c.id);
            }
          }
          loadedChunks.delete(key);
        }
      }

      // Stream in any missing chunks
      for (const coord of desiredCoords) {
        if (!loadedChunks.has(coord.key)) {
          const entry = buildSingleChunkRecord(
            coord.cx,
            coord.cz,
            mapId,
            forceRebuild || !roster.useChunkStreaming
          );
          loadedChunks.set(coord.key, entry);
        }
      }

      // Rebuild active collision obstacles & salvage nodes from currently loaded chunks
      const nextObstacles: ObstacleBox[] = [];
      const nextCrates: SalvageNode[] = [];
      for (const entry of loadedChunks.values()) {
        for (const obs of entry.obstacles) {
          if (
            roster.useChunkStreaming ||
            (Math.abs(obs.x) <= roster.arenaRadius - 1.5 &&
              Math.abs(obs.z) <= roster.arenaRadius - 1.5)
          ) {
            nextObstacles.push(obs);
          }
        }
        for (const crate of entry.crates) {
          if (
            roster.useChunkStreaming ||
            (Math.abs(crate.x) <= roster.arenaRadius - 1.5 &&
              Math.abs(crate.z) <= roster.arenaRadius - 1.5)
          ) {
            nextCrates.push(crate);
          }
        }
      }
      staticObstacles = nextObstacles;
      salvageNodes = nextCrates;
    }

    // Build / Rebuild Infinite Chunked Biome Environment
    function buildBiomeScene(mapId: MapId) {
      const biome = BIOMES[mapId] || BIOMES['alpine-outpost'];
      scene.background = new THREE.Color(biome.skyHorizonHex);
      // Calibrated exponential horizon fog that blends with Light Rain to mask chunk generation at ~128m
      scene.fog = new THREE.FogExp2(biome.fogHex, Math.max(0.0135, biome.fogDensity * 1.18));
      sunLight.color.setHex(biome.sunHex);
      sunLight.intensity = biome.sunIntensity;
      hemiLight.color.setHex(biome.hemiSkyHex);
      hemiLight.groundColor.setHex(biome.hemiGroundHex);

      // Clear previous biome chunks & crates
      for (const entry of loadedChunks.values()) {
        environmentGroup.remove(entry.group);
        entry.terrainGeo.dispose();
      }
      loadedChunks.clear();
      while (environmentGroup.children.length > 0) {
        environmentGroup.remove(environmentGroup.children[0]);
      }
      while (cratesGroup.children.length > 0) {
        cratesGroup.remove(cratesGroup.children[0]);
      }
      crateMeshMap.clear();
      staticObstacles = [];
      salvageNodes = [];

      const { albedoTex, bumpTex } = createProceduralSurfaceTextures(
        renderer,
        biome.terrainPrimaryHex,
        biome.terrainSecondaryHex
      );

      sharedTerrainMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: albedoTex,
        bumpMap: bumpTex,
        bumpScale: 0.15,
        roughness: 0.84,
        metalness: 0.08,
      });
      sharedStructMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.45,
        metalness: 0.65,
      });
      sharedTrimMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.7,
        metalness: 0.3,
      });
      sharedBeaconMat = new THREE.MeshStandardMaterial({
        color: biome.accentHex,
        emissive: biome.accentHex,
        emissiveIntensity: 1.6,
        roughness: 0.2,
      });
      sharedTrunkMat = new THREE.MeshStandardMaterial({
        color: 0x3f2e21,
        roughness: 0.9,
      });
      sharedCanopyMat = new THREE.MeshStandardMaterial({
        color: biome.terrainSecondaryHex,
        roughness: 0.68,
        metalness: 0.12,
      });
      sharedCrownMat = new THREE.MeshStandardMaterial({
        color: biome.terrainPrimaryHex,
        roughness: 0.42,
        metalness: 0.22,
      });

      discoveredChunkKeys.clear();
      discoveredChunkKeys.add('0,0');
      syncInfiniteChunks(playerState.x, playerState.z, mapId, true);
      rebuildArenaBoundaryPerimeter(mapId);
      syncLobbyAvatars();
    }

    // Rebuild First-Person Weapon Viewmodel (Player 1 & Split-Screen Player 2)
    function rebuildWeaponViewModel() {
      while (weaponRigGroup.children.length > 0) {
        weaponRigGroup.remove(weaponRigGroup.children[0]);
      }
      while (p2WeaponRigGroup.children.length > 0) {
        p2WeaponRigGroup.remove(p2WeaponRigGroup.children[0]);
      }
      const p = propsRef.current;
      const vm = buildWeaponViewModel(
        p.weaponId,
        p.opticId,
        p.barrelId,
        p.underbarrelId,
        p.magId,
        p.skinId
      );
      vm.position.set(0.28, -0.24, -0.48);
      weaponRigGroup.add(vm);

      const vm2 = buildWeaponViewModel(
        p.weaponId,
        p.opticId,
        p.barrelId,
        p.underbarrelId,
        p.magId,
        'alpine-ghost'
      );
      vm2.position.set(0.28, -0.24, -0.48);
      p2WeaponRigGroup.add(vm2);
    }

    // Spawn AI Wave + Real Party Squadmates based on Battle Mode & Bot Hardness
    function spawnWaveNpcs(waveNum: number) {
      while (npcsGroup.children.length > 0) {
        npcsGroup.remove(npcsGroup.children[0]);
      }
      npcMeshMap.clear();
      npcs = [];

      while (alliesGroup.children.length > 0) {
        alliesGroup.remove(alliesGroup.children[0]);
      }
      allyMeshMap.clear();
      allyNpcs = [];

      const p = propsRef.current;
      const roster = computeTeamMatchRoster(
        p.battleMode,
        p.botHardness,
        waveNum,
        p.partyMembers.length
      );
      totalWavesInMatch = roster.totalWaves;
      const archetypes: NpcArchetype[] = ['rusher', 'marksman', 'flanker', 'juggernaut'];

      // Special Case 1: Party Mode (Play vs the friend(s) in your party!)
      if (p.battleMode === 'party-vs') {
        const partyRivals =
          p.partyMembers.length > 0
            ? p.partyMembers
            : [
                {
                  friendCode: 'PRTY-01',
                  username: 'PARTY-RIVAL-01',
                  level: 5,
                  skinId: 'vanguard-obsidian' as SkinId,
                  status: 'in-match' as const,
                  online: true,
                },
              ];

        for (let i = 0; i < partyRivals.length; i++) {
          const rival = partyRivals[i];
          const rSkin = OPERATOR_SKINS[rival.skinId] || OPERATOR_SKINS['vanguard-obsidian'];
          const angle = ((i / Math.max(1, partyRivals.length)) - 0.5) * Math.PI * 0.55;
          const dist = 21; // Within 25-block discovery zone for immediate Party Duel
          const nx = playerState.x + Math.sin(angle) * dist;
          const nz = playerState.z - Math.cos(angle) * dist;
          const ny = getTerrainHeight(nx, nz, p.mapId);
          const id = `npc-party-rival-${i}`;
          const npc: NpcEntity = {
            id,
            callsign: `${rival.username} [PARTY RIVAL]`,
            archetype: 'marksman',
            x: nx,
            y: ny,
            z: nz,
            vx: 0,
            vz: 0,
            rotY: 0,
            hp: Math.round(125 * roster.hpMultiplier),
            maxHp: Math.round(125 * roster.hpMultiplier),
            shield: 65,
            maxShield: 65,
            state: 'seek',
            windupTimer: 0.45,
            attackCooldown: 1.15 * roster.fireCooldownMultiplier,
            koTimer: 0,
            hitFlashTimer: 0,
            strafeSign: i % 2 === 0 ? 1 : -1,
          };
          npcs.push(npc);
          const built = buildOperatorCharacterGroup('marksman', contactShadowTex, {
            primary: rSkin.primaryHex,
            secondary: rSkin.secondaryHex,
            visor: rSkin.visorHex,
          });
          built.root.position.set(nx, ny, nz);
          npcsGroup.add(built.root);
          npcMeshMap.set(id, built);
        }
        return;
      }

      // Special Case 2: 100-Player Battle Royale (100 total combatants across huge chunk map)
      const activeSpawnCount =
        p.battleMode === 'battle-royale' ? 18 : roster.enemyCount;

      if (p.battleMode === 'battle-royale' && waveNum === 1) {
        brPlayersAlive = 100;
        brReserveBots = Math.max(0, 99 - activeSpawnCount);
        brSimElimTimer = 4.5;
      }

      for (let i = 0; i < activeSpawnCount; i++) {
        let arch: NpcArchetype = archetypes[i % 3];
        if (
          (p.botHardness === 'master' || p.botHardness === 'legend' || p.trainingLevel >= 2) &&
          i % 4 === 3
        ) {
          arch = 'juggernaut';
        }

        // In 1v1 / 2v2 / 3v3 / 4v4, place initial bots near the 25-block discovery boundary
        // In Battle Royale, spread bots from 22m out to 110m so distant bots patrol peacefully (>25 blocks)
        const angle =
          p.battleMode === 'battle-royale'
            ? (i / activeSpawnCount) * Math.PI * 2
            : ((i / Math.max(1, activeSpawnCount)) - 0.5) * Math.PI * 0.85;
        const dist =
          p.battleMode === 'battle-royale'
            ? 21 + (i % 6) * 15
            : Math.min(roster.arenaRadius - 4, 21 + (i % 3) * 6);
        const nx = THREE.MathUtils.clamp(
          playerState.x + Math.sin(angle) * dist,
          -roster.arenaRadius + 3,
          roster.arenaRadius - 3
        );
        const nz = THREE.MathUtils.clamp(
          playerState.z - Math.cos(angle) * dist - 4,
          -roster.arenaRadius + 3,
          roster.arenaRadius - 3
        );
        const ny = getTerrainHeight(nx, nz, p.mapId);

        const baseHp = arch === 'juggernaut' ? 190 : arch === 'rusher' ? 95 : 110;
        const maxHp = Math.round(baseHp * roster.hpMultiplier);
        const maxShield = arch === 'juggernaut' ? 90 : arch === 'flanker' ? 35 : 0;

        const id = `npc-w${waveNum}-${i}`;
        const callsign =
          p.battleMode === 'battle-royale'
            ? `BR-OP-${String(i + 2).padStart(3, '0')}`
            : activeSpawnCount === 1
              ? `DUELIST-01`
              : `${arch.toUpperCase()}-${String(i + 1).padStart(2, '0')}`;
        const npc: NpcEntity = {
          id,
          callsign,
          archetype: arch,
          x: nx,
          y: ny,
          z: nz,
          vx: 0,
          vz: 0,
          rotY: 0,
          hp: maxHp,
          maxHp,
          shield: maxShield,
          maxShield,
          state: 'patrol',
          windupTimer: 0.45,
          attackCooldown: (1.2 + (i % 4) * 0.45) * roster.fireCooldownMultiplier,
          koTimer: 0,
          hitFlashTimer: 0,
          strafeSign: i % 2 === 0 ? 1 : -1,
        };
        npcs.push(npc);

        const built = buildOperatorCharacterGroup(arch, contactShadowTex);
        built.root.position.set(nx, ny, nz);
        npcsGroup.add(built.root);
        npcMeshMap.set(id, built);
      }

      // Spawn exact ally count for 2v2 (1 ally), 3v3 (2 allies), 4v4 (3 allies), 1v1 (0 allies)
      const desiredAllies = roster.allyCount;
      for (let a = 0; a < desiredAllies; a++) {
        const partyFriend = p.partyMembers[a];
        const allyCallsign = partyFriend
          ? partyFriend.username
          : `WINGMAN-0${a + 1}`;
        const allySkinId: SkinId = partyFriend?.skinId || 'alpine-ghost';
        const skinDef = OPERATOR_SKINS[allySkinId] || OPERATOR_SKINS['alpine-ghost'];
        const ax = playerState.x + (a % 2 === 0 ? -1 : 1) * (4.2 + a * 2.2);
        const az = playerState.z - 3.5 - a * 1.8;
        const ay = getTerrainHeight(ax, az, p.mapId);
        const allyId = `ally-w${waveNum}-${a}`;

        const ally: NpcEntity = {
          id: allyId,
          callsign: allyCallsign,
          archetype: 'marksman',
          x: ax,
          y: ay,
          z: az,
          vx: 0,
          vz: 0,
          rotY: Math.PI,
          hp: 120,
          maxHp: 120,
          shield: 60,
          maxShield: 60,
          state: 'seek',
          windupTimer: 0,
          attackCooldown: 1.1 + a * 0.35,
          koTimer: 0,
          hitFlashTimer: 0,
          strafeSign: a % 2 === 0 ? 1 : -1,
        };
        allyNpcs.push(ally);

        const builtAlly = buildOperatorCharacterGroup('SQUAD', contactShadowTex, {
          primary: skinDef.primaryHex,
          secondary: skinDef.secondaryHex,
          visor: skinDef.visorHex,
        });
        builtAlly.root.position.set(ax, ay, az);
        alliesGroup.add(builtAlly.root);
        allyMeshMap.set(allyId, builtAlly);
      }
    }

    function resetSession() {
      const p = propsRef.current;
      const roster = computeTeamMatchRoster(
        p.battleMode,
        p.botHardness,
        1,
        p.partyMembers.length
      );
      const stats = computeWeaponStats(
        p.weaponId,
        {
          opticId: p.opticId,
          barrelId: p.barrelId,
          underbarrelId: p.underbarrelId,
          magId: p.magId,
        },
        p.stimBuff
      );

      playerState = {
        x: 0,
        y: getTerrainHeight(0, 10, p.mapId),
        z: 10,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: 0,
        pitch: 0,
        grounded: true,
        coyoteTimer: 0.1,
        jumpBufferTimer: 0,
        isSliding: false,
        slideTimer: 0,
        slideCooldown: 0,
        isVaulting: false,
        vaultTimer: 0,
        isClimbing: false,
        eyeHeight: 1.72,
        stamina: 100,
        movementMode: 'WALK',
      };
      p2State = {
        x: 3.6,
        y: getTerrainHeight(3.6, 10, p.mapId),
        z: 10,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: 0,
        pitch: 0,
        grounded: true,
        coyoteTimer: 0.1,
        jumpBufferTimer: 0,
        isSliding: false,
        slideTimer: 0,
        slideCooldown: 0,
        isVaulting: false,
        vaultTimer: 0,
        isClimbing: false,
        eyeHeight: 1.72,
        stamina: 100,
        movementMode: 'WALK',
      };
      p2Hp = p2MaxHp;
      p2Shield = p2MaxShield;
      p2Ammo = stats.magSize;
      p2FireCooldown = 0;
      p2Eliminations = 0;

      playerHp = playerMaxHp;
      playerShield = playerMaxShield;
      playerSalvage = roster.startingSalvage;
      currentWave = 1;
      totalWavesInMatch = roster.totalWaves;
      playerScore = 0;
      playerEliminations = 0;
      wallsConstructedCount = 0;
      currentAmmo = stats.magSize;
      reloadTimer = 0;
      fireCooldown = 0;
      abilityCooldown = 0;
      abilityActiveTimer = 0;
      stimCooldown = 0;
      stimActiveTimer = 0;
      sessionEnded = false;
      activeEnvEvent = null;
      envEventActiveTimer = 0;
      envEventCooldownTimer = 6.5;
      pendingForceEnvEvent = false;
      matchElapsedSec = 0;
      lastReplayCaptureSec = -1;
      replayFrames = [];
      replayHighlights = [];

      // Clear local built walls
      while (wallsGroup.children.length > 0) {
        wallsGroup.remove(wallsGroup.children[0]);
      }
      wallMeshMap.clear();
      localBuiltWalls = [];

      syncInfiniteChunks(playerState.x, playerState.z, p.mapId, true);
      rebuildArenaBoundaryPerimeter(p.mapId);
      spawnWaveNpcs(1);
      captureReplayFrame(true);
      publishReplayRecording();
    }

    internalRef.current.rebuildBiome = buildBiomeScene;
    internalRef.current.rebuildWeaponMesh = rebuildWeaponViewModel;
    internalRef.current.resetSession = resetSession;
    internalRef.current.syncLobbyAvatars = syncLobbyAvatars;
    internalRef.current.forceTriggerEnvironmentEvent = () => {
      pendingForceEnvEvent = true;
    };
    internalRef.current.onGameStateTransition = (nextState: GameState) => {
      const p = propsRef.current;
      if (nextState === 'playing') {
        resetSession();
        const isSplit = p.battleMode === 'coop-splitscreen';
        replayOperatorAvatar.root.visible = isSplit;
        lobbyPartyGroup.visible = false;
        npcsGroup.visible = true;
        alliesGroup.visible = true;
        remotePlayersGroup.visible = true;
        weaponRigGroup.visible = true;
        p2WeaponRigGroup.visible = isSplit;
        p2OperatorAvatar.root.visible = isSplit;
        camera.fov = 70;
        camera.updateProjectionMatrix();
        camera.position.set(
          playerState.x,
          playerState.y + playerState.eyeHeight,
          playerState.z
        );
        camera.rotation.order = 'YXZ';
        camera.rotation.set(playerState.pitch, playerState.yaw, 0);
        renderer.render(scene, camera);
      } else if (nextState === 'title') {
        weaponRigGroup.visible = false;
        p2WeaponRigGroup.visible = false;
        wallPreviewMesh.visible = false;
        p2OperatorAvatar.root.visible = false;
        weatherInstanced.visible = false;
        npcsGroup.visible = false;
        alliesGroup.visible = false;
        remotePlayersGroup.visible = false;
        lobbyPartyGroup.visible = true;
        const pedY = getTerrainHeight(0, 16, p.mapId);
        replayOperatorAvatar.root.visible = true;
        replayOperatorAvatar.root.position.set(0, pedY + 0.16, 16);
        replayOperatorAvatar.root.rotation.y = 0;
        camera.fov = 56;
        camera.updateProjectionMatrix();
        camera.position.set(0, pedY + 1.55, 20.65);
        camera.lookAt(0, pedY + 1.24, 15.8);
        renderer.render(scene, camera);
      }
    };

    buildBiomeScene(propsRef.current.mapId);
    rebuildWeaponViewModel();
    resetSession();

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Unified Input Hub (Held vs JustPressed Edge Triggers)
    const keysHeld = new Set<string>();
    const keysJustPressed = new Set<string>();
    let mouseDown = false;
    let rightMouseDown = false;
    let prevGamepadButtons: boolean[] = [];
    let lastReportedDevice: ActiveInputDevice = 'pc';
    let lastReportedGamepadId: string | null = null;

    const reportDeviceIfChanged = (device: ActiveInputDevice, gamepadId?: string | null) => {
      const normalizedGp = gamepadId ?? lastReportedGamepadId;
      if (device !== lastReportedDevice || normalizedGp !== lastReportedGamepadId) {
        lastReportedDevice = device;
        lastReportedGamepadId = normalizedGp;
        propsRef.current.onDetectedInputDevice?.(device, normalizedGp);
      }
    };

    const clearInputs = () => {
      keysHeld.clear();
      keysJustPressed.clear();
      mouseDown = false;
      rightMouseDown = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      reportDeviceIfChanged('pc');
      if (!keysHeld.has(e.code)) {
        keysJustPressed.add(e.code);
      }
      keysHeld.add(e.code);

      const p = propsRef.current;
      if (p.gameState === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        p.onStateChange('playing');
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (p.gameState === 'playing') {
          publishReplayRecording();
          document.exitPointerLock?.();
          p.onStateChange('paused');
        } else if (p.gameState === 'paused') {
          p.onStateChange('playing');
        } else if (p.gameState === 'replay') {
          p.onStateChange('title');
        }
      } else if (e.code === 'Digit1') {
        p.onSelectWallType('barricade');
      } else if (e.code === 'Digit2') {
        p.onSelectWallType('rampart');
      } else if (e.code === 'Digit3') {
        p.onSelectWallType('bastion');
      } else if (e.code === 'KeyH') {
        pendingForceEnvEvent = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeld.delete(e.code);
    };

    let lastTouchTimestamp = 0;

    const onMouseDown = (e: MouseEvent) => {
      if (Date.now() - lastTouchTimestamp > 650) {
        reportDeviceIfChanged('pc');
      }
      if (propsRef.current.gameState !== 'playing') return;
      if (e.target === renderer.domElement) {
        if (e.button === 0) mouseDown = true;
        if (e.button === 1) {
          e.preventDefault();
          keysJustPressed.add('KeyF'); // Middle mouse button quick-builds wall
        }
        if (e.button === 2) rightMouseDown = true;
        renderer.domElement.requestPointerLock?.();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) mouseDown = false;
      if (e.button === 2) rightMouseDown = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (Date.now() - lastTouchTimestamp > 650 && (Math.abs(e.movementX) > 2 || Math.abs(e.movementY) > 2)) {
        reportDeviceIfChanged('pc');
      }
      if (propsRef.current.gameState !== 'playing') return;
      if (document.pointerLockElement === renderer.domElement || mouseDown || rightMouseDown) {
        const sens = rightMouseDown ? 0.0014 : 0.0022;
        playerState.yaw -= e.movementX * sens;
        playerState.pitch = THREE.MathUtils.clamp(
          playerState.pitch - e.movementY * sens,
          -1.25,
          1.25
        );
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (propsRef.current.gameState !== 'playing') return;
      reportDeviceIfChanged('pc');
      const order: WallType[] = ['barricade', 'rampart', 'bastion'];
      const curIdx = order.indexOf(propsRef.current.selectedWallType);
      const nextIdx = (curIdx + (e.deltaY > 0 ? 1 : 2)) % order.length;
      propsRef.current.onSelectWallType(order[nextIdx]);
    };

    const onTouchStartGlobal = () => {
      lastTouchTimestamp = Date.now();
      reportDeviceIfChanged('touch');
    };

    const onGamepadConnected = (e: GamepadEvent) => {
      reportDeviceIfChanged('console', e.gamepad?.id || 'Standard Controller');
    };

    const onGamepadDisconnected = () => {
      lastReportedGamepadId = null;
      reportDeviceIfChanged('pc', null);
    };

    const onContextMenu = (e: MouseEvent) => {
      if (propsRef.current.gameState === 'playing') {
        e.preventDefault();
      }
    };

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = Math.max(1, container.clientHeight || window.innerHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStartGlobal, { passive: true });
    window.addEventListener('gamepadconnected', onGamepadConnected);
    window.addEventListener('gamepaddisconnected', onGamepadDisconnected);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('blur', clearInputs);
    window.addEventListener('resize', onResize);

    // Helper to construct wall in front of operator
    function attemptBuildWall() {
      const p = propsRef.current;
      const sinYaw = Math.sin(playerState.yaw);
      const cosYaw = Math.cos(playerState.yaw);
      const targetX = playerState.x - sinYaw * 3.6;
      const targetZ = playerState.z - cosYaw * 3.6;
      const targetY = getTerrainHeight(targetX, targetZ, p.mapId);

      const allWalls = [...localBuiltWalls, ...p.sharedWalls];
      const check = canBuildWall(playerSalvage, p.selectedWallType, allWalls, {
        x: targetX,
        z: targetZ,
      });

      if (!check.allowed) return false;

      playerSalvage -= check.cost;
      wallsConstructedCount += 1;
      playerScore += 45;
      soundEngine.playMovementAction('build');

      const blueprint = WALL_BLUEPRINTS[p.selectedWallType];
      const wallId = `wall-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const newWall: BuiltWallEntity = {
        id: wallId,
        type: p.selectedWallType,
        x: targetX,
        y: targetY,
        z: targetZ,
        rotY: playerState.yaw,
        hp: blueprint.maxHp,
        maxHp: blueprint.maxHp,
        ownerCallsign: p.callsign,
      };
      localBuiltWalls.push(newWall);
      spawnParticles(targetX, targetY + 1.0, targetZ, 14, 0x38bdf8, 5);
      recordReplayHighlight(
        'WALL_BUILT',
        `Built ${blueprint.name}`,
        blueprint.accentColor
      );
      captureReplayFrame(true);

      p.onSendMultiplayerUpdate({
        type: 'wall:build',
        id: wallId,
        wallType: p.selectedWallType,
        x: targetX,
        y: targetY,
        z: targetZ,
        rotY: playerState.yaw,
        ownerCallsign: p.callsign,
        mapId: p.mapId,
      });
      return true;
    }

    // Raycast weapon fire against NPCs
    const shootRaycaster = new THREE.Raycaster();
    function fireWeaponRound(stats: ReturnType<typeof computeWeaponStats>) {
      const p = propsRef.current;
      firedThisStep = true;
      currentAmmo = Math.max(0, currentAmmo - 1);
      fireCooldown =
        abilityActiveTimer > 0 && p.weaponId === 'vx-carbine'
          ? stats.fireIntervalSec * 0.55
          : stats.fireIntervalSec;

      soundEngine.playGunshot(stats.suppressed, p.weaponId === 'kodiak-shotgun' || p.weaponId === 'solaris-dmr');

      // Apply weapon kick & recoil
      const recoilKick =
        abilityActiveTimer > 0 && p.weaponId === 'vx-carbine' ? 0 : stats.recoil;
      playerState.pitch = Math.min(1.25, playerState.pitch + recoilKick * 0.65);
      cameraTrauma = Math.min(1, cameraTrauma + 0.16);

      // Muzzle recoil impulse on weapon rig
      weaponRigGroup.position.z = 0.06;

      const eventDmgMult = activeEnvEvent ? activeEnvEvent.damageMultiplier : 1.0;

      for (let pellet = 0; pellet < stats.pelletCount; pellet++) {
        const spreadScale = rightMouseDown ? 0.35 : playerState.isSliding ? 0.75 : 1.0;
        const spreadX = (Math.random() - 0.5) * stats.spread * spreadScale;
        const spreadY = (Math.random() - 0.5) * stats.spread * spreadScale;

        shootRaycaster.setFromCamera(new THREE.Vector2(spreadX, spreadY), camera);
        shootRaycaster.far = stats.range;

        // Check NPC hits by ray-cylinder distance for reliable responsive hit detection
        let closestNpc: NpcEntity | null = null;
        let closestDist = stats.range;
        let hitHead = false;

        for (const npc of npcs) {
          if (npc.hp <= 0 || npc.state === 'ko') continue;
          _vec3A.set(npc.x, npc.y + 1.15, npc.z);
          const rayDistSq = shootRaycaster.ray.distanceSqToPoint(_vec3A);
          const distToNpc = camera.position.distanceTo(_vec3A);
          if (rayDistSq < 0.58 && distToNpc < closestDist) {
            // Ensure ray is pointing forward toward NPC
            _vec3B.subVectors(_vec3A, camera.position).normalize();
            if (_vec3B.dot(shootRaycaster.ray.direction) > 0.7) {
              closestDist = distToNpc;
              closestNpc = npc;
              // Check if ray aimed near head height (y + 1.85)
              _vec3A.set(npc.x, npc.y + 1.85, npc.z);
              hitHead = shootRaycaster.ray.distanceSqToPoint(_vec3A) < 0.18;
            }
          }
        }

        if (closestNpc) {
          let dmg = Math.round((stats.damage + stats.bioDotDamage) * eventDmgMult);
          if (hitHead) dmg = Math.round(dmg * 1.5);
          if (abilityActiveTimer > 0 && p.weaponId === 'solaris-dmr') {
            dmg = Math.round(dmg * 1.35);
          }

          if (closestNpc.shield > 0) {
            const shieldAbsorb = Math.min(closestNpc.shield, dmg);
            closestNpc.shield -= shieldAbsorb;
            dmg -= shieldAbsorb;
          }
          closestNpc.hp = Math.max(0, closestNpc.hp - dmg);
          closestNpc.hitFlashTimer = 0.08;
          hitMarkerTimer = 0.14;

          spawnParticles(
            closestNpc.x,
            closestNpc.y + (hitHead ? 1.85 : 1.2),
            closestNpc.z,
            6,
            hitHead ? 0xf59e0b : 0x38bdf8,
            5
          );

          if (closestNpc.hp <= 0 && closestNpc.state !== 'ko') {
            closestNpc.state = 'ko';
            closestNpc.koTimer = 0.42;
            killMarkerTimer = 0.28;
            hitstopTimer = 0.045; // Sim-level hitstop on heavy kill
            playerEliminations += 1;
            playerScore += hitHead ? 150 : 100;
            playerSalvage += 18;
            if (p.battleMode === 'battle-royale') {
              brPlayersAlive = Math.max(1, brPlayersAlive - 1);
            }
            soundEngine.playHitMarker(true);
            spawnParticles(closestNpc.x, closestNpc.y + 1.2, closestNpc.z, 18, 0xf97316, 8);
            recordReplayHighlight(
              hitHead ? 'HEADSHOT' : 'ELIMINATION',
              `${hitHead ? 'Headshot' : 'Eliminated'} ${closestNpc.callsign}`,
              hitHead ? '#f59e0b' : '#ef4444'
            );
            captureReplayFrame(true);
          } else {
            soundEngine.playHitMarker(false);
          }
        } else {
          // Also check raycast hit against real remote online players in the shared sector
          for (const rop of p.remoteOperators) {
            if (rop.mapId !== p.mapId || rop.hp <= 0) continue;
            _vec3A.set(rop.x, rop.y + 1.15, rop.z);
            const rayDistSq = shootRaycaster.ray.distanceSqToPoint(_vec3A);
            const distToRop = camera.position.distanceTo(_vec3A);
            if (rayDistSq < 0.62 && distToRop < stats.range) {
              _vec3B.subVectors(_vec3A, camera.position).normalize();
              if (_vec3B.dot(shootRaycaster.ray.direction) > 0.7) {
                const dmg = Math.round(stats.damage * eventDmgMult);
                hitMarkerTimer = 0.14;
                soundEngine.playHitMarker(false);
                spawnParticles(rop.x, rop.y + 1.25, rop.z, 6, 0x38bdf8, 5);
                p.onSendMultiplayerUpdate({
                  type: 'player:hit',
                  targetId: rop.id,
                  damage: dmg,
                  attackerCallsign: p.callsign,
                });
                break;
              }
            }
          }
        }
      }

      p.onSendMultiplayerUpdate({
        type: 'player:fire',
        id: p.callsign,
        callsign: p.callsign,
        originX: Number(camera.position.x.toFixed(2)),
        originY: Number(camera.position.y.toFixed(2)),
        originZ: Number(camera.position.z.toFixed(2)),
      });
    }

    // Software-WebGL Paced Loop Helper
    let frameId = 0;
    let disposed = false;
    function afterDraw(cb: () => void) {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush?.();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const clock = new THREE.Clock();
    let lastHudSyncTime = 0;
    let lastNetSyncTime = 0;

    function tick() {
      if (disposed) return;
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      const elapsed = clock.getElapsedTime();
      const p = propsRef.current;

      // Sync built walls (local + server shared) into 3D scene
      const mergedWallsMap = new Map<string, BuiltWallEntity>();
      for (const w of p.sharedWalls) mergedWallsMap.set(w.id, w);
      for (const w of localBuiltWalls) mergedWallsMap.set(w.id, w);

      for (const [id, wall] of mergedWallsMap.entries()) {
        if (!wallMeshMap.has(id)) {
          const wg = buildDefensiveWallGroup(wall.type);
          wg.position.set(wall.x, wall.y, wall.z);
          wg.rotation.y = wall.rotY;
          wallsGroup.add(wg);
          wallMeshMap.set(id, wg);
        }
      }
      for (const [id, mesh] of wallMeshMap.entries()) {
        if (!mergedWallsMap.has(id)) {
          wallsGroup.remove(mesh);
          wallMeshMap.delete(id);
        }
      }

      // Sync remote multiplayer operators
      const activeRemoteIds = new Set<string>();
      for (const rop of p.remoteOperators) {
        if (rop.mapId !== p.mapId) continue;
        activeRemoteIds.add(rop.id);
        let entry = remoteMeshMap.get(rop.id);
        if (!entry) {
          const skinDef =
            OPERATOR_SKINS[rop.skinId as SkinId] || OPERATOR_SKINS['vanguard-obsidian'];
          entry = buildOperatorCharacterGroup('SQUAD', contactShadowTex, {
            primary: skinDef.primaryHex,
            secondary: skinDef.secondaryHex,
            visor: skinDef.visorHex,
          });
          remotePlayersGroup.add(entry.root);
          remoteMeshMap.set(rop.id, entry);
        }
        entry.root.position.lerp(_vec3A.set(rop.x, rop.y, rop.z), 1 - Math.exp(-12 * dt));
        entry.root.rotation.y = rop.rotY;
      }
      for (const [id, entry] of remoteMeshMap.entries()) {
        if (!activeRemoteIds.has(id)) {
          remotePlayersGroup.remove(entry.root);
          remoteMeshMap.delete(id);
        }
      }

      // Poll W3C Standard Gamepad API (Xbox / PlayStation DualSense / Switch Pro)
      let gpFrame: ParsedGamepadFrame = {
        moveRight: 0,
        moveForward: 0,
        lookYawDelta: 0,
        lookPitchDelta: 0,
        fireHeld: false,
        adsHeld: false,
        sprintHeld: false,
        jumpHeld: false,
        jumpJustPressed: false,
        slideJustPressed: false,
        reloadOrHarvestJustPressed: false,
        abilityJustPressed: false,
        stimJustPressed: false,
        buildJustPressed: false,
        emoteJustPressed: false,
        pauseJustPressed: false,
        wallSelectSlot: null,
        anyActiveInput: false,
        nextPressedButtons: [],
      };

      if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
        const pads = navigator.getGamepads();
        const activePad = pads ? Array.from(pads).find((pad) => pad && pad.connected) : null;
        if (activePad) {
          gpFrame = parseStandardGamepadState(
            activePad.axes,
            activePad.buttons,
            prevGamepadButtons
          );
          prevGamepadButtons = gpFrame.nextPressedButtons;
          if (gpFrame.anyActiveInput) {
            reportDeviceIfChanged('console', activePad.id || 'Console Controller');
          }
        }
      }

      const touch = p.touchInputRef.current;
      const anyTouchActive =
        Math.abs(touch.moveX) > 0.01 ||
        Math.abs(touch.moveY) > 0.01 ||
        Math.abs(touch.lookDeltaX) > 0.01 ||
        Math.abs(touch.lookDeltaY) > 0.01 ||
        touch.fireHeld ||
        touch.adsHeld ||
        touch.jumpJustPressed ||
        touch.slideJustPressed ||
        touch.reloadJustPressed ||
        touch.abilityJustPressed ||
        touch.buildJustPressed ||
        touch.harvestJustPressed ||
        touch.stimJustPressed ||
        touch.emoteJustPressed;
      if (anyTouchActive) {
        reportDeviceIfChanged('touch');
      }

      // Handle Gamepad Start / A button in Title, Paused, or GameOver states
      if (p.gameState === 'title' && (gpFrame.pauseJustPressed || gpFrame.jumpJustPressed)) {
        p.onStateChange('playing');
      } else if (p.gameState === 'paused' && gpFrame.pauseJustPressed) {
        p.onStateChange('playing');
      } else if (p.gameState === 'playing' && gpFrame.pauseJustPressed) {
        publishReplayRecording();
        document.exitPointerLock?.();
        p.onStateChange('paused');
      }

      if (gpFrame.wallSelectSlot === 1) p.onSelectWallType('barricade');
      else if (gpFrame.wallSelectSlot === 2) p.onSelectWallType('rampart');
      else if (gpFrame.wallSelectSlot === 3) p.onSelectWallType('bastion');

      // Stage 1: Title Screen 3D Operator & Party Centerpiece Showcase
      if (p.gameState === 'title') {
        weaponRigGroup.visible = false;
        p2WeaponRigGroup.visible = false;
        wallPreviewMesh.visible = false;
        p2OperatorAvatar.root.visible = false;
        weatherInstanced.visible = false;
        npcsGroup.visible = false;
        alliesGroup.visible = false;
        remotePlayersGroup.visible = false;
        lobbyPartyGroup.visible = true;

        const pedY = getTerrainHeight(0, 16, p.mapId);
        replayOperatorAvatar.root.visible = true;
        replayOperatorAvatar.root.position.set(
          0,
          pedY + 0.16 + Math.sin(elapsed * 2.1) * 0.025,
          16
        );
        replayOperatorAvatar.root.rotation.y = Math.sin(elapsed * 0.65) * 0.32;

        const camSwayX = Math.sin(elapsed * 0.28) * 0.65;
        const targetCamX = camSwayX;
        const targetCamZ = 20.65;
        const targetCamY = pedY + 1.55;
        camera.fov = 56;
        camera.updateProjectionMatrix();
        camera.position.set(targetCamX, targetCamY, targetCamZ);
        camera.lookAt(0, pedY + 1.24, 15.8);
      } else if (p.gameState === 'replay') {
        // ===================================================================
        // STAGE 5: 3D TACTICAL MATCH REPLAY ENGINE (FPV / ORBIT / DRONE CAM)
        // ===================================================================
        wallPreviewMesh.visible = false;
        lobbyPartyGroup.visible = false;
        npcsGroup.visible = true;
        alliesGroup.visible = false;
        remotePlayersGroup.visible = false;
        p2OperatorAvatar.root.visible = false;
        p2WeaponRigGroup.visible = false;
        const activeRec = p.replayRecording;
        const frameSnap = activeRec
          ? interpolateReplayFrames(activeRec, p.replayTimeSec)
          : null;

        if (frameSnap) {
          // Sync recorded NPCs
          for (const recNpc of frameSnap.npcs) {
            const meshEntry = npcMeshMap.get(recNpc.id);
            if (!meshEntry) continue;
            meshEntry.root.visible = recNpc.hp > 0 || recNpc.state === 'ko';
            meshEntry.root.position.set(recNpc.x, recNpc.y, recNpc.z);
            meshEntry.root.rotation.y = recNpc.rotY;
            meshEntry.root.rotation.x = recNpc.hp <= 0 ? -Math.PI / 2 : 0;
            meshEntry.telegraphRing.visible = recNpc.state === 'windup' && recNpc.hp > 0;
          }

          if (p.replayCameraMode === 'fpv') {
            replayOperatorAvatar.root.visible = false;
            weaponRigGroup.visible = true;
            camera.position.set(
              frameSnap.playerX,
              frameSnap.playerY + frameSnap.eyeHeight,
              frameSnap.playerZ
            );
            camera.rotation.order = 'YXZ';
            camera.rotation.y = frameSnap.playerYaw;
            camera.rotation.x = frameSnap.playerPitch;
            camera.rotation.z = 0;
          } else if (p.replayCameraMode === 'orbit') {
            weaponRigGroup.visible = false;
            replayOperatorAvatar.root.visible = true;
            replayOperatorAvatar.root.position.set(
              frameSnap.playerX,
              frameSnap.playerY,
              frameSnap.playerZ
            );
            replayOperatorAvatar.root.rotation.y = frameSnap.playerYaw + Math.PI;
            const orbitYaw = frameSnap.playerYaw + Math.sin(elapsed * 0.45) * 0.4;
            const camX = frameSnap.playerX + Math.sin(orbitYaw) * 6.8;
            const camZ = frameSnap.playerZ + Math.cos(orbitYaw) * 6.8;
            const camY = frameSnap.playerY + 3.4;
            camera.position.lerp(_vec3A.set(camX, camY, camZ), 1 - Math.exp(-10 * dt));
            camera.lookAt(
              frameSnap.playerX,
              frameSnap.playerY + 1.4,
              frameSnap.playerZ
            );
          } else {
            // Drone Overhead Tactical Overview
            weaponRigGroup.visible = false;
            replayOperatorAvatar.root.visible = true;
            replayOperatorAvatar.root.position.set(
              frameSnap.playerX,
              frameSnap.playerY,
              frameSnap.playerZ
            );
            replayOperatorAvatar.root.rotation.y = frameSnap.playerYaw + Math.PI;
            camera.position.lerp(
              _vec3A.set(frameSnap.playerX * 0.6, frameSnap.playerY + 22, frameSnap.playerZ + 18),
              1 - Math.exp(-6 * dt)
            );
            camera.lookAt(frameSnap.playerX, frameSnap.playerY + 1.0, frameSnap.playerZ - 6);
          }

          if (frameSnap.firedShot) {
            spawnParticles(
              frameSnap.playerX - Math.sin(frameSnap.playerYaw) * 1.4,
              frameSnap.playerY + 1.45,
              frameSnap.playerZ - Math.cos(frameSnap.playerYaw) * 1.4,
              2,
              0xf59e0b,
              4
            );
          }
        }
      } else if (p.gameState === 'playing') {
        const isSplitScreen = p.battleMode === 'coop-splitscreen';
        replayOperatorAvatar.root.visible = isSplitScreen;
        lobbyPartyGroup.visible = false;
        npcsGroup.visible = true;
        alliesGroup.visible = true;
        remotePlayersGroup.visible = true;
        weaponRigGroup.visible = true;
        p2WeaponRigGroup.visible = isSplitScreen;
        p2OperatorAvatar.root.visible = isSplitScreen;

        const isAdsActive = rightMouseDown || touch.adsHeld || gpFrame.adsHeld;
        let isFireActive = mouseDown || touch.fireHeld || gpFrame.fireHeld;

        // Apply Touch Look Deltas & Console Right-Stick Look Rotation
        if (Math.abs(touch.lookDeltaX) > 0 || Math.abs(touch.lookDeltaY) > 0) {
          const touchSens = isAdsActive ? 0.0028 : 0.0044;
          playerState.yaw -= touch.lookDeltaX * touchSens;
          playerState.pitch = THREE.MathUtils.clamp(
            playerState.pitch - touch.lookDeltaY * touchSens,
            -1.25,
            1.25
          );
          touch.lookDeltaX = 0;
          touch.lookDeltaY = 0;
        }

        if (Math.abs(gpFrame.lookYawDelta) > 0 || Math.abs(gpFrame.lookPitchDelta) > 0) {
          const gpTurnSpeed = isAdsActive ? 1.55 : 2.65;
          playerState.yaw -= gpFrame.lookYawDelta * gpTurnSpeed * dt;
          playerState.pitch = THREE.MathUtils.clamp(
            playerState.pitch + gpFrame.lookPitchDelta * gpTurnSpeed * 0.8 * dt,
            -1.25,
            1.25
          );
        }

        const stats = computeWeaponStats(
          p.weaponId,
          {
            opticId: p.opticId,
            barrelId: p.barrelId,
            underbarrelId: p.underbarrelId,
            magId: p.magId,
          },
          stimActiveTimer > 0
            ? {
                recoilReduction: p.stimBuff.recoilReduction + 0.15,
                damageBonus: p.stimBuff.damageBonus + 0.1,
              }
            : p.stimBuff
        );

        // Evaluate Smart Control Target Magnetism & Optional Auto-Fire
        if (p.smartControl.enabled && p.smartControl.aimAssistMagnetism) {
          const assist = evaluateSmartAimAssist(
            playerState,
            npcs,
            stats.range,
            dt,
            isAdsActive ? 8.5 : 5.5
          );
          playerState.yaw = assist.nextYaw;
          playerState.pitch = assist.nextPitch;
          smartTargetLocked = assist.lockedTargetId !== null;
          if (
            p.smartControl.autoFireOnLock &&
            assist.shouldAutoFire &&
            !buildModeActive
          ) {
            isFireActive = true;
          }
        } else {
          smartTargetLocked = false;
        }

        // Smooth ADS FOV damping
        const targetFov = isAdsActive
          ? stats.adsFov
          : playerState.movementMode === 'SPRINT' || playerState.movementMode === 'SLIDE'
            ? 76
            : 70;
        if (Math.abs(camera.fov - targetFov) > 0.1) {
          camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 12, dt);
          camera.updateProjectionMatrix();
        }

        // Update timers that run during hitstop
        hitstopTimer = Math.max(0, hitstopTimer - dt);
        hitMarkerTimer = Math.max(0, hitMarkerTimer - dt);
        killMarkerTimer = Math.max(0, killMarkerTimer - dt);
        damageVignette = Math.max(0, damageVignette - dt * 1.4);
        cameraTrauma = Math.max(0, cameraTrauma - dt * 2.2);
        emoteBannerTimer = Math.max(0, emoteBannerTimer - dt);
        if (emoteBannerTimer <= 0) activeEmoteBanner = null;

        // One-shot Edge Trigger Actions (Keyboard + Touch + Console Gamepad)
        if (keysJustPressed.has('KeyB')) {
          buildModeActive = !buildModeActive;
        }
        if (
          (keysJustPressed.has('KeyR') ||
            touch.reloadJustPressed ||
            gpFrame.reloadOrHarvestJustPressed) &&
          reloadTimer <= 0 &&
          currentAmmo < stats.magSize
        ) {
          reloadTimer = stats.reloadSec;
        }
        // Tactical Weapon Ability [Q / Y / Touch Ability]
        if (
          (keysJustPressed.has('KeyQ') ||
            touch.abilityJustPressed ||
            gpFrame.abilityJustPressed) &&
          abilityCooldown <= 0
        ) {
          const wep = WEAPONS[p.weaponId];
          const cdMult = activeEnvEvent?.id === 'aurora-emp-surge' ? 0.6 : 1.0;
          abilityCooldown = wep.abilityCooldownSec * cdMult;
          abilityActiveTimer = 5.0;
          soundEngine.playMovementAction('stim');
          recordReplayHighlight('ABILITY', `Activated ${wep.abilityName}`, '#38bdf8');

          if (p.weaponId === 'kodiak-shotgun') {
            // Concussive Shockwave
            for (const npc of npcs) {
              const d = Math.hypot(npc.x - playerState.x, npc.z - playerState.z);
              if (d < 14 && npc.hp > 0) {
                npc.shield = 0;
                npc.hp = Math.max(0, npc.hp - 55);
                npc.hitFlashTimer = 0.15;
              }
            }
          } else if (p.weaponId === 'aegis-smg') {
            // Kinetic Phase Dash
            const sinYaw = Math.sin(playerState.yaw);
            const cosYaw = Math.cos(playerState.yaw);
            playerState.vx = -sinYaw * 18;
            playerState.vz = -cosYaw * 18;
            playerState.stamina = 100;
            currentAmmo = stats.magSize;
          } else if (p.weaponId === 'helix-bio-rifle') {
            playerHp = Math.min(playerMaxHp, playerHp + 45);
          }
        }
        // Bio-Stimulant Injector [G / LB / Touch Stim]
        if (
          (keysJustPressed.has('KeyG') || touch.stimJustPressed || gpFrame.stimJustPressed) &&
          stimCooldown <= 0
        ) {
          stimCooldown = 14;
          stimActiveTimer = 7.5;
          playerHp = Math.min(playerMaxHp, playerHp + 25);
          soundEngine.playMovementAction('stim');
        }
        // Emote Trigger [V / D-Pad Down / Touch Emote]
        if (keysJustPressed.has('KeyV') || touch.emoteJustPressed || gpFrame.emoteJustPressed) {
          activeEmoteBanner = `${p.callsign} [${p.emoteId.toUpperCase()}]`;
          emoteBannerTimer = 3.8;
          p.onSendMultiplayerUpdate({
            type: 'player:emote',
            id: p.callsign,
            emoteId: p.emoteId,
          });
        }

        // Simulation step (paused briefly during heavy-hit hitstop)
        const simDt = hitstopTimer > 0 ? 0 : dt;

        if (simDt > 0) {
          matchElapsedSec += simDt;
          fireCooldown = Math.max(0, fireCooldown - simDt);
          abilityCooldown = Math.max(0, abilityCooldown - simDt);
          abilityActiveTimer = Math.max(0, abilityActiveTimer - simDt);
          stimCooldown = Math.max(0, stimCooldown - simDt);
          stimActiveTimer = Math.max(0, stimActiveTimer - simDt);

          // Step Dynamic Environment Event Lifecycle
          const envStep = stepDynamicEnvironmentEventState(
            p.mapId,
            envEventActiveTimer,
            envEventCooldownTimer,
            simDt,
            pendingForceEnvEvent
          );
          pendingForceEnvEvent = false;
          activeEnvEvent = envStep.activeEvent;
          envEventActiveTimer = envStep.nextActiveTimer;
          envEventCooldownTimer = envStep.nextCooldownTimer;

          const biome = BIOMES[p.mapId] || BIOMES['alpine-outpost'];
          if (envStep.justTriggered && activeEnvEvent) {
            soundEngine.playTelegraphAlert();
            cameraTrauma = Math.min(1, cameraTrauma + 0.22);
            recordReplayHighlight(
              'ENV_EVENT',
              activeEnvEvent.name,
              activeEnvEvent.accentColor
            );
            captureReplayFrame(true);

            if (activeEnvEvent.disruptEnemyShields) {
              for (const npc of npcs) {
                if (npc.hp > 0 && npc.shield > 0) {
                  npc.shield = 0;
                  npc.hitFlashTimer = 0.2;
                  spawnParticles(npc.x, npc.y + 1.4, npc.z, 8, 0x22d3ee, 6);
                }
              }
            }
          }

          // Smoothly blend biome fog & sunlight with active Weather Mode & Dynamic Environment Event
          if (scene.fog instanceof THREE.FogExp2) {
            const weatherFogMult =
              p.weatherMode === 'storm-squall'
                ? 1.58
                : p.weatherMode === 'mist-veil'
                  ? 1.42
                  : 1.24;
            const baseFog = Math.max(0.014, biome.fogDensity * weatherFogMult);
            const targetFogDensity = activeEnvEvent
              ? baseFog * activeEnvEvent.fogDensityMult
              : baseFog;
            scene.fog.density = THREE.MathUtils.damp(
              scene.fog.density,
              targetFogDensity,
              4,
              simDt
            );
            _color.setHex(activeEnvEvent ? activeEnvEvent.fogHex : biome.fogHex);
            scene.fog.color.lerp(_color, 1 - Math.exp(-4 * simDt));
          }
          const targetSunInt = activeEnvEvent
            ? biome.sunIntensity * activeEnvEvent.sunIntensityMult
            : biome.sunIntensity * (p.weatherMode === 'storm-squall' ? 0.78 : 0.92);
          sunLight.intensity = THREE.MathUtils.damp(
            sunLight.intensity,
            targetSunInt,
            4,
            simDt
          );

          // Update 3D Weather Particle System when an Environment Event is active
          weatherInstanced.visible = Boolean(activeEnvEvent);
          if (activeEnvEvent) {
            _color.setHex(activeEnvEvent.particleHex);
            for (let wIdx = 0; wIdx < WEATHER_CAP; wIdx++) {
              const wp = weatherPool[wIdx];
              const wy =
                ((wp.offsetY - elapsed * wp.fallSpeed) % 14 + 14) % 14;
              const wx =
                playerState.x +
                wp.offsetX +
                Math.sin(elapsed * 1.8 + wIdx) * 1.5;
              const wz =
                playerState.z +
                wp.offsetZ +
                Math.cos(elapsed * 1.6 + wIdx) * 1.5;
              _dummyObj.position.set(wx, playerState.y + wy, wz);
              _dummyObj.rotation.set(elapsed * 2, elapsed * 1.5, 0);
              const s = 0.75 + (wIdx % 3) * 0.25;
              _dummyObj.scale.set(s, s, s);
              _dummyObj.updateMatrix();
              weatherInstanced.setMatrixAt(wIdx, _dummyObj.matrix);
              weatherInstanced.setColorAt(wIdx, _color);
            }
            weatherInstanced.instanceMatrix.needsUpdate = true;
            if (weatherInstanced.instanceColor) {
              weatherInstanced.instanceColor.needsUpdate = true;
            }
          }

          // Bio-Stimulant + Bastion Wall + Dynamic Environment Event regeneration
          const eventHpRegen = activeEnvEvent ? activeEnvEvent.hpRegenBonus : 0;
          const eventShieldRegen = activeEnvEvent ? activeEnvEvent.shieldRegenBonus : 0;
          const regenRate =
            (stimActiveTimer > 0 ? p.stimBuff.regenPerSec * 1.8 : p.stimBuff.regenPerSec * 0.4) +
            1.5 +
            eventHpRegen;
          playerHp = Math.min(playerMaxHp, playerHp + regenRate * simDt * 0.35);
          playerShield = Math.min(
            playerMaxShield,
            playerShield + (2.5 + eventShieldRegen) * simDt
          );

          if (reloadTimer > 0) {
            reloadTimer -= simDt;
            if (reloadTimer <= 0) {
              currentAmmo = stats.magSize;
            }
          }

          // Combine static obstacles and built walls for movement collision/vaulting/climbing
          const allObstacles: ObstacleBox[] = [...staticObstacles];
          for (const w of mergedWallsMap.values()) {
            const bp = WALL_BLUEPRINTS[w.type];
            allObstacles.push({
              id: w.id,
              x: w.x,
              y: w.y,
              z: w.z,
              width: bp.width,
              height: bp.height,
              depth: bp.depth,
              climbable: w.type !== 'barricade',
              vaultable: w.type === 'barricade',
            });
          }

          // When in Split-Screen Co-Op, Arrow keys control Player 2; otherwise WASD + Arrows control P1
          const kbForward = isSplitScreen
            ? (keysHeld.has('KeyW') ? 1 : 0) - (keysHeld.has('KeyS') ? 1 : 0)
            : (keysHeld.has('KeyW') || keysHeld.has('ArrowUp') ? 1 : 0) -
              (keysHeld.has('KeyS') || keysHeld.has('ArrowDown') ? 1 : 0);
          const kbRight = isSplitScreen
            ? (keysHeld.has('KeyD') ? 1 : 0) - (keysHeld.has('KeyA') ? 1 : 0)
            : (keysHeld.has('KeyD') || keysHeld.has('ArrowRight') ? 1 : 0) -
              (keysHeld.has('KeyA') || keysHeld.has('ArrowLeft') ? 1 : 0);

          const forwardInput = THREE.MathUtils.clamp(
            kbForward + touch.moveY + gpFrame.moveForward,
            -1,
            1
          );
          const rightInput = THREE.MathUtils.clamp(
            kbRight + touch.moveX + gpFrame.moveRight,
            -1,
            1
          );

          const smartAutoSprint =
            p.smartControl.enabled &&
            p.smartControl.autoSprintAndParkour &&
            forwardInput > 0.78;
          const eventSpeedMult = activeEnvEvent ? activeEnvEvent.speedMultiplier : 1.0;
          const eventJumpMult = activeEnvEvent ? activeEnvEvent.jumpMultiplier : 1.0;

          const activeRoster = computeTeamMatchRoster(
            p.battleMode,
            p.botHardness,
            currentWave,
            p.partyMembers.length
          );
          const prevMode = playerState.movementMode;
          playerState = evaluateMovementPhysics(
            playerState,
            {
              forward: forwardInput,
              right: rightInput,
              sprintHeld:
                keysHeld.has('ShiftLeft') ||
                keysHeld.has('ShiftRight') ||
                touch.sprintHeld ||
                gpFrame.sprintHeld ||
                smartAutoSprint,
              slideJustPressed:
                keysJustPressed.has('KeyC') ||
                keysJustPressed.has('ControlLeft') ||
                touch.slideJustPressed ||
                gpFrame.slideJustPressed,
              jumpJustPressed:
                keysJustPressed.has('Space') ||
                touch.jumpJustPressed ||
                gpFrame.jumpJustPressed,
              jumpHeld:
                keysHeld.has('Space') || touch.jumpHeld || gpFrame.jumpHeld,
              speedMultiplier:
                (stimActiveTimer > 0
                  ? p.stimBuff.speedMultiplier * 1.12
                  : p.stimBuff.speedMultiplier) * eventSpeedMult,
              jumpMultiplier: eventJumpMult,
              smartParkour:
                p.smartControl.enabled && p.smartControl.autoSprintAndParkour,
              arenaRadius: activeRoster.useChunkStreaming
                ? undefined
                : activeRoster.arenaRadius,
            },
            simDt,
            allObstacles,
            p.mapId
          );

          // Dynamically stream infinite 64m x 64m chunks when in open-world modes
          syncInfiniteChunks(playerState.x, playerState.z, p.mapId, false);

          if (playerState.movementMode !== prevMode) {
            if (playerState.movementMode === 'SLIDE') soundEngine.playMovementAction('slide');
            else if (playerState.movementMode === 'VAULT') soundEngine.playMovementAction('vault');
            else if (playerState.movementMode === 'CLIMB') soundEngine.playMovementAction('climb');
          }

          // Step Split-Screen Player 2 (Arrow keys + IJKL / Enter or Smart Co-Op Wingman Assist)
          if (isSplitScreen) {
            p2FireCooldown = Math.max(0, p2FireCooldown - simDt);
            p2Hp = Math.min(p2MaxHp, p2Hp + 1.8 * simDt);
            p2Shield = Math.min(p2MaxShield, p2Shield + 2.5 * simDt);

            const p2ManualFwd =
              (keysHeld.has('ArrowUp') ? 1 : 0) - (keysHeld.has('ArrowDown') ? 1 : 0);
            const p2ManualRight =
              (keysHeld.has('ArrowRight') ? 1 : 0) - (keysHeld.has('ArrowLeft') ? 1 : 0);
            const p2LookYaw =
              (keysHeld.has('KeyJ') ? 1 : 0) - (keysHeld.has('KeyL') ? 1 : 0);
            const p2LookPitch =
              (keysHeld.has('KeyI') ? 1 : 0) - (keysHeld.has('KeyK') ? 1 : 0);

            if (p2LookYaw !== 0 || p2LookPitch !== 0) {
              p2State.yaw += p2LookYaw * 2.1 * simDt;
              p2State.pitch = THREE.MathUtils.clamp(
                p2State.pitch + p2LookPitch * 1.4 * simDt,
                -1.1,
                1.1
              );
            }

            // Smart Co-Op Assist when P2 isn't manually steering
            const p2Assist = evaluateSmartAimAssist(p2State, npcs, stats.range, simDt, 6.5);
            if (p2LookYaw === 0 && p2LookPitch === 0) {
              p2State.yaw = p2Assist.nextYaw;
              p2State.pitch = p2Assist.nextPitch;
            }

            const p2AutoFwd =
              p2ManualFwd !== 0
                ? p2ManualFwd
                : Math.hypot(p2State.x - playerState.x, p2State.z - playerState.z) > 9
                  ? 0.65
                  : Math.sin(elapsed * 0.9) * 0.35;
            const p2AutoRight =
              p2ManualRight !== 0 ? p2ManualRight : Math.cos(elapsed * 1.1) * 0.45;

            p2State = evaluateMovementPhysics(
              p2State,
              {
                forward: p2AutoFwd,
                right: p2AutoRight,
                sprintHeld: Math.abs(p2AutoFwd) > 0.75,
                slideJustPressed: keysJustPressed.has('Slash'),
                jumpJustPressed: keysJustPressed.has('ShiftRight'),
                jumpHeld: keysHeld.has('ShiftRight'),
                speedMultiplier: eventSpeedMult,
                jumpMultiplier: eventJumpMult,
                smartParkour: true,
              },
              simDt,
              allObstacles,
              p.mapId
            );

            // P2 weapon fire (Enter / Numpad0 or auto-fire when locked onto target)
            const p2WantsFire =
              keysHeld.has('Enter') ||
              keysHeld.has('Numpad0') ||
              (p2Assist.shouldAutoFire && p2Assist.lockedTargetId !== null);
            if (p2WantsFire && p2FireCooldown <= 0) {
              p2FireCooldown = stats.fireIntervalSec * 1.35;
              p2Ammo = p2Ammo > 1 ? p2Ammo - 1 : stats.magSize;
              p2WeaponRigGroup.position.z = 0.05;
              const targetNpc = npcs.find(
                (n) => n.id === p2Assist.lockedTargetId && n.hp > 0
              );
              if (targetNpc) {
                const p2Dmg = Math.round(stats.damage * 0.75);
                if (targetNpc.shield > 0) {
                  const sa = Math.min(targetNpc.shield, p2Dmg);
                  targetNpc.shield -= sa;
                } else {
                  targetNpc.hp = Math.max(0, targetNpc.hp - p2Dmg);
                }
                targetNpc.hitFlashTimer = 0.08;
                spawnParticles(targetNpc.x, targetNpc.y + 1.2, targetNpc.z, 4, 0x38bdf8, 4);
                if (targetNpc.hp <= 0 && targetNpc.state !== 'ko') {
                  targetNpc.state = 'ko';
                  targetNpc.koTimer = 0.42;
                  p2Eliminations += 1;
                  playerEliminations += 1;
                  playerScore += 100;
                }
              }
            }
          }

          // Harvest Salvage Crates (auto-collect within 3.2m with Smart Controls or press E / X / Loot within 4.5m)
          const salvageBonusMult = activeEnvEvent?.id === 'bio-spore-bloom' ? 1.25 : 1.0;
          const autoHarvestRadius = p.smartControl.enabled ? 3.4 : 2.6;
          for (const node of salvageNodes) {
            const crateMesh = crateMeshMap.get(node.id);
            if (node.cooldown > 0) {
              node.cooldown = Math.max(0, node.cooldown - simDt);
              if (crateMesh) crateMesh.visible = node.cooldown <= 0;
              continue;
            }
            const dist = Math.hypot(node.x - playerState.x, node.z - playerState.z);
            if (
              dist < autoHarvestRadius ||
              (dist < 4.5 &&
                (keysJustPressed.has('KeyE') ||
                  touch.harvestJustPressed ||
                  gpFrame.reloadOrHarvestJustPressed))
            ) {
              playerSalvage += Math.round(node.amount * salvageBonusMult);
              playerScore += 25;
              node.cooldown = 14;
              if (crateMesh) crateMesh.visible = false;
              soundEngine.playMovementAction('pickup');
              spawnParticles(node.x, node.y + 0.6, node.z, 10, 0xf59e0b, 4);
            }
          }

          // Wall Building preview & execution
          const sinYaw = Math.sin(playerState.yaw);
          const cosYaw = Math.cos(playerState.yaw);
          const previewX = playerState.x - sinYaw * 3.6;
          const previewZ = playerState.z - cosYaw * 3.6;
          const previewY = getTerrainHeight(previewX, previewZ, p.mapId);
          const bp = WALL_BLUEPRINTS[p.selectedWallType];

          wallPreviewMesh.visible = buildModeActive;
          if (buildModeActive) {
            wallPreviewMesh.position.set(previewX, previewY + bp.height * 0.5, previewZ);
            wallPreviewMesh.rotation.y = playerState.yaw;
            wallPreviewMesh.scale.set(bp.width / 3.4, bp.height / 1.45, bp.depth / 0.55);
          }

          if (
            (buildModeActive && isFireActive && fireCooldown <= 0) ||
            keysJustPressed.has('KeyF') ||
            touch.buildJustPressed ||
            gpFrame.buildJustPressed
          ) {
            if (attemptBuildWall()) {
              fireCooldown = 0.35;
              buildModeActive = false;
              wallPreviewMesh.visible = false;
            }
          } else if (isFireActive && fireCooldown <= 0 && reloadTimer <= 0) {
            if (currentAmmo > 0) {
              fireWeaponRound(stats);
            } else {
              reloadTimer = stats.reloadSec;
            }
          }

          // Step Friendly AI / Party Squadmates (for 2v2, 3v3, 4v4)
          for (const ally of allyNpcs) {
            const allyMesh = allyMeshMap.get(ally.id);
            if (!allyMesh || ally.hp <= 0) continue;
            ally.attackCooldown = Math.max(0, ally.attackCooldown - simDt);

            // Find closest alive enemy
            let targetEnemy: NpcEntity | null = null;
            let bestDist = 999;
            for (const enemy of npcs) {
              if (enemy.hp <= 0 || enemy.state === 'ko') continue;
              const d = Math.hypot(enemy.x - ally.x, enemy.z - ally.z);
              if (d < bestDist) {
                bestDist = d;
                targetEnemy = enemy;
              }
            }

            if (targetEnemy) {
              const dx = targetEnemy.x - ally.x;
              const dz = targetEnemy.z - ally.z;
              ally.rotY = Math.atan2(dx, dz);
              const moveSpeed = 3.8;
              if (bestDist > 18) {
                ally.x += (dx / bestDist) * moveSpeed * simDt;
                ally.z += (dz / bestDist) * moveSpeed * simDt;
              } else {
                const perpX = (-dz / Math.max(1, bestDist)) * ally.strafeSign;
                const perpZ = (dx / Math.max(1, bestDist)) * ally.strafeSign;
                ally.x += perpX * 2.4 * simDt;
                ally.z += perpZ * 2.4 * simDt;
              }
              ally.y = getTerrainHeight(ally.x, ally.z, p.mapId);
              allyMesh.root.position.set(ally.x, ally.y, ally.z);
              allyMesh.root.rotation.y = ally.rotY;

              if (ally.attackCooldown <= 0 && bestDist < 42) {
                ally.attackCooldown = 1.45 + Math.random() * 0.6;
                const allyDmg = 18;
                if (targetEnemy.shield > 0) {
                  targetEnemy.shield = Math.max(0, targetEnemy.shield - allyDmg);
                } else {
                  targetEnemy.hp = Math.max(0, targetEnemy.hp - allyDmg);
                }
                targetEnemy.hitFlashTimer = 0.07;
                spawnParticles(targetEnemy.x, targetEnemy.y + 1.2, targetEnemy.z, 4, 0x38bdf8, 4);
                if (targetEnemy.hp <= 0 && targetEnemy.state !== 'ko') {
                  targetEnemy.state = 'ko';
                  targetEnemy.koTimer = 0.42;
                  playerScore += 65;
                  playerEliminations += 1;
                }
              }
            }
          }

          // Step Enemy AI NPCs with 25-Block Discovery Zone, Bot Hardness Scaling & Crowd Attack Token Pool
          const roster = computeTeamMatchRoster(
            p.battleMode,
            p.botHardness,
            currentWave,
            p.partyMembers.length
          );
          let activeWindups = npcs.filter((n) => n.state === 'windup' && n.hp > 0).length;

          // In 100-Player Battle Royale, simulate distant sector skirmishes & replenish active bots from reserve pool
          if (p.battleMode === 'battle-royale' && brPlayersAlive > 1) {
            brSimElimTimer -= simDt;
            if (brSimElimTimer <= 0 && brReserveBots > 0) {
              brSimElimTimer = 3.2 + Math.random() * 2.4;
              brReserveBots = Math.max(0, brReserveBots - 1);
              brPlayersAlive = Math.max(2, brPlayersAlive - 1);
            }
          }

          for (const npc of npcs) {
            const meshEntry = npcMeshMap.get(npc.id);
            if (!meshEntry) continue;

            if (npc.state === 'ko') {
              npc.koTimer -= simDt;
              meshEntry.root.rotation.x = THREE.MathUtils.lerp(
                meshEntry.root.rotation.x,
                -Math.PI / 2,
                1 - Math.exp(-10 * simDt)
              );
              meshEntry.telegraphRing.visible = false;
              if (npc.koTimer <= 0) {
                meshEntry.root.visible = false;
              }
              continue;
            }

            npc.attackCooldown = Math.max(0, npc.attackCooldown - simDt);
            npc.hitFlashTimer = Math.max(0, npc.hitFlashTimer - simDt);

            const prevState = npc.state;
            const decision = stepAiDecisionPolicy(
              npc,
              playerState,
              simDt,
              roster.speedMultiplier,
              activeWindups < roster.maxConcurrentWindups,
              BOT_DISCOVERY_RADIUS
            );

            npc.vx = decision.nextVx;
            npc.vz = decision.nextVz;
            npc.rotY = decision.nextRotY;
            npc.state = decision.nextState;

            if (npc.state === 'windup' && prevState !== 'windup') {
              npc.windupTimer = 0.52 * roster.fireCooldownMultiplier;
              activeWindups += 1;
              soundEngine.playTelegraphAlert();
            } else if (npc.state === 'windup') {
              npc.windupTimer -= simDt;
            }

            // Move NPC and check collision with built walls
            let nextNpcX = npc.x + npc.vx * simDt;
            let nextNpcZ = npc.z + npc.vz * simDt;
            let blockedByWall: BuiltWallEntity | null = null;

            for (const w of mergedWallsMap.values()) {
              const dWall = Math.hypot(nextNpcX - w.x, nextNpcZ - w.z);
              if (dWall < 2.2) {
                blockedByWall = w;
                break;
              }
            }

            if (blockedByWall) {
              // NPC attacks the blocking defensive wall
              if (npc.attackCooldown <= 0) {
                blockedByWall.hp = Math.max(0, blockedByWall.hp - 22);
                npc.attackCooldown = 1.1 * roster.fireCooldownMultiplier;
                spawnParticles(blockedByWall.x, blockedByWall.y + 1.2, blockedByWall.z, 5, 0xf59e0b, 3);
                if (blockedByWall.hp <= 0) {
                  localBuiltWalls = localBuiltWalls.filter((lw) => lw.id !== blockedByWall!.id);
                }
              }
            } else {
              npc.x = nextNpcX;
              npc.z = nextNpcZ;
              npc.y = getTerrainHeight(npc.x, npc.z, p.mapId);
            }

            // Execute telegraphed NPC attack if not blocked by a defensive wall along line of sight
            if (decision.triggerFire) {
              npc.attackCooldown = (1.65 + Math.random() * 0.7) * roster.fireCooldownMultiplier;
              let wallIntercepted = false;
              for (const w of mergedWallsMap.values()) {
                // Check if wall lies between NPC and player
                _vec3A.set(w.x - npc.x, 0, w.z - npc.z);
                _vec3B.set(playerState.x - npc.x, 0, playerState.z - npc.z);
                const totalD = _vec3B.length();
                _vec3B.normalize();
                const proj = _vec3A.dot(_vec3B);
                if (proj > 0 && proj < totalD) {
                  const perpDistSq = _vec3A.lengthSq() - proj * proj;
                  if (perpDistSq < 3.2) {
                    wallIntercepted = true;
                    w.hp = Math.max(0, w.hp - 28);
                    spawnParticles(w.x, w.y + 1.2, w.z, 6, 0x38bdf8, 4);
                    if (w.hp <= 0) {
                      localBuiltWalls = localBuiltWalls.filter((lw) => lw.id !== w.id);
                    }
                    break;
                  }
                }
              }

              if (!wallIntercepted) {
                const rawEnemyDmg = Math.round(11 * roster.damageMultiplier);
                const shieldAbsorb = Math.min(playerShield, rawEnemyDmg);
                playerShield -= shieldAbsorb;
                const hpDmg = rawEnemyDmg - shieldAbsorb;
                playerHp = Math.max(0, playerHp - hpDmg);
                damageVignette = Math.min(1, damageVignette + 0.45);
                cameraTrauma = Math.min(1, cameraTrauma + 0.25);

                if (playerHp <= 0 && !sessionEnded) {
                  sessionEnded = true;
                  captureReplayFrame(true);
                  publishReplayRecording();
                  document.exitPointerLock?.();
                  soundEngine.playOutcomeSting(false);
                  p.onStateChange('gameover', {
                    victory: false,
                    score: playerScore,
                    eliminations: playerEliminations,
                    wallsConstructed: wallsConstructedCount,
                    waveReached: currentWave,
                    durationSec: Math.max(1, Math.round(matchElapsedSec)),
                  });
                }
              }
            }

            // Update NPC Mesh Transforms & Visual Hit Flash
            meshEntry.root.position.set(npc.x, npc.y, npc.z);
            meshEntry.root.rotation.y = npc.rotY;
            const mat = meshEntry.bodyMesh.material as THREE.MeshStandardMaterial;
            if (npc.hitFlashTimer > 0) {
              mat.emissive.setHex(0xffffff);
              mat.emissiveIntensity = 0.9;
            } else {
              mat.emissive.setHex(0x000000);
              mat.emissiveIntensity = 0;
            }
            meshEntry.telegraphRing.visible = npc.state === 'windup';
            if (meshEntry.telegraphRing.visible) {
              meshEntry.telegraphRing.lookAt(camera.position);
              const s = 0.8 + Math.sin(elapsed * 22) * 0.2;
              meshEntry.telegraphRing.scale.set(s, s, s);
            }
          }

          // Record periodic Match Replay keyframe (~8.3 Hz)
          captureReplayFrame(false);

          // Check Wave Completion / Victory
          const aliveCount = npcs.filter((n) => n.hp > 0).length;
          if (p.battleMode === 'battle-royale') {
            if (aliveCount === 0 && brReserveBots > 0) {
              spawnChunkPatrolNpcs(0, 0);
            }
            if ((brPlayersAlive <= 1 || (aliveCount === 0 && brReserveBots <= 0)) && !sessionEnded) {
              brPlayersAlive = 1;
              sessionEnded = true;
              recordReplayHighlight('WAVE_CLEAR', `Battle Royale #1 Victory`, '#10b981');
              captureReplayFrame(true);
              publishReplayRecording();
              document.exitPointerLock?.();
              soundEngine.playOutcomeSting(true);
              p.onStateChange('gameover', {
                victory: true,
                score: playerScore + 650,
                eliminations: playerEliminations,
                wallsConstructed: wallsConstructedCount,
                waveReached: 1,
                durationSec: Math.max(1, Math.round(matchElapsedSec)),
              });
            }
          } else if (aliveCount === 0 && !sessionEnded) {
            if (currentWave < totalWavesInMatch) {
              currentWave += 1;
              playerSalvage += 45;
              playerHp = Math.min(playerMaxHp, playerHp + 35);
              recordReplayHighlight('WAVE_CLEAR', `Cleared Wave ${currentWave - 1}`, '#10b981');
              spawnWaveNpcs(currentWave);
              captureReplayFrame(true);
            } else {
              sessionEnded = true;
              recordReplayHighlight('WAVE_CLEAR', `Sector Victory`, '#10b981');
              captureReplayFrame(true);
              publishReplayRecording();
              document.exitPointerLock?.();
              soundEngine.playOutcomeSting(true);
              p.onStateChange('gameover', {
                victory: true,
                score: playerScore + 300,
                eliminations: playerEliminations,
                wallsConstructed: wallsConstructedCount,
                waveReached: currentWave,
                durationSec: Math.max(1, Math.round(matchElapsedSec)),
              });
            }
          }
        }

        // Update Camera Transform + Decaying Trauma Shake + Slide Tilt
        const shakeMag = cameraTrauma * cameraTrauma * 0.035;
        const shakeYaw = (Math.random() - 0.5) * shakeMag;
        const shakePitch = (Math.random() - 0.5) * shakeMag;
        const slideRoll = playerState.isSliding ? -0.075 : 0;

        camera.position.set(
          playerState.x,
          playerState.y + playerState.eyeHeight,
          playerState.z
        );
        camera.rotation.order = 'YXZ';
        camera.rotation.y = playerState.yaw + shakeYaw;
        camera.rotation.x = playerState.pitch + shakePitch;
        camera.rotation.z = THREE.MathUtils.damp(camera.rotation.z, slideRoll, 12, dt);

        if (isSplitScreen) {
          replayOperatorAvatar.root.position.set(playerState.x, playerState.y, playerState.z);
          replayOperatorAvatar.root.rotation.y = playerState.yaw + Math.PI;

          p2OperatorAvatar.root.position.set(p2State.x, p2State.y, p2State.z);
          p2OperatorAvatar.root.rotation.y = p2State.yaw + Math.PI;

          p2Camera.position.set(p2State.x, p2State.y + p2State.eyeHeight, p2State.z);
          p2Camera.rotation.order = 'YXZ';
          p2Camera.rotation.y = p2State.yaw;
          p2Camera.rotation.x = p2State.pitch;
          p2Camera.rotation.z = 0;

          p2WeaponRigGroup.position.x = 0.26;
          p2WeaponRigGroup.position.y = -0.23;
          p2WeaponRigGroup.position.z = THREE.MathUtils.damp(
            p2WeaponRigGroup.position.z,
            -0.46,
            18,
            dt
          );
        }

        // Update First-Person Weapon Viewmodel Gait Bob & ADS Offset
        const horizSpeed = Math.hypot(playerState.vx, playerState.vz);
        const bobFreq = playerState.movementMode === 'SPRINT' ? 13 : 9;
        const bobAmp = playerState.grounded ? Math.min(0.018, horizSpeed * 0.0018) : 0;
        const targetWepX = rightMouseDown ? 0.0 : 0.26 + Math.cos(elapsed * bobFreq * 0.5) * bobAmp;
        const targetWepY =
          (rightMouseDown ? -0.155 : -0.23) +
          Math.abs(Math.sin(elapsed * bobFreq)) * bobAmp -
          (reloadTimer > 0 ? 0.16 : 0);
        const targetWepZ = rightMouseDown ? -0.34 : -0.46;

        weaponRigGroup.position.x = THREE.MathUtils.damp(
          weaponRigGroup.position.x,
          targetWepX,
          16,
          dt
        );
        weaponRigGroup.position.y = THREE.MathUtils.damp(
          weaponRigGroup.position.y,
          targetWepY,
          16,
          dt
        );
        weaponRigGroup.position.z = THREE.MathUtils.damp(
          weaponRigGroup.position.z,
          targetWepZ,
          18,
          dt
        );
      }

      // Smoothly settle newly streamed distant chunks inside the horizon rain mist
      for (const entry of loadedChunks.values()) {
        if (!entry.isInitialChunk && entry.spawnAgeSec < 0.45) {
          entry.spawnAgeSec += dt;
          const progress = Math.min(1, entry.spawnAgeSec / 0.45);
          const easeOut = 1 - Math.pow(1 - progress, 3);
          entry.group.position.y = -1.6 * (1 - easeOut);
        } else if (entry.group.position.y !== 0) {
          entry.group.position.y = 0;
        }
      }

      // Step Continuous 3D Light Rain Streaks & Ground Splash Rings around Camera
      const rainSpeedMult =
        p.weatherMode === 'storm-squall'
          ? 1.45
          : p.weatherMode === 'mist-veil'
            ? 0.65
            : 1.0;
      const rainLengthMult =
        p.weatherMode === 'storm-squall'
          ? 1.35
          : p.weatherMode === 'mist-veil'
            ? 0.55
            : 1.0;
      rainStreakMat.opacity =
        p.weatherMode === 'storm-squall'
          ? 0.56
          : p.weatherMode === 'mist-veil'
            ? 0.28
            : 0.44;

      const camX = camera.position.x;
      const camY = camera.position.y;
      const camZ = camera.position.z;

      for (let rIdx = 0; rIdx < RAIN_STREAK_CAP; rIdx++) {
        const rp = rainStreakPool[rIdx];
        const fallDist = (elapsed * rp.fallSpeed * rainSpeedMult + rp.offsetY) % 20;
        const ry = camY + 11 - fallDist;
        const rx =
          camX +
          rp.offsetX +
          Math.sin(elapsed * 0.9 + rIdx * 0.4) * 0.9 -
          fallDist * rp.slantX;
        const rz = camZ + rp.offsetZ + Math.cos(elapsed * 0.8 + rIdx * 0.3) * 0.9;
        _dummyObj.position.set(rx, ry, rz);
        _dummyObj.rotation.set(0.05, 0, rp.slantX);
        _dummyObj.scale.set(1, rainLengthMult, 1);
        _dummyObj.updateMatrix();
        rainStreakInstanced.setMatrixAt(rIdx, _dummyObj.matrix);
      }
      rainStreakInstanced.instanceMatrix.needsUpdate = true;

      for (let sIdx = 0; sIdx < RAIN_SPLASH_CAP; sIdx++) {
        const sp = rainSplashPool[sIdx];
        const cycle = (elapsed * 2.2 * rainSpeedMult + sp.phase) % 1.0;
        const sx = camX + sp.offsetX;
        const sz = camZ + sp.offsetZ;
        const sy = getTerrainHeight(sx, sz, p.mapId) + 0.03;
        const ringScale = 0.25 + cycle * 1.45;
        _dummyObj.position.set(sx, sy, sz);
        _dummyObj.rotation.set(0, 0, 0);
        _dummyObj.scale.set(ringScale, ringScale, ringScale);
        _dummyObj.updateMatrix();
        rainSplashInstanced.setMatrixAt(sIdx, _dummyObj.matrix);
      }
      rainSplashInstanced.instanceMatrix.needsUpdate = true;

      // Update Pooled InstancedMesh Particles
      for (let i = 0; i < PARTICLE_CAP; i++) {
        const pt = particlePool[i];
        if (pt.active) {
          pt.life -= dt;
          if (pt.life <= 0) {
            pt.active = false;
            _dummyObj.position.set(0, -100, 0);
            _dummyObj.scale.set(0, 0, 0);
          } else {
            pt.x += pt.vx * dt;
            pt.y += pt.vy * dt;
            pt.z += pt.vz * dt;
            pt.vy -= 14 * dt;
            const s = (pt.life / pt.maxLife) * 1.1;
            _dummyObj.position.set(pt.x, pt.y, pt.z);
            _dummyObj.scale.set(s, s, s);
            _color.setHex(pt.colorHex);
            particleInstanced.setColorAt(i, _color);
          }
        } else {
          _dummyObj.position.set(0, -100, 0);
          _dummyObj.scale.set(0, 0, 0);
        }
        _dummyObj.updateMatrix();
        particleInstanced.setMatrixAt(i, _dummyObj.matrix);
      }
      particleInstanced.instanceMatrix.needsUpdate = true;
      if (particleInstanced.instanceColor) particleInstanced.instanceColor.needsUpdate = true;

      keysJustPressed.clear();
      touch.jumpJustPressed = false;
      touch.slideJustPressed = false;
      touch.reloadJustPressed = false;
      touch.abilityJustPressed = false;
      touch.buildJustPressed = false;
      touch.harvestJustPressed = false;
      touch.stimJustPressed = false;
      touch.emoteJustPressed = false;

      // Render Full Viewport or Dual Split-Screen Co-Op Viewports
      const canvasW = container?.clientWidth || window.innerWidth;
      const canvasH = Math.max(1, container?.clientHeight || window.innerHeight);
      if (p.battleMode === 'coop-splitscreen' && p.gameState === 'playing') {
        const halfW = Math.floor(canvasW * 0.5);
        camera.aspect = halfW / canvasH;
        camera.updateProjectionMatrix();
        p2Camera.aspect = (canvasW - halfW) / canvasH;
        p2Camera.updateProjectionMatrix();

        renderer.setScissorTest(true);
        // Left Viewport: Player 1
        replayOperatorAvatar.root.visible = false;
        p2OperatorAvatar.root.visible = true;
        weaponRigGroup.visible = true;
        p2WeaponRigGroup.visible = false;
        renderer.setViewport(0, 0, halfW, canvasH);
        renderer.setScissor(0, 0, halfW, canvasH);
        renderer.render(scene, camera);

        // Right Viewport: Player 2
        replayOperatorAvatar.root.visible = true;
        p2OperatorAvatar.root.visible = false;
        weaponRigGroup.visible = false;
        p2WeaponRigGroup.visible = true;
        renderer.setViewport(halfW, 0, canvasW - halfW, canvasH);
        renderer.setScissor(halfW, 0, canvasW - halfW, canvasH);
        renderer.render(scene, p2Camera);
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, canvasW, canvasH);
      } else {
        camera.aspect = canvasW / canvasH;
        camera.updateProjectionMatrix();
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, canvasW, canvasH);
        renderer.render(scene, camera);
      }

      // Throttle HUD telemetry & 3D-to-2D Over-The-Head HP Bar Projections to ~15Hz
      if (elapsed - lastHudSyncTime >= 0.065) {
        lastHudSyncTime = elapsed;
        const rect = renderer.domElement.getBoundingClientRect();
        const fullWidth = rect.width || window.innerWidth;
        const width =
          p.battleMode === 'coop-splitscreen' && p.gameState === 'playing'
            ? fullWidth * 0.5
            : fullWidth;
        const height = rect.height || window.innerHeight;

        const opponentsOverlay: ProjectedOpponentOverlay[] = [];
        for (const npc of npcs) {
          if (npc.hp <= 0) continue;
          _projVec.set(npc.x, npc.y + 2.38, npc.z);
          const dist = camera.position.distanceTo(_projVec);
          if (dist > 85) continue;
          _projVec.project(camera);
          // Guard 3D world-to-screen projection with v.z >= -1 && v.z <= 1
          if (_projVec.z >= -1 && _projVec.z <= 1 && Math.abs(_projVec.x) <= 0.96 && Math.abs(_projVec.y) <= 0.92) {
            opponentsOverlay.push({
              id: npc.id,
              callsign: npc.callsign,
              archetype: npc.archetype,
              screenX: ((_projVec.x + 1) * 0.5) * width,
              screenY: ((-_projVec.y + 1) * 0.5) * height,
              hp: Math.round(npc.hp),
              maxHp: Math.round(npc.maxHp),
              shield: Math.round(npc.shield),
              maxShield: Math.round(npc.maxShield),
              isWindup: npc.state === 'windup',
              distance: Math.round(dist),
              isSquadmate: false,
            });
          }
        }

        // Project friendly AI / Party squadmates' overhead HP bars
        for (const ally of allyNpcs) {
          if (ally.hp <= 0) continue;
          _projVec.set(ally.x, ally.y + 2.38, ally.z);
          const dist = camera.position.distanceTo(_projVec);
          if (dist > 85) continue;
          _projVec.project(camera);
          if (_projVec.z >= -1 && _projVec.z <= 1 && Math.abs(_projVec.x) <= 0.96 && Math.abs(_projVec.y) <= 0.92) {
            opponentsOverlay.push({
              id: ally.id,
              callsign: ally.callsign,
              archetype: 'SQUAD',
              screenX: ((_projVec.x + 1) * 0.5) * width,
              screenY: ((-_projVec.y + 1) * 0.5) * height,
              hp: Math.round(ally.hp),
              maxHp: Math.round(ally.maxHp),
              shield: Math.round(ally.shield),
              maxShield: Math.round(ally.maxShield),
              isWindup: false,
              distance: Math.round(dist),
              isSquadmate: true,
            });
          }
        }

        // Also project remote multiplayer operators' overhead HP bars
        for (const rop of p.remoteOperators) {
          if (rop.mapId !== p.mapId) continue;
          _projVec.set(rop.x, rop.y + 2.38, rop.z);
          const dist = camera.position.distanceTo(_projVec);
          _projVec.project(camera);
          if (_projVec.z >= -1 && _projVec.z <= 1 && Math.abs(_projVec.x) <= 0.96 && Math.abs(_projVec.y) <= 0.92) {
            opponentsOverlay.push({
              id: rop.id,
              callsign: rop.callsign,
              archetype: 'SQUAD',
              screenX: ((_projVec.x + 1) * 0.5) * width,
              screenY: ((-_projVec.y + 1) * 0.5) * height,
              hp: Math.round(rop.hp),
              maxHp: Math.round(rop.maxHp),
              shield: 50,
              maxShield: 50,
              isWindup: false,
              distance: Math.round(dist),
              isSquadmate: true,
              activeEmote: rop.activeEmote,
            });
          }
        }

        // Contextual interaction prompt
        let interactionPrompt: string | null = null;
        for (const node of salvageNodes) {
          if (node.cooldown <= 0 && Math.hypot(node.x - playerState.x, node.z - playerState.z) < 4.5) {
            interactionPrompt = `[E] Harvest ${node.label} (+${node.amount} Salvage)`;
            break;
          }
        }

        const stats = computeWeaponStats(
          p.weaponId,
          {
            opticId: p.opticId,
            barrelId: p.barrelId,
            underbarrelId: p.underbarrelId,
            magId: p.magId,
          },
          p.stimBuff
        );

        const hudRoster = computeTeamMatchRoster(
          p.battleMode,
          p.botHardness,
          currentWave,
          p.partyMembers.length
        );
        const discoveredByCount = npcs.filter(
          (n) =>
            n.hp > 0 &&
            Math.hypot(n.x - playerState.x, n.z - playerState.z) <= BOT_DISCOVERY_RADIUS
        ).length;

        p.onHudUpdate({
          hp: Math.round(playerHp),
          maxHp: playerMaxHp,
          shield: Math.round(playerShield),
          maxShield: playerMaxShield,
          stamina: Math.round(playerState.stamina),
          ammo: currentAmmo,
          magSize: stats.magSize,
          isReloading: reloadTimer > 0,
          salvage: Math.round(playerSalvage),
          selectedWallType: p.selectedWallType,
          buildModeActive,
          movementMode: playerState.movementMode,
          abilityCooldown,
          abilityActiveTimer,
          stimCooldown,
          stimActiveTimer,
          wave: currentWave,
          totalWaves: totalWavesInMatch,
          matchElapsedSec: Math.round(matchElapsedSec),
          enemiesRemaining:
            p.battleMode === 'battle-royale'
              ? Math.max(0, brPlayersAlive - 1)
              : npcs.filter((n) => n.hp > 0).length,
          totalEnemiesInWave:
            p.battleMode === 'battle-royale' ? 100 : npcs.length,
          score: Math.round(playerScore),
          eliminations: playerEliminations,
          wallsConstructed: wallsConstructedCount,
          activeEmoteBanner,
          interactionPrompt,
          hitMarkerActive: hitMarkerTimer > 0,
          killMarkerActive: killMarkerTimer > 0,
          damageVignetteIntensity: damageVignette,
          smartTargetLocked,
          activeChunkKey: currentPlayerChunkKey,
          loadedChunkCount: loadedChunks.size,
          chunksDiscovered: discoveredChunkKeys.size,
          discoveredByCount,
          arenaSizeLabel: hudRoster.arenaSizeLabel,
          useChunkStreaming: hudRoster.useChunkStreaming,
          brPlayersAlive: p.battleMode === 'battle-royale' ? brPlayersAlive : null,
          weatherMode: p.weatherMode,
          activeEnvironmentEvent: activeEnvEvent
            ? {
                id: activeEnvEvent.id,
                name: activeEnvEvent.name,
                subtitle: activeEnvEvent.subtitle,
                accentColor: activeEnvEvent.accentColor,
                remainingSec: envEventActiveTimer,
              }
            : null,
          nextEventCooldownSec: envEventCooldownTimer,
          splitScreenP2:
            p.battleMode === 'coop-splitscreen'
              ? {
                  active: true,
                  callsign: p.partyMembers[0]?.username || `${p.callsign}_P2`,
                  hp: Math.round(p2Hp),
                  maxHp: p2MaxHp,
                  shield: Math.round(p2Shield),
                  maxShield: p2MaxShield,
                  ammo: p2Ammo,
                  magSize: stats.magSize,
                  eliminations: p2Eliminations,
                  movementMode: p2State.movementMode,
                }
              : null,
          opponentsOverlay,
          minimapEntities: {
            playerX: playerState.x,
            playerZ: playerState.z,
            playerYaw: playerState.yaw,
            enemies: npcs
              .filter((n) => n.hp > 0)
              .map((n) => ({
                x: n.x,
                z: n.z,
                archetype: n.archetype,
                isWindup: n.state === 'windup',
              })),
            walls: Array.from(mergedWallsMap.values()).map((w) => ({
              x: w.x,
              z: w.z,
              type: w.type,
            })),
            crates: salvageNodes.map((c) => ({
              x: c.x,
              z: c.z,
              ready: c.cooldown <= 0,
            })),
            squadmates: [
              ...allyNpcs
                .filter((a) => a.hp > 0)
                .map((a) => ({ x: a.x, z: a.z, callsign: a.callsign })),
              ...p.remoteOperators.map((r) => ({
                x: r.x,
                z: r.z,
                callsign: r.callsign,
              })),
            ],
          },
        });
      }

      // Broadcast player position to multiplayer room at ~5Hz
      if (elapsed - lastNetSyncTime >= 0.2) {
        lastNetSyncTime = elapsed;
        p.onSendMultiplayerUpdate({
          type: 'player:update',
          callsign: p.callsign,
          skinId: p.skinId,
          emoteId: p.emoteId,
          weaponId: p.weaponId,
          x: Number(playerState.x.toFixed(2)),
          y: Number(playerState.y.toFixed(2)),
          z: Number(playerState.z.toFixed(2)),
          rotY: Number(playerState.yaw.toFixed(2)),
          hp: Math.round(playerHp),
          maxHp: playerMaxHp,
          score: Math.round(playerScore),
          eliminations: playerEliminations,
          mapId: p.mapId,
        });
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStartGlobal);
      window.removeEventListener('gamepadconnected', onGamepadConnected);
      window.removeEventListener('gamepaddisconnected', onGamepadDisconnected);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('blur', clearInputs);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 w-screen h-screen overflow-hidden bg-slate-950 select-none"
    />
  );
};
