import {
  BIOMES,
  WEAPONS,
  OPTIC_ATTACHMENTS,
  BARREL_ATTACHMENTS,
  UNDERBARREL_ATTACHMENTS,
  MAG_ATTACHMENTS,
  WALL_BLUEPRINTS,
  TRAINING_LEVELS,
  MapId,
  WeaponId,
  OpticId,
  BarrelId,
  UnderbarrelId,
  MagId,
  WallType,
  ComputedWeaponStats,
  PlayerPhysicsState,
  ObstacleBox,
  BuiltWallEntity,
  NpcEntity,
  DYNAMIC_ENVIRONMENT_EVENTS,
  DynamicEnvironmentEventDef,
  ReplayFrameSnapshot,
  MatchReplayRecording,
  BATTLE_MODES,
  BOT_HARDNESS_TIERS,
  BattleModeId,
  BotHardnessId,
  ProceduralChunkBlueprint,
  SalvageNode,
} from './types';

export function computeWeaponStats(
  weaponId: WeaponId,
  attachments: {
    opticId: OpticId;
    barrelId: BarrelId;
    underbarrelId: UnderbarrelId;
    magId: MagId;
  },
  stimBuff?: {
    recoilReduction?: number;
    damageBonus?: number;
  }
): ComputedWeaponStats {
  const base = WEAPONS[weaponId] || WEAPONS['vx-carbine'];
  const optic = OPTIC_ATTACHMENTS[attachments.opticId] || OPTIC_ATTACHMENTS['iron-sight'];
  const barrel = BARREL_ATTACHMENTS[attachments.barrelId] || BARREL_ATTACHMENTS['standard-barrel'];
  const under =
    UNDERBARREL_ATTACHMENTS[attachments.underbarrelId] || UNDERBARREL_ATTACHMENTS['none'];
  const mag = MAG_ATTACHMENTS[attachments.magId] || MAG_ATTACHMENTS['standard-mag'];

  const damageMult =
    (optic.damageMult ?? 1) *
    (barrel.damageMult ?? 1) *
    (under.damageMult ?? 1) *
    (mag.damageMult ?? 1) *
    (1 + (stimBuff?.damageBonus ?? 0));

  const recoilMult =
    (optic.recoilMult ?? 1) *
    (barrel.recoilMult ?? 1) *
    (under.recoilMult ?? 1) *
    (mag.recoilMult ?? 1) *
    Math.max(0.4, 1 - (stimBuff?.recoilReduction ?? 0));

  const spreadMult =
    (optic.spreadMult ?? 1) *
    (barrel.spreadMult ?? 1) *
    (under.spreadMult ?? 1) *
    (mag.spreadMult ?? 1);

  const rangeMult =
    (optic.rangeMult ?? 1) *
    (barrel.rangeMult ?? 1) *
    (under.rangeMult ?? 1) *
    (mag.rangeMult ?? 1);

  const reloadMult =
    (optic.reloadMult ?? 1) *
    (barrel.reloadMult ?? 1) *
    (under.reloadMult ?? 1) *
    (mag.reloadMult ?? 1);

  return {
    damage: Math.round(base.baseDamage * damageMult),
    fireIntervalSec: 60 / base.fireRateRpm,
    pelletCount: base.pelletCount,
    spread: Number((base.baseSpread * spreadMult).toFixed(4)),
    recoil: Number((base.baseRecoil * recoilMult).toFixed(4)),
    range: Math.round(base.baseRange * rangeMult),
    magSize: Math.max(4, base.baseMagSize + (mag.magBonus ?? 0)),
    reloadSec: Number((base.reloadSec * reloadMult).toFixed(2)),
    adsFov: optic.adsFov ?? 60,
    suppressed: Boolean(barrel.suppressed),
    bioDotDamage: (mag.bioDotDamage ?? 0) + (weaponId === 'helix-bio-rifle' ? 6 : 0),
  };
}

/**
 * Continuous deterministic terrain height function across infinite (x, z) coordinates.
 * Keeps the central spawn/pedestal area around (0, 0) level while sculpting seamless
 * rolling hills, valleys, and ridges across all streamed world chunks.
 */
export function getTerrainHeight(x: number, z: number, mapId: MapId): number {
  const biome = BIOMES[mapId] || BIOMES['alpine-outpost'];
  const dist = Math.hypot(x, z);
  if (dist < 22) {
    return 0;
  }
  const blend = Math.min(1, (dist - 22) / 34);
  const wave =
    Math.sin(x * 0.055) * Math.cos(z * 0.055) * 1.45 +
    Math.sin((x + z) * 0.028) * 0.95 +
    Math.cos(x * 0.018 - z * 0.022) * 0.75;
  return Math.max(0, (wave + 1.4) * 0.55 * biome.elevationScale * blend);
}

export interface MovementInput {
  forward: number; // -1 to 1
  right: number; // -1 to 1
  sprintHeld: boolean;
  slideJustPressed: boolean;
  jumpJustPressed: boolean;
  jumpHeld: boolean;
  speedMultiplier?: number;
  jumpMultiplier?: number;
  smartParkour?: boolean;
}

/**
 * Steps player movement including Walking, Sprinting, Sliding, Vaulting over waist-high cover,
 * and Climbing tall walls/ramparts.
 */
