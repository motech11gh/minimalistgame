import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWeaponStats,
  evaluateMovementPhysics,
  canBuildWall,
  computeTrainingWaveConfig,
  evaluateLipinskiRuleOfFive,
  stepAiDecisionPolicy,
} from './rules';
import { PlayerPhysicsState, ObstacleBox, NpcEntity } from './types';

test('computeWeaponStats applies attachments and bio-stim modifiers accurately', () => {
  const baseline = computeWeaponStats('vx-carbine', {
    opticId: 'iron-sight',
    barrelId: 'standard-barrel',
    underbarrelId: 'none',
    magId: 'standard-mag',
  });
  assert.equal(baseline.damage, 28);
  assert.equal(baseline.magSize, 30);
  assert.equal(baseline.suppressed, false);

  const customized = computeWeaponStats(
    'vx-carbine',
    {
      opticId: 'acog-4x',
      barrelId: 'tactical-suppressor',
      underbarrelId: 'vertical-stabilizer',
      magId: 'extended-drum',
    },
    { recoilReduction: 0.2, damageBonus: 0.1 }
  );
  assert.ok(customized.damage > baseline.damage);
  assert.equal(customized.magSize, 45);
  assert.equal(customized.suppressed, true);
  assert.ok(customized.recoil < baseline.recoil);
  assert.ok(customized.range > baseline.range);
});

test('evaluateMovementPhysics handles slide, vaulting, and climbing transitions', () => {
  const initialState: PlayerPhysicsState = {
    x: 0,
    y: 0,
    z: 0,
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

  // 1. Trigger Slide
  const slid = evaluateMovementPhysics(
    initialState,
    {
      forward: 1,
      right: 0,
      sprintHeld: true,
      slideJustPressed: true,
      jumpJustPressed: false,
      jumpHeld: false,
    },
    0.016,
    [],
    'alpine-outpost'
  );
  assert.equal(slid.isSliding, true);
  assert.equal(slid.movementMode, 'SLIDE');
  assert.ok(slid.eyeHeight < 1.72);

  // 2. Trigger Vault over a waist-high barricade directly ahead (at z = -1.2)
  const barricadeObstacle: ObstacleBox = {
    id: 'obs-1',
    x: 0,
    y: 0,
    z: -1.2,
    width: 3.4,
    height: 1.45,
    depth: 0.55,
    climbable: false,
    vaultable: true,
  };
  const vaulted = evaluateMovementPhysics(
    initialState,
    {
      forward: 1,
      right: 0,
      sprintHeld: false,
      slideJustPressed: false,
      jumpJustPressed: true,
      jumpHeld: true,
    },
    0.016,
    [barricadeObstacle],
    'alpine-outpost'
  );
  assert.equal(vaulted.isVaulting, true);
  assert.equal(vaulted.movementMode, 'VAULT');
  assert.ok(vaulted.vy > 5);

  // 3. Trigger Climb on a tall climbable rampart ahead
  const rampartObstacle: ObstacleBox = {
    id: 'obs-2',
    x: 0,
    y: 0,
    z: -1.2,
    width: 4.0,
    height: 3.2,
    depth: 0.65,
    climbable: true,
    vaultable: false,
  };
  const climbed = evaluateMovementPhysics(
    initialState,
    {
      forward: 1,
      right: 0,
      sprintHeld: false,
      slideJustPressed: false,
      jumpJustPressed: false,
      jumpHeld: true,
    },
    0.016,
    [rampartObstacle],
    'alpine-outpost'
  );
  assert.equal(climbed.isClimbing, true);
  assert.equal(climbed.movementMode, 'CLIMB');
  assert.ok(climbed.vy > 4);
});

test('canBuildWall validates salvage cost and minimum spacing', () => {
  const existing = [
    {
      id: 'w1',
      type: 'barricade' as const,
      x: 5,
      y: 0,
      z: 5,
      rotY: 0,
      hp: 280,
      maxHp: 280,
      ownerCallsign: 'OP',
    },
  ];

  // Insufficient salvage
  const poor = canBuildWall(10, 'rampart', existing, { x: 12, z: 12 });
  assert.equal(poor.allowed, false);

  // Too close to existing wall
  const overlapping = canBuildWall(100, 'barricade', existing, { x: 5.5, z: 5.2 });
  assert.equal(overlapping.allowed, false);

  // Valid placement
  const valid = canBuildWall(100, 'bastion', existing, { x: 10, z: 10 });
  assert.equal(valid.allowed, true);
  assert.equal(valid.cost, 50);
});

test('stepAiDecisionPolicy implements distinct movement behaviors per archetype', () => {
  const baseNpc: NpcEntity = {
    id: 'npc-1',
    callsign: 'BOT-1',
    archetype: 'marksman',
    x: 0,
    y: 0,
    z: -10,
    vx: 0,
    vz: 0,
    rotY: 0,
    hp: 100,
    maxHp: 100,
    shield: 0,
    maxShield: 0,
    state: 'seek',
    windupTimer: 0.4,
    attackCooldown: 1.5,
    koTimer: 0,
    hitFlashTimer: 0,
    strafeSign: 1,
  };

  // Marksman at close range (10m) should kite backward (negative Z velocity since player is at Z=0)
  const marksmanStep = stepAiDecisionPolicy(
    baseNpc,
    { x: 0, y: 0, z: 0 },
    0.016,
    1.0,
    false
  );
  assert.ok(marksmanStep.nextVz < 0, 'Marksman should kite away when player is too close');

  // Rusher at same position (Z=-10, player at Z=0) should charge forward (positive Z velocity)
  const rusherStep = stepAiDecisionPolicy(
    { ...baseNpc, archetype: 'rusher' },
    { x: 0, y: 0, z: 0 },
    0.016,
    1.0,
    false
  );
  assert.ok(rusherStep.nextVz > 0, 'Rusher should advance toward player');
});

test('evaluateLipinskiRuleOfFive and computeTrainingWaveConfig return expected values', () => {
  const epi = evaluateLipinskiRuleOfFive({
    mw: 183.2,
    xlogp: -1.4,
    hbd: 4,
    hba: 4,
    tpsa: 72.7,
    rotatableBonds: 3,
  });
  assert.equal(epi.passesLipinski, true);
  assert.equal(epi.veberPass, true);
  assert.equal(epi.bbbPenetrant, true);

  const wave1 = computeTrainingWaveConfig(1, 1);
  const wave3 = computeTrainingWaveConfig(4, 2);
  assert.ok(wave3.totalEnemies > wave1.totalEnemies);
  assert.ok(wave3.hpMultiplier > wave1.hpMultiplier);
});
