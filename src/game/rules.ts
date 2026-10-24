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
 * Deterministic terrain height function keeping the central tactical arena flat enough for crisp cover/wall building
 * while sculpting natural rolling hills and perimeter ridges beyond 26m radius.
 */
export function getTerrainHeight(x: number, z: number, mapId: MapId): number {
  const biome = BIOMES[mapId] || BIOMES['alpine-outpost'];
  const dist = Math.hypot(x, z);
  if (dist < 22) {
    return 0;
  }
  const blend = Math.min(1, (dist - 22) / 38);
  const wave =
    Math.sin(x * 0.075) * Math.cos(z * 0.075) * 1.4 +
    Math.sin((x + z) * 0.04) * 0.9;
  const ridgeBoost = dist > 58 ? Math.min(9, (dist - 58) * 0.38) : 0;
  return Math.max(0, wave * biome.elevationScale * blend + ridgeBoost);
}

export interface MovementInput {
  forward: number; // -1 to 1
  right: number; // -1 to 1
  sprintHeld: boolean;
  slideJustPressed: boolean;
  jumpJustPressed: boolean;
  jumpHeld: boolean;
  speedMultiplier?: number;
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

  // Vaulting / Climbing / Jumping
  if (input.jumpHeld && frontClimbable && input.forward > 0.1) {
    // Climbing tall obstacle/rampart
    next.isClimbing = true;
    next.isVaulting = false;
    next.isSliding = false;
    next.grounded = false;
    next.vy = 5.4;
    next.vx = forwardX * 2.2;
    next.vz = forwardZ * 2.2;
  } else if (
    (next.jumpBufferTimer > 0 || (input.jumpHeld && input.forward > 0.2)) &&
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
    next.vy = 6.8;
    next.vx = forwardX * 8.5;
    next.vz = forwardZ * 8.5;
  } else if (next.jumpBufferTimer > 0 && next.coyoteTimer > 0) {
    // Standard Jump
    next.vy = 8.4;
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

  // Candidate position
  let candX = next.x + next.vx * dt;
  let candZ = next.z + next.vz * dt;
  let candY = next.y + next.vy * dt;

  // Keep within 68m playable arena radius
  const radialDist = Math.hypot(candX, candZ);
  if (radialDist > 66) {
    const scale = 66 / radialDist;
    candX *= scale;
    candZ *= scale;
  }

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
    triggerFire,
  };
}