export function evaluateMovementPhysics(
  state: PlayerPhysicsState,
  input: MovementInput,
  rawDt: number,
  obstacles: ObstacleBox[],
  mapId: MapId
): PlayerPhysicsState {
  const dt = Math.min(rawDt, 0.05);
  const next: PlayerPhysicsState = { ...state };
  const speedMult = input.speedMultiplier ?? 1.0;
  const jumpMult = input.jumpMultiplier ?? 1.0;

  // Timers
  next.coyoteTimer = next.grounded ? 0.11 : Math.max(0, next.coyoteTimer - dt);
  next.jumpBufferTimer = input.jumpJustPressed
    ? 0.12
    : Math.max(0, next.jumpBufferTimer - dt);
  next.slideCooldown = Math.max(0, next.slideCooldown - dt);

  // Forward and right unit vectors in XZ plane
  const sinYaw = Math.sin(next.yaw);
  const cosYaw = Math.cos(next.yaw);
  // In Three.js right-handed camera: -Z is forward when yaw=0
  const forwardX = -sinYaw;
  const forwardZ = -cosYaw;
  const rightX = cosYaw;
  const rightZ = -sinYaw;

  let moveDirX = forwardX * input.forward + rightX * input.right;
  let moveDirZ = forwardZ * input.forward + rightZ * input.right;
  const moveLen = Math.hypot(moveDirX, moveDirZ);
  if (moveLen > 1e-4) {
    moveDirX /= moveLen;
    moveDirZ /= moveLen;
  }

  // Check if player is adjacent to a vaultable or climbable obstacle in front
  const probeX = next.x + forwardX * 1.35;
  const probeZ = next.z + forwardZ * 1.35;
  let frontVaultable: ObstacleBox | null = null;
  let frontClimbable: ObstacleBox | null = null;

  for (const obs of obstacles) {
    const halfW = obs.width * 0.5 + 0.55;
    const halfD = obs.depth * 0.5 + 0.55;
    if (
      Math.abs(probeX - obs.x) <= halfW &&
      Math.abs(probeZ - obs.z) <= halfD &&
      next.y < obs.y + obs.height
    ) {
      if (obs.vaultable && obs.height <= 1.85) {
        frontVaultable = obs;
      } else if (obs.climbable) {
        frontClimbable = obs;
      }
    }
  }

  // Trigger Slide (C key while moving on ground)
  if (
    input.slideJustPressed &&
    next.grounded &&
    !next.isSliding &&
    next.slideCooldown <= 0 &&
    moveLen > 0.1
  ) {
    next.isSliding = true;
    next.slideTimer = 0.65;
    next.slideCooldown = 0.9;
    const slideSpeed = 14.8 * speedMult;
    next.vx = moveDirX * slideSpeed;
    next.vz = moveDirZ * slideSpeed;
  }

  // Update Active Slide
  if (next.isSliding) {
    next.slideTimer -= dt;
    next.vx *= Math.pow(0.22, dt);
    next.vz *= Math.pow(0.22, dt);
    if (next.slideTimer <= 0 || !next.grounded) {
      next.isSliding = false;
    }
  } else {
    // Normal Walk / Sprint velocity
    const isSprinting = input.sprintHeld && input.forward > 0.2 && next.stamina > 8;
    const targetSpeed = (isSprinting ? 10.6 : 6.8) * speedMult;
    const targetVx = moveDirX * targetSpeed;
    const targetVz = moveDirZ * targetSpeed;
    const accel = next.grounded ? 14 : 5;
    const blend = 1 - Math.exp(-accel * dt);
    next.vx += (targetVx - next.vx) * blend;
    next.vz += (targetVz - next.vz) * blend;

    if (isSprinting && moveLen > 0.1) {
      next.stamina = Math.max(0, next.stamina - 18 * dt);
    } else {
      next.stamina = Math.min(100, next.stamina + 24 * dt);
    }
  }

  // Vaulting / Climbing / Jumping (supports Smart Auto-Parkour when moving forward into cover)
  const autoClimb = Boolean(input.smartParkour && input.forward > 0.72);
  const autoVault = Boolean(input.smartParkour && input.forward > 0.65 && next.grounded);

  if ((input.jumpHeld || autoClimb) && frontClimbable && input.forward > 0.1) {
    // Climbing tall obstacle/rampart
    next.isClimbing = true;
    next.isVaulting = false;
    next.isSliding = false;
    next.grounded = false;
    next.vy = 5.4 * jumpMult;
    next.vx = forwardX * 2.2;
    next.vz = forwardZ * 2.2;
  } else if (
    (next.jumpBufferTimer > 0 || (input.jumpHeld && input.forward > 0.2) || autoVault) &&
    frontVaultable &&
    next.y < frontVaultable.y + frontVaultable.height - 0.1
  ) {
    // Vaulting waist-high cover or barricade
    next.isVaulting = true;
    next.isClimbing = false;
    next.isSliding = false;
    next.vaultTimer = 0.28;
    next.jumpBufferTimer = 0;
    next.grounded = false;
    next.vy = 6.8 * jumpMult;
    next.vx = forwardX * 8.5;
    next.vz = forwardZ * 8.5;
  } else if (next.jumpBufferTimer > 0 && next.coyoteTimer > 0) {
    // Standard Jump
    next.vy = 8.4 * jumpMult;
    next.grounded = false;
    next.coyoteTimer = 0;
    next.jumpBufferTimer = 0;
    next.isSliding = false;
    next.isClimbing = false;
  } else {
    next.isClimbing = false;
  }

  if (next.isVaulting) {
    next.vaultTimer -= dt;
    if (next.vaultTimer <= 0) {
      next.isVaulting = false;
    }
  }

  // Variable jump cut when jump key released early while ascending
  if (!input.jumpHeld && next.vy > 2.5 && !next.isVaulting && !next.isClimbing) {
    next.vy *= 0.55;
  }

  // Apply gravity if not actively climbing
  if (!next.isClimbing) {
    next.vy -= 21.0 * dt;
  }

  // Candidate position (unbounded for infinite chunked world exploration)
  let candX = next.x + next.vx * dt;
  let candZ = next.z + next.vz * dt;
  let candY = next.y + next.vy * dt;

  // Resolve horizontal & top-surface collisions with obstacles
  let supportY = getTerrainHeight(candX, candZ, mapId);
  const playerRadius = 0.52;

  for (const obs of obstacles) {
    const halfW = obs.width * 0.5 + playerRadius;
    const halfD = obs.depth * 0.5 + playerRadius;
    const dx = candX - obs.x;
    const dz = candZ - obs.z;

    if (Math.abs(dx) < halfW && Math.abs(dz) < halfD) {
      const obsTop = obs.y + obs.height;
      // If player feet are near or above the top of the obstacle, stand on top of it
      if (next.y >= obsTop - 0.55 || next.isVaulting || next.isClimbing) {
        if (candY <= obsTop + 0.05 && next.vy <= 0) {
          supportY = Math.max(supportY, obsTop);
        }
      } else if (candY < obsTop - 0.1) {
        // Push out along shallowest axis
        const overlapX = halfW - Math.abs(dx);
        const overlapZ = halfD - Math.abs(dz);
        if (overlapX < overlapZ) {
          candX += dx >= 0 ? overlapX : -overlapX;
          next.vx = 0;
        } else {
          candZ += dz >= 0 ? overlapZ : -overlapZ;
          next.vz = 0;
        }
      }
    }
  }

  if (candY <= supportY) {
    candY = supportY;
    next.vy = 0;
    next.grounded = true;
  } else {
    next.grounded = false;
  }

  next.x = candX;
  next.y = candY;
  next.z = candZ;

  // Smooth eye height transition (0.85m when sliding, 1.72m standing)
  const targetEye = next.isSliding ? 0.85 : 1.72;
  next.eyeHeight += (targetEye - next.eyeHeight) * (1 - Math.exp(-16 * dt));

  // Determine readable movement mode badge
  if (next.isClimbing) next.movementMode = 'CLIMB';
  else if (next.isVaulting) next.movementMode = 'VAULT';
  else if (next.isSliding) next.movementMode = 'SLIDE';
  else if (!next.grounded) next.movementMode = 'AIR';
  else if (input.sprintHeld && moveLen > 0.2) next.movementMode = 'SPRINT';
  else next.movementMode = 'WALK';

  return next;
}

export function canBuildWall(
  currentSalvage: number,
  wallType: WallType,
  existingWalls: BuiltWallEntity[],
  targetPos: { x: number; z: number }
): { allowed: boolean; cost: number; reason?: string } {
  const blueprint = WALL_BLUEPRINTS[wallType];
  if (!blueprint) {
    return { allowed: false, cost: 0, reason: 'Invalid fortification blueprint' };
  }
  if (currentSalvage < blueprint.salvageCost) {
    return {
      allowed: false,
      cost: blueprint.salvageCost,
      reason: `Insufficient Salvage (${currentSalvage}/${blueprint.salvageCost})`,
    };
  }
  for (const wall of existingWalls) {
    const dist = Math.hypot(wall.x - targetPos.x, wall.z - targetPos.z);
    if (dist < 1.8) {
      return {
        allowed: false,
        cost: blueprint.salvageCost,
        reason: 'Too close to existing fortification',
      };
    }
  }
  return { allowed: true, cost: blueprint.salvageCost };
}

export function computeTrainingWaveConfig(trainingLevel: number, waveNumber: number) {
  const tier =
    TRAINING_LEVELS.find((t) => t.level === trainingLevel) || TRAINING_LEVELS[0];
  const waveScale = 1 + (Math.max(1, waveNumber) - 1) * 0.22;
  return {
    levelName: tier.name,
    totalEnemies: Math.round(tier.enemyCount * waveScale),
    hpMultiplier: Number((tier.enemyHpScale * waveScale).toFixed(2)),
    speedMultiplier: Number(
      Math.min(1.65, tier.enemySpeedScale * (1 + (waveNumber - 1) * 0.06)).toFixed(2)
    ),
    damageMultiplier: Number((tier.enemyDamageScale * waveScale).toFixed(2)),
    startingSalvage: tier.startingSalvage,
    archetypeWeights: tier.archetypeWeights,
  };
}

/**
 * Evaluates Lipinski's Rule of Five and Veber's oral bioavailability criteria
 * for the Bioscience Tactical Stimulant Lab.
 */
export function evaluateLipinskiRuleOfFive(compound: {
  mw: number;
  xlogp: number;
  hbd: number;
  hba: number;
  tpsa: number;
  rotatableBonds: number;
}) {
  const violations: string[] = [];
  if (compound.mw > 500) violations.push('MW > 500 Da');
  if (compound.xlogp > 5) violations.push('XLogP > 5');
  if (compound.hbd > 5) violations.push('HBD > 5');
  if (compound.hba > 10) violations.push('HBA > 10');

  const veberPass = compound.rotatableBonds <= 10 && compound.tpsa <= 140;
  const bbbPenetrant = compound.tpsa < 90;

  return {
    passesLipinski: violations.length <= 1,
    violationCount: violations.length,
    violations,
    veberPass,
    bbbPenetrant,
  };
}

/**
 * Distinct AI NPC movement & attack decision policies across 4 archetypes:
 * - rusher: aggressive close-quarters advance
 * - marksman: maintains 22-34m standoff range and kites back if player closes in
 * - flanker: orbits laterally around the player to bypass frontal walls
 * - juggernaut: steady shielded march with high-damage suppression
 */
export function stepAiDecisionPolicy(
  npc: NpcEntity,
  playerPos: { x: number; y: number; z: number },
  dt: number,
  speedMult: number,
  canAcquireAttackToken: boolean
): {
  nextVx: number;
  nextVz: number;
  nextRotY: number;
  nextState: NpcEntity['state'];
  triggerFire: boolean;
} {
  const dx = playerPos.x - npc.x;
  const dz = playerPos.z - npc.z;
  const dist = Math.max(0.001, Math.hypot(dx, dz));
  const dirX = dx / dist;
  const dirZ = dz / dist;
  const perpX = -dirZ * npc.strafeSign;
  const perpZ = dirX * npc.strafeSign;

  const targetRotY = Math.atan2(dx, dz);

  if (npc.hp <= 0 || npc.state === 'ko') {
    return {
      nextVx: 0,
      nextVz: 0,
      nextRotY: npc.rotY,
      nextState: 'ko',
      triggerFire: false,
    };
  }

  let baseSpeed = 4.2 * speedMult;
  let moveX = 0;
  let moveZ = 0;
  let preferredRange = 18;

  if (npc.archetype === 'rusher') {
    baseSpeed = 5.8 * speedMult;
    preferredRange = 9;
    moveX = dirX * baseSpeed + perpX * 1.4;
    moveZ = dirZ * baseSpeed + perpZ * 1.4;
  } else if (npc.archetype === 'marksman') {
    baseSpeed = 3.9 * speedMult;
    preferredRange = 32;
    if (dist < 16) {
      // Kite backward away from player
      moveX = -dirX * baseSpeed + perpX * 1.8;
      moveZ = -dirZ * baseSpeed + perpZ * 1.8;
    } else if (dist > 34) {
      moveX = dirX * baseSpeed;
      moveZ = dirZ * baseSpeed;
    } else {
      moveX = perpX * (baseSpeed * 0.75);
      moveZ = perpZ * (baseSpeed * 0.75);
    }
  } else if (npc.archetype === 'flanker') {
    baseSpeed = 5.4 * speedMult;
    preferredRange = 16;
    // Strong lateral orbit vector to flank around player's built walls
    const approachWeight = dist > 16 ? 0.55 : 0.15;
    moveX = (dirX * approachWeight + perpX * 0.95) * baseSpeed;
    moveZ = (dirZ * approachWeight + perpZ * 0.95) * baseSpeed;
  } else {
    // juggernaut
    baseSpeed = 3.1 * speedMult;
    preferredRange = 14;
    moveX = dirX * baseSpeed;
    moveZ = dirZ * baseSpeed;
  }

  let nextState = npc.state;
  let triggerFire = false;

  if (npc.state === 'windup') {
    moveX *= 0.25;
    moveZ *= 0.25;
    if (npc.windupTimer - dt <= 0) {
      triggerFire = true;
      nextState = 'recover';
    }
  } else if (
    dist <= preferredRange + 10 &&
    npc.attackCooldown <= 0 &&
    canAcquireAttackToken
  ) {
    nextState = 'windup';
  } else {
    nextState = npc.archetype === 'flanker' ? 'flank' : 'seek';
  }

  return {
    nextVx: moveX,
    nextVz: moveZ,
    nextRotY: targetRotY,
    nextState,
    triggerFire: triggerFire,
  };
}

/**
 * Applies a scaled radial/axial deadzone so slight analog stick drift is ignored
 * while preserving smooth 0..1 ramp above the threshold.
 */
export function applyThumbstickDeadzone(value: number, deadzone = 0.16): number {
  const abs = Math.abs(value);
  if (abs <= deadzone) return 0;
  const sign = value >= 0 ? 1 : -1;
  const normalized = (abs - deadzone) / Math.max(0.0001, 1 - deadzone);
  return sign * Math.min(1, normalized);
}

export interface ParsedGamepadFrame {
  moveRight: number;
  moveForward: number;
  lookYawDelta: number;
  lookPitchDelta: number;
  fireHeld: boolean;
  adsHeld: boolean;
  sprintHeld: boolean;
  jumpHeld: boolean;
  jumpJustPressed: boolean;
  slideJustPressed: boolean;
  reloadOrHarvestJustPressed: boolean;
  abilityJustPressed: boolean;
  stimJustPressed: boolean;
  buildJustPressed: boolean;
  emoteJustPressed: boolean;
  pauseJustPressed: boolean;
  wallSelectSlot: 1 | 2 | 3 | null;
  anyActiveInput: boolean;
  nextPressedButtons: boolean[];
}

/**
 * Parses W3C Standard Gamepad layout (Xbox / PlayStation DualSense / Switch Pro)
 * into unified held & edge-triggered actions.
 */
export function parseStandardGamepadState(
  axes: readonly number[],
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>,
  prevPressed: readonly boolean[] = [],
  deadzone = 0.16
): ParsedGamepadFrame {
  const lx = applyThumbstickDeadzone(axes[0] ?? 0, deadzone);
  // Standard gamepad axis[1] is -1 up (forward), +1 down (backward)
  const ly = applyThumbstickDeadzone(-(axes[1] ?? 0), deadzone);
  const rx = applyThumbstickDeadzone(axes[2] ?? 0, deadzone);
  const ry = applyThumbstickDeadzone(-(axes[3] ?? 0), deadzone);

  const isPressed = (idx: number) => {
    const b = buttons[idx];
    if (!b) return false;
    return Boolean(b.pressed || b.value > 0.35);
  };

  const justPressed = (idx: number) => isPressed(idx) && !prevPressed[idx];

  const nextPressedButtons: boolean[] = [];
  let anyBtnPressed = false;
  for (let i = 0; i < Math.max(buttons.length, 17); i++) {
    const p = isPressed(i);
    nextPressedButtons[i] = p;
    if (p) anyBtnPressed = true;
  }

  let wallSelectSlot: 1 | 2 | 3 | null = null;
  if (justPressed(14)) wallSelectSlot = 1; // D-Pad Left -> Barricade
  else if (justPressed(12)) wallSelectSlot = 2; // D-Pad Up -> Rampart
  else if (justPressed(15)) wallSelectSlot = 3; // D-Pad Right -> Bastion

  const anyStickMoved =
    Math.abs(lx) > 0.01 ||
    Math.abs(ly) > 0.01 ||
    Math.abs(rx) > 0.01 ||
    Math.abs(ry) > 0.01;

  return {
    moveRight: lx,
    moveForward: ly,
    lookYawDelta: rx,
    lookPitchDelta: ry,
    fireHeld: isPressed(7), // RT / R2
    adsHeld: isPressed(6), // LT / L2
    sprintHeld: isPressed(10) || ly > 0.88, // L3 or full forward tilt
    jumpHeld: isPressed(0), // A / Cross
    jumpJustPressed: justPressed(0),
    slideJustPressed: justPressed(1), // B / Circle
    reloadOrHarvestJustPressed: justPressed(2), // X / Square
    abilityJustPressed: justPressed(3), // Y / Triangle
    stimJustPressed: justPressed(4), // LB / L1
    buildJustPressed: justPressed(5), // RB / R1
    emoteJustPressed: justPressed(13), // D-Pad Down
    pauseJustPressed: justPressed(9), // Start / Options
    wallSelectSlot,
    anyActiveInput: anyStickMoved || anyBtnPressed,
    nextPressedButtons,
  };
}

/**
 * Evaluates Smart Target Magnetism & Aim Assist for smooth cross-platform play.
 * Gently pulls yaw/pitch toward the closest hostile within the acquisition cone
 * and signals whether the reticle is tightly locked for Smart Auto-Fire.
 */
export function evaluateSmartAimAssist(
  player: { x: number; y: number; z: number; eyeHeight: number; yaw: number; pitch: number },
  npcs: ReadonlyArray<Pick<NpcEntity, 'id' | 'x' | 'y' | 'z' | 'hp' | 'state'>>,
  maxRange: number,
  dt: number,
  assistStrength = 6.5
): {
  nextYaw: number;
  nextPitch: number;
  lockedTargetId: string | null;
  shouldAutoFire: boolean;
} {
  const eyeX = player.x;
  const eyeY = player.y + player.eyeHeight;
  const eyeZ = player.z;

  // Player look unit vector from yaw & pitch (Three.js YXZ convention: -Z is forward at yaw=0)
  const cosPitch = Math.cos(player.pitch);
  const lookX = -Math.sin(player.yaw) * cosPitch;
  const lookY = Math.sin(player.pitch);
  const lookZ = -Math.cos(player.yaw) * cosPitch;

  let bestNpc: Pick<NpcEntity, 'id' | 'x' | 'y' | 'z' | 'hp' | 'state'> | null = null;
  let bestScore = -Infinity;
  let bestYawErr = 0;
  let bestPitchErr = 0;
  let bestAngle = Infinity;

  for (const npc of npcs) {
    if (npc.hp <= 0 || npc.state === 'ko') continue;
    const tx = npc.x - eyeX;
    const ty = npc.y + 1.38 - eyeY; // Aim at upper torso / neck
    const tz = npc.z - eyeZ;
    const dist = Math.hypot(tx, ty, tz);
    if (dist < 0.5 || dist > maxRange) continue;

    const dirX = tx / dist;
    const dirY = ty / dist;
    const dirZ = tz / dist;

    const dot = Math.max(-1, Math.min(1, lookX * dirX + lookY * dirY + lookZ * dirZ));
    const angle = Math.acos(dot);

    // Acquisition cone of ~13.5 degrees (0.235 rad)
    if (angle <= 0.235) {
      const score = (0.24 - angle) * 100 - dist * 0.15;
      if (score > bestScore) {
        bestScore = score;
        bestNpc = npc;
        bestAngle = angle;

        const targetYaw = Math.atan2(-tx, -tz);
        let dyaw = targetYaw - player.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        bestYawErr = dyaw;

        const targetPitch = Math.asin(Math.max(-1, Math.min(1, dirY)));
        bestPitchErr = targetPitch - player.pitch;
      }
    }
  }

  if (!bestNpc) {
    return {
      nextYaw: player.yaw,
      nextPitch: player.pitch,
      lockedTargetId: null,
      shouldAutoFire: false,
    };
  }

  const pull = 1 - Math.exp(-assistStrength * Math.min(dt, 0.05));
  const nextYaw = player.yaw + bestYawErr * pull;
  const nextPitch = Math.max(
    -1.25,
    Math.min(1.25, player.pitch + bestPitchErr * pull)
  );

  return {
    nextYaw,
    nextPitch,
    lockedTargetId: bestNpc.id,
    shouldAutoFire: bestAngle <= 0.052,
  };
}

/**
 * Steps Dynamic Environment Event lifecycle for a given biome mapId.
 */
export function stepDynamicEnvironmentEventState(
  mapId: MapId,
  activeTimer: number,
  cooldownTimer: number,
  dt: number,
  forceTrigger = false
): {
  activeEvent: DynamicEnvironmentEventDef | null;
  nextActiveTimer: number;
  nextCooldownTimer: number;
  justTriggered: boolean;
} {
  const eventDef = DYNAMIC_ENVIRONMENT_EVENTS[mapId] || DYNAMIC_ENVIRONMENT_EVENTS['alpine-outpost'];

  if (forceTrigger) {
    return {
      activeEvent: eventDef,
      nextActiveTimer: 16.0,
      nextCooldownTimer: 18.0,
      justTriggered: true,
    };
  }

  if (activeTimer > 0) {
    const nextActive = Math.max(0, activeTimer - dt);
    return {
      activeEvent: nextActive > 0 ? eventDef : null,
      nextActiveTimer: nextActive,
      nextCooldownTimer: nextActive > 0 ? cooldownTimer : 18.0,
      justTriggered: false,
    };
  }

  const nextCooldown = Math.max(0, cooldownTimer - dt);
  if (nextCooldown <= 0) {
    return {
      activeEvent: eventDef,
      nextActiveTimer: 16.0,
      nextCooldownTimer: 18.0,
      justTriggered: true,
    };
  }

  return {
    activeEvent: null,
    nextActiveTimer: 0,
    nextCooldownTimer: nextCooldown,
    justTriggered: false,
  };
}

/**
 * Smoothly interpolates between recorded Match Replay keyframes for 60fps playback
 * at any playback speed (0.5x, 1x, 2x) or timeline scrub position.
 */
export function interpolateReplayFrames(
  recording: MatchReplayRecording,
  targetTimeSec: number
): ReplayFrameSnapshot | null {
  const frames = recording.frames;
  if (!frames || frames.length === 0) return null;
  if (frames.length === 1 || targetTimeSec <= frames[0].timestamp) {
    return frames[0];
  }
  const last = frames[frames.length - 1];
  if (targetTimeSec >= last.timestamp) {
    return last;
  }

  // Binary search or linear scan for bounding frames
  let idx = 0;
  for (let i = 0; i < frames.length - 1; i++) {
    if (frames[i + 1].timestamp >= targetTimeSec) {
      idx = i;
      break;
    }
  }

  const f0 = frames[idx];
  const f1 = frames[idx + 1];
  const span = Math.max(0.0001, f1.timestamp - f0.timestamp);
  const alpha = Math.max(0, Math.min(1, (targetTimeSec - f0.timestamp) / span));

  // Shortest-angle yaw interpolation
  let dyaw = f1.playerYaw - f0.playerYaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;

  const interpNpcs = f0.npcs.map((n0) => {
    const n1 = f1.npcs.find((cand) => cand.id === n0.id);
    if (!n1) return n0;
    return {
      ...n1,
      x: n0.x + (n1.x - n0.x) * alpha,
      y: n0.y + (n1.y - n0.y) * alpha,
      z: n0.z + (n1.z - n0.z) * alpha,
      rotY: n0.rotY + (n1.rotY - n0.rotY) * alpha,
    };
  });

  return {
    ...f0,
    timestamp: targetTimeSec,
    playerX: f0.playerX + (f1.playerX - f0.playerX) * alpha,
    playerY: f0.playerY + (f1.playerY - f0.playerY) * alpha,
    playerZ: f0.playerZ + (f1.playerZ - f0.playerZ) * alpha,
    playerYaw: f0.playerYaw + dyaw * alpha,
    playerPitch: f0.playerPitch + (f1.playerPitch - f0.playerPitch) * alpha,
    eyeHeight: f0.eyeHeight + (f1.eyeHeight - f0.eyeHeight) * alpha,
    firedShot: f0.firedShot || f1.firedShot,
    npcs: interpNpcs,
  };
}

/**
 * Computes custom XP and Credits for a completed match.
 * XP scales with time played + total eliminations + kills-per-minute (KPM) velocity bonus
 * so achieving the most kills in less time yields significantly higher XP.
 * Winning a match awards a large Victory Credit bonus scaled by Bot Hardness and Team Mode.
 */
export function calculateMatchXpAndCredits(params: {
  durationSec: number;
  eliminations: number;
  wallsConstructed: number;
  victory: boolean;
  battleMode: BattleModeId;
  botHardness: BotHardnessId;
}): {
  killsPerMinute: number;
  timeXp: number;
  eliminationXp: number;
  kpmVelocityBonusXp: number;
  victoryBonusXp: number;
  totalXpEarned: number;
  creditsEarned: number;
} {
  const modeDef = BATTLE_MODES[params.battleMode] || BATTLE_MODES['2v2'];
  const hardnessDef = BOT_HARDNESS_TIERS[params.botHardness] || BOT_HARDNESS_TIERS.recruit;

  const safeDurationSec = Math.max(5, Math.min(3600, params.durationSec));
  const durationMinutes = Math.max(0.2, safeDurationSec / 60);
  const safeElims = Math.max(0, Math.round(params.eliminations));
  const safeWalls = Math.max(0, Math.round(params.wallsConstructed));

  // Kills-per-minute efficiency rate (higher kills in shorter time -> higher KPM bonus)
  const killsPerMinute = Number((safeElims / durationMinutes).toFixed(2));

  const timeXp = Math.round(Math.min(550, safeDurationSec * 4.2));
  const eliminationXp = safeElims * 145 + safeWalls * 25;
  const kpmVelocityBonusXp = Math.round(killsPerMinute * 110);
  const victoryBonusXp = params.victory ? 320 : 80;

  const combinedMult = modeDef.xpMultiplier * hardnessDef.xpCreditMultiplier;
  const totalXpEarned = Math.max(
    60,
    Math.round((timeXp + eliminationXp + kpmVelocityBonusXp + victoryBonusXp) * combinedMult)
  );

  // Credits earned: base match completion + Win Bonus + eliminations + KPM efficiency
  const baseCredits = 45;
  const winCredits = params.victory ? modeDef.creditWinBonus : 0;
  const elimCredits = safeElims * 24;
  const kpmCredits = Math.round(killsPerMinute * 18);

  const creditsEarned = Math.max(
    25,
    Math.round((baseCredits + winCredits + elimCredits + kpmCredits) * hardnessDef.xpCreditMultiplier)
  );

  return {
    killsPerMinute,
    timeXp,
    eliminationXp,
    kpmVelocityBonusXp,
    victoryBonusXp,
    totalXpEarned,
    creditsEarned,
  };
}

/**
 * Computes Operator Level and progress bar percentage from cumulative XP.
 */
export function computeOperatorLevelFromXp(xp: number): {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPct: number;
} {
  const safeXp = Math.max(0, Math.floor(xp));
  const xpPerLevel = 1000;
  const level = Math.floor(safeXp / xpPerLevel) + 1;
  const xpIntoLevel = safeXp % xpPerLevel;
  const progressPct = Math.min(100, Math.round((xpIntoLevel / xpPerLevel) * 100));
  return {
    level,
    xpIntoLevel,
    xpForNextLevel: xpPerLevel,
    progressPct,
  };
}

/**
 * Computes the team match roster and bot scaling for 1v1, 2v2, 3v3, 4v4, Co-Op Split-Screen, and Practice.
 */
export function computeTeamMatchRoster(
  battleMode: BattleModeId,
  botHardness: BotHardnessId,
  waveNumber: number
): {
  allyCount: number;
  enemyCount: number;
  totalWaves: number;
  hpMultiplier: number;
  speedMultiplier: number;
  damageMultiplier: number;
  windupSec: number;
  fireCooldownMultiplier: number;
  maxConcurrentWindups: number;
  startingSalvage: number;
} {
  const modeDef = BATTLE_MODES[battleMode] || BATTLE_MODES['2v2'];
  const hardnessDef = BOT_HARDNESS_TIERS[botHardness] || BOT_HARDNESS_TIERS.recruit;
  const waveScale = 1 + Math.max(0, waveNumber - 1) * 0.14;

  return {
    allyCount: modeDef.allyCount,
    enemyCount: modeDef.enemyCount,
    totalWaves: modeDef.waves,
    hpMultiplier: Number((hardnessDef.hpScale * waveScale).toFixed(2)),
    speedMultiplier: Number((hardnessDef.speedScale * (1 + Math.max(0, waveNumber - 1) * 0.06)).toFixed(2)),
    damageMultiplier: Number((hardnessDef.damageScale * waveScale).toFixed(2)),
    windupSec: hardnessDef.windupSec,
    fireCooldownMultiplier: Number(Math.max(0.45, hardnessDef.windupSec).toFixed(2)),
    maxConcurrentWindups: hardnessDef.rankIndex >= 4 ? 3 : 2,
    startingSalvage: modeDef.isPractice ? 300 : 140,
  };
}

const FRIEND_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generates a unique 6-character Friend Code in the format `VX-XXXXXX`.
 * Deterministic when a seed string is provided, or random otherwise.
 */
export function generatePlayerFriendCode(seed?: string): string {
  if (seed && seed.trim().length > 0) {
    let h = 2166136261 >>> 0;
    const str = seed.trim();
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    let code = '';
    for (let i = 0; i < 6; i++) {
      h ^= (i + 1) * 0x9e3779b9;
      h = Math.imul(h, 2246822519) >>> 0;
      code += FRIEND_CODE_ALPHABET[h % FRIEND_CODE_ALPHABET.length];
    }
    return `VX-${code}`;
  }
  let code = '';
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * FRIEND_CODE_ALPHABET.length);
    code += FRIEND_CODE_ALPHABET[idx];
  }
  return `VX-${code}`;
}

/**
 * Normalizes user-entered friend code input (e.g., "vx-7k9m2p" or "7k9m2p" -> "VX-7K9M2P").
 */
export function normalizeFriendCode(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('VX-')) {
    return cleaned.slice(0, 12);
  }
  if (/^[A-Z0-9]{4,8}$/.test(cleaned)) {
    return `VX-${cleaned}`;
  }
  return cleaned.slice(0, 16);
}

export function isValidFriendCodeFormat(code: string): boolean {
  const norm = normalizeFriendCode(code);
  return /^VX-[A-Z0-9]{4,8}$/.test(norm);
}

/**
 * Infinite World Chunk Size in meters (64m × 64m per chunk).
 */
export const WORLD_CHUNK_SIZE = 64;

export function getChunkCoordFromWorld(
  x: number,
  z: number,
  chunkSize = WORLD_CHUNK_SIZE
): { cx: number; cz: number; key: string } {
  const cx = Math.floor((x + chunkSize * 0.5) / chunkSize);
  const cz = Math.floor((z + chunkSize * 0.5) / chunkSize);
  return { cx, cz, key: `${cx},${cz}` };
}

export function getStreamingChunkCoords(
  playerX: number,
  playerZ: number,
  radiusChunks = 2
): Array<{ cx: number; cz: number; key: string; distChunks: number }> {
  const center = getChunkCoordFromWorld(playerX, playerZ);
  const list: Array<{ cx: number; cz: number; key: string; distChunks: number }> = [];
  for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
    for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
      const cx = center.cx + dx;
      const cz = center.cz + dz;
      const distChunks = Math.hypot(dx, dz);
      list.push({ cx, cz, key: `${cx},${cz}`, distChunks });
    }
  }
  list.sort((a, b) => a.distChunks - b.distChunks);
  return list;
}

/**
 * Deterministic PRNG helper for chunk generation
 */
function createChunkRng(cx: number, cz: number, mapId: MapId) {
  let state = ((cx * 73856093) ^ (cz * 19349663) ^ mapId.charCodeAt(0) * 83492791) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically generates terrain props, tactical cover obstacles, foliage trees,
 * salvage crates, and outpost spires for any chunk (cx, cz) in the infinite world.
 */
export function generateProceduralChunkBlueprint(
  cx: number,
  cz: number,
  mapId: MapId
): ProceduralChunkBlueprint {
  const key = `${cx},${cz}`;
  const centerX = cx * WORLD_CHUNK_SIZE;
  const centerZ = cz * WORLD_CHUNK_SIZE;
  const rng = createChunkRng(cx, cz, mapId);

  const obstacles: ObstacleBox[] = [];
  const trees: ProceduralChunkBlueprint['trees'] = [];
  const salvageCrates: SalvageNode[] = [];

  if (cx === 0 && cz === 0) {
    // Origin Chunk (0, 0): Central Spawn Vista, Landmark Spire at (0, -18), and balanced tactical cover
    obstacles.push({
      id: 'chunk-0,0-landmark-core',
      x: 0,
      y: 0,
      z: -18,
      width: 5.0,
      height: 12,
      depth: 5.0,
      climbable: true,
      vaultable: false,
    });

    const originCover = [
      { x: -6.5, z: 9, w: 3.8, h: 1.35, d: 0.8, climb: false, vault: true },
      { x: 6.5, z: 9, w: 3.8, h: 1.35, d: 0.8, climb: false, vault: true },
      { x: -11, z: -2, w: 4.2, h: 1.4, d: 1.1, climb: false, vault: true },
      { x: 11, z: -2, w: 4.2, h: 1.4, d: 1.1, climb: false, vault: true },
      { x: 0, z: 1.5, w: 4.5, h: 1.35, d: 0.9, climb: false, vault: true },
      { x: -14, z: -12, w: 4.4, h: 2.9, d: 4.4, climb: true, vault: false },
      { x: 14, z: -12, w: 4.4, h: 2.9, d: 4.4, climb: true, vault: false },
      { x: -9, z: -26, w: 4.0, h: 2.8, d: 4.0, climb: true, vault: false },
      { x: 9, z: -26, w: 4.0, h: 2.8, d: 4.0, climb: true, vault: false },
    ];
    originCover.forEach((cfg, idx) => {
      const gy = getTerrainHeight(cfg.x, cfg.z, mapId);
      obstacles.push({
        id: `chunk-0,0-cover-${idx}`,
        x: cfg.x,
        y: gy,
        z: cfg.z,
        width: cfg.w,
        height: cfg.h,
        depth: cfg.d,
        climbable: cfg.climb,
        vaultable: cfg.vault,
      });
    });

    const originCrates = [
      { id: 'crate-0,0-1', label: 'Alloy Salvage Cache', x: -5, z: 12, amount: 35 },
      { id: 'crate-0,0-2', label: 'Bio-Polymer Crate', x: 5, z: 12, amount: 35 },
      { id: 'crate-0,0-3', label: 'Heavy Fortification Supply', x: -10, z: -6, amount: 45 },
      { id: 'crate-0,0-4', label: 'Core Reactor Salvage', x: 10, z: -6, amount: 45 },
    ];
    originCrates.forEach((c) => {
      salvageCrates.push({
        id: c.id,
        label: c.label,
        x: c.x,
        y: getTerrainHeight(c.x, c.z, mapId),
        z: c.z,
        amount: c.amount,
        cooldown: 0,
      });
    });

    // Perimeter trees in origin chunk (outside central 22m radius)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + 0.35;
      const r = 25 + (i % 3) * 2.2;
      const tx = Math.cos(angle) * r;
      const tz = Math.sin(angle) * r;
      if (Math.hypot(tx, tz - 18) < 7) continue;
      trees.push({
        x: tx,
        y: getTerrainHeight(tx, tz, mapId),
        z: tz,
        scale: 0.92 + (i % 4) * 0.1,
        rotY: angle,
        tintOffset: ((i % 3) - 1) * 0.05,
      });
    }

    return {
      cx,
      cz,
      key,
      centerX,
      centerZ,
      obstacles,
      trees,
      salvageCrates,
      hasOutpostSpire: true,
      spirePos: { x: 0, y: getTerrainHeight(0, -18, mapId), z: -18 },
    };
  }

  // Non-origin procedural chunks: generate tactical structures, trees, crates, and periodic outpost spires
  const hasOutpostSpire = Math.abs(cx * 3 + cz * 5) % 3 === 0;
  let spirePos: { x: number; y: number; z: number } | null = null;
  if (hasOutpostSpire) {
    const sx = centerX + (rng() - 0.5) * 14;
    const sz = centerZ + (rng() - 0.5) * 14;
    const sy = getTerrainHeight(sx, sz, mapId);
    spirePos = { x: Number(sx.toFixed(2)), y: Number(sy.toFixed(2)), z: Number(sz.toFixed(2)) };
    obstacles.push({
      id: `chunk-${key}-spire`,
      x: spirePos.x,
      y: spirePos.y,
      z: spirePos.z,
      width: 4.6,
      height: 10.5,
      depth: 4.6,
      climbable: true,
      vaultable: false,
    });
  }

  const coverCount = 4;
  for (let i = 0; i < coverCount; i++) {
    const qx = (i % 2 === 0 ? -1 : 1) * (12 + rng() * 11);
    const qz = (i < 2 ? -1 : 1) * (12 + rng() * 11);
    const ox = Number((centerX + qx).toFixed(2));
    const oz = Number((centerZ + qz).toFixed(2));
    const oy = getTerrainHeight(ox, oz, mapId);
    const isClimbTower = i % 2 === 0;
    obstacles.push({
      id: `chunk-${key}-obs-${i}`,
      x: ox,
      y: oy,
      z: oz,
      width: isClimbTower ? 4.4 : 4.2,
      height: isClimbTower ? 2.9 : 1.4,
      depth: isClimbTower ? 4.4 : 1.1,
      climbable: isClimbTower,
      vaultable: !isClimbTower,
    });
  }

  // 2 Salvage Crates per chunk
  for (let c = 0; c < 2; c++) {
    const cxPos = Number((centerX + (c === 0 ? -7 : 7) + (rng() - 0.5) * 6).toFixed(2));
    const czPos = Number((centerZ + (rng() - 0.5) * 14).toFixed(2));
    salvageCrates.push({
      id: `crate-${key}-${c}`,
      label: c === 0 ? 'Sector Salvage Drop' : 'Outpost Alloy Cache',
      x: cxPos,
      y: getTerrainHeight(cxPos, czPos, mapId),
      z: czPos,
      amount: 45,
      cooldown: 0,
    });
  }

  // 10 Composite Trees / Monoliths per chunk
  for (let t = 0; t < 10; t++) {
    const tx = Number((centerX + (rng() - 0.5) * (WORLD_CHUNK_SIZE - 8)).toFixed(2));
    const tz = Number((centerZ + (rng() - 0.5) * (WORLD_CHUNK_SIZE - 8)).toFixed(2));
    const tooClose = obstacles.some(
      (o) => Math.hypot(o.x - tx, o.z - tz) < Math.max(o.width, o.depth) + 2.5
    );
    if (tooClose) continue;
    trees.push({
      x: tx,
      y: getTerrainHeight(tx, tz, mapId),
      z: tz,
      scale: Number((0.85 + rng() * 0.45).toFixed(2)),
      rotY: Number((rng() * Math.PI * 2).toFixed(2)),
      tintOffset: ((t % 3) - 1) * 0.05,
    });
  }

  return {
    cx,
    cz,
    key,
    centerX,
    centerZ,
    obstacles,
    trees,
    salvageCrates,
    hasOutpostSpire,
    spirePos,
  };
}
