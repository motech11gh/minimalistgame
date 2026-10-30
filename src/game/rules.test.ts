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

test('applyThumbstickDeadzone and parseStandardGamepadState map console controller inputs accurately', async () => {
  const { applyThumbstickDeadzone, parseStandardGamepadState } = await import('./rules');

  // Inside deadzone -> 0
  assert.equal(applyThumbstickDeadzone(0.09, 0.16), 0);
  assert.equal(applyThumbstickDeadzone(-0.12, 0.16), 0);
  // Full deflection -> 1 / -1
  assert.equal(applyThumbstickDeadzone(1.0, 0.16), 1);
  assert.equal(applyThumbstickDeadzone(-1.0, 0.16), -1);

  const mockButtons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  mockButtons[0] = { pressed: true, value: 1 }; // A / Cross (Jump)
  mockButtons[5] = { pressed: true, value: 1 }; // RB / R1 (Build Wall)
  mockButtons[7] = { pressed: true, value: 0.9 }; // RT / R2 (Fire)

  const frame1 = parseStandardGamepadState([0, -1, 0.5, 0], mockButtons, []);
  assert.equal(frame1.moveForward, 1);
  assert.ok(frame1.lookYawDelta > 0.3);
  assert.equal(frame1.jumpJustPressed, true);
  assert.equal(frame1.buildJustPressed, true);
  assert.equal(frame1.fireHeld, true);
  assert.equal(frame1.anyActiveInput, true);

  // Holding the button on frame 2 should not re-trigger justPressed
  const frame2 = parseStandardGamepadState(
    [0, -1, 0.5, 0],
    mockButtons,
    frame1.nextPressedButtons
  );
  assert.equal(frame2.jumpJustPressed, false);
  assert.equal(frame2.jumpHeld, true);
  assert.equal(frame2.buildJustPressed, false);
});

test('evaluateSmartAimAssist, stepDynamicEnvironmentEventState, and interpolateReplayFrames work accurately', async () => {
  const {
    evaluateSmartAimAssist,
    stepDynamicEnvironmentEventState,
    interpolateReplayFrames,
  } = await import('./rules');

  // 1. Smart Aim Assist pulls yaw toward target slightly off-center and locks when aligned
  const assist = evaluateSmartAimAssist(
    { x: 0, y: 0, z: 0, eyeHeight: 1.72, yaw: 0.04, pitch: 0 },
    [{ id: 'npc-1', x: 0, y: 0, z: -15, hp: 100, state: 'seek' }],
    90,
    0.05
  );
  assert.equal(assist.lockedTargetId, 'npc-1');
  assert.ok(Math.abs(assist.nextYaw) < 0.04, 'Yaw should pull closer to 0 rad');
  assert.equal(assist.shouldAutoFire, true);

  // 2. Dynamic Environment Event lifecycle
  const triggered = stepDynamicEnvironmentEventState('obsidian-foundry', 0, 0.2, 0.5, false);
  assert.equal(triggered.justTriggered, true);
  assert.equal(triggered.activeEvent?.id, 'magma-eruption');
  assert.equal(triggered.nextActiveTimer, 16.0);

  // 3. Match Replay keyframe interpolation
  const interp = interpolateReplayFrames(
    {
      id: 'rep-1',
      mapId: 'alpine-outpost',
      trainingLevel: 1,
      callsign: 'VANGUARD-01',
      weaponId: 'vx-carbine',
      skinId: 'vanguard-obsidian',
      durationSec: 2.0,
      finalScore: 200,
      finalEliminations: 2,
      highlights: [],
      frames: [
        {
          timestamp: 0,
          playerX: 0,
          playerY: 0,
          playerZ: 20,
          playerYaw: 0,
          playerPitch: 0,
          eyeHeight: 1.72,
          hp: 100,
          shield: 50,
          score: 0,
          eliminations: 0,
          movementMode: 'WALK',
          firedShot: false,
          activeEventId: null,
          npcs: [],
          walls: [],
        },
        {
          timestamp: 2.0,
          playerX: 10,
          playerY: 0,
          playerZ: 0,
          playerYaw: 1.0,
          playerPitch: 0.2,
          eyeHeight: 1.72,
          hp: 90,
          shield: 40,
          score: 200,
          eliminations: 2,
          movementMode: 'SPRINT',
          firedShot: true,
          activeEventId: 'cryo-blizzard',
          npcs: [],
          walls: [],
        },
      ],
    },
    1.0
  );
  assert.ok(interp);
  assert.equal(interp.playerX, 5);
  assert.equal(interp.playerZ, 10);
});

test('calculateMatchXpAndCredits rewards faster kills-per-minute and victory credits across 1v1 to 4v4 and bot hardness', async () => {
  const {
    calculateMatchXpAndCredits,
    computeOperatorLevelFromXp,
    computeTeamMatchRoster,
  } = await import('./rules');

  // Same number of kills (8) in 60s vs 180s -> 60s has higher KPM (8.0 vs 2.67) and earns higher KPM velocity bonus
  const fastRun = calculateMatchXpAndCredits({
    durationSec: 60,
    eliminations: 8,
    wallsConstructed: 2,
    victory: true,
    battleMode: '4v4',
    botHardness: 'legend',
  });
  const slowRun = calculateMatchXpAndCredits({
    durationSec: 180,
    eliminations: 8,
    wallsConstructed: 2,
    victory: true,
    battleMode: '4v4',
    botHardness: 'legend',
  });
  assert.ok(
    fastRun.kpmVelocityBonusXp > slowRun.kpmVelocityBonusXp,
    'Higher kills per minute must grant a larger KPM velocity bonus'
  );

  // Winning grants significantly more credits than losing
  const lossRun = calculateMatchXpAndCredits({
    durationSec: 60,
    eliminations: 2,
    wallsConstructed: 0,
    victory: false,
    battleMode: '2v2',
    botHardness: 'beginner',
  });
  assert.ok(fastRun.creditsEarned > lossRun.creditsEarned);

  // Level calculation
  const lvl = computeOperatorLevelFromXp(2450);
  assert.equal(lvl.level, 3);
  assert.equal(lvl.xpIntoLevel, 450);
  assert.equal(lvl.progressPct, 45);

  // Team roster for 1v1 vs 4v4
  const r1v1 = computeTeamMatchRoster('1v1', 'beginner', 1);
  assert.equal(r1v1.allyCount, 0);
  assert.equal(r1v1.enemyCount, 1);

  const r4v4 = computeTeamMatchRoster('4v4', 'legend', 1);
  assert.equal(r4v4.allyCount, 3);
  assert.equal(r4v4.enemyCount, 4);
  assert.ok(r4v4.hpMultiplier > r1v1.hpMultiplier);
});

test('friend code generation, normalization, and infinite procedural chunk streaming work deterministically', async () => {
  const {
    generatePlayerFriendCode,
    normalizeFriendCode,
    isValidFriendCodeFormat,
    getChunkCoordFromWorld,
    getStreamingChunkCoords,
    generateProceduralChunkBlueprint,
    evaluateMovementPhysics,
    getTerrainHeight,
  } = await import('./rules');

  // 1. Deterministic friend code from seed
  const code1 = generatePlayerFriendCode('user-seed-alpha');
  const code2 = generatePlayerFriendCode('user-seed-alpha');
  const code3 = generatePlayerFriendCode('user-seed-beta');
  assert.equal(code1, code2);
  assert.notEqual(code1, code3);
  assert.equal(isValidFriendCodeFormat(code1), true);

  // 2. Normalization of bare code or lowercase
  assert.equal(normalizeFriendCode('  7k9m2p '), 'VX-7K9M2P');
  assert.equal(normalizeFriendCode('vx-ab34cd'), 'VX-AB34CD');
  assert.equal(isValidFriendCodeFormat('7k9m2p'), true);
  assert.equal(isValidFriendCodeFormat('!bad!'), false);

  // 3. Infinite chunk coordinate mapping & streaming grid
  assert.deepEqual(getChunkCoordFromWorld(0, 0), { cx: 0, cz: 0, key: '0,0' });
  assert.deepEqual(getChunkCoordFromWorld(64, -128), { cx: 1, cz: -2, key: '1,-2' });

  const streamGrid = getStreamingChunkCoords(64, -128, 2);
  assert.equal(streamGrid.length, 25); // 5x5 grid around active chunk
  assert.equal(streamGrid[0].key, '1,-2'); // Closest chunk is first

  // 4. Deterministic chunk blueprint generation
  const chunkA = generateProceduralChunkBlueprint(3, -4, 'alpine-outpost');
  const chunkB = generateProceduralChunkBlueprint(3, -4, 'alpine-outpost');
  assert.deepEqual(chunkA, chunkB);
  assert.ok(chunkA.obstacles.length >= 4);
  assert.equal(chunkA.salvageCrates.length, 2);
  assert.ok(chunkA.trees.length > 0);

  // 5. Unbounded movement far beyond the old 66m radius
  const farState: PlayerPhysicsState = {
    x: 240,
    y: getTerrainHeight(240, -320, 'alpine-outpost'),
    z: -320,
    vx: 0,
    vy: 0,
    vz: -10,
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
    movementMode: 'SPRINT',
  };
  const steppedFar = evaluateMovementPhysics(
    farState,
    {
      forward: 1,
      right: 0,
      sprintHeld: true,
      slideJustPressed: false,
      jumpJustPressed: false,
      jumpHeld: false,
    },
    0.05,
    [],
    'alpine-outpost'
  );
  assert.ok(Math.hypot(steppedFar.x, steppedFar.z) > 390, 'Player can travel infinitely across chunks');
});

test('25-block bot discovery zone prevents cross-map aggro and mode-specific map sizes & bot counts work', async () => {
  const {
    BOT_DISCOVERY_RADIUS,
    isWithinBotDiscoveryZone,
    stepAiDecisionPolicy,
    computeTeamMatchRoster,
    generateProceduralChunkBlueprint,
    evaluateMovementPhysics,
  } = await import('./rules');

  assert.equal(BOT_DISCOVERY_RADIUS, 25);
  assert.equal(isWithinBotDiscoveryZone(0, 0, 15, 15), true); // ~21.2m <= 25
  assert.equal(isWithinBotDiscoveryZone(0, 0, 20, 20), false); // ~28.3m > 25

  const testBot: NpcEntity = {
    id: 'bot-25',
    callsign: 'RECON-01',
    archetype: 'rusher',
    x: 0,
    y: 0,
    z: -32, // 32 blocks away (> 25 blocks)
    vx: 0,
    vz: 0,
    rotY: 0,
    hp: 100,
    maxHp: 100,
    shield: 0,
    maxShield: 0,
    state: 'patrol',
    windupTimer: 0.4,
    attackCooldown: 0,
    koTimer: 0,
    hitFlashTimer: 0,
    strafeSign: 1,
  };

  // At 32m (> 25 blocks), bot must NOT discover or fire at player
  const farDecision = stepAiDecisionPolicy(testBot, { x: 0, y: 0, z: 0 }, 0.016, 1.0, true);
  assert.equal(farDecision.discoveredPlayer, false);
  assert.equal(farDecision.nextState, 'patrol');
  assert.equal(farDecision.triggerFire, false);

  // At 18m (<= 25 blocks), bot discovers player and engages
  const nearDecision = stepAiDecisionPolicy(
    { ...testBot, z: -18 },
    { x: 0, y: 0, z: 0 },
    0.016,
    1.0,
    true
  );
  assert.equal(nearDecision.discoveredPlayer, true);
  assert.notEqual(nearDecision.nextState, 'patrol');

  // Mode-specific bot counts, map sizes, and chunk streaming flags
  const m1v1 = computeTeamMatchRoster('1v1', 'veteran', 1, 0);
  assert.equal(m1v1.enemyCount, 1);
  assert.equal(m1v1.allyCount, 0);
  assert.equal(m1v1.useChunkStreaming, false);
  assert.equal(m1v1.arenaRadius, 24);

  const m2v2 = computeTeamMatchRoster('2v2', 'veteran', 1, 1);
  assert.equal(m2v2.enemyCount, 2);
  assert.equal(m2v2.allyCount, 1);
  assert.equal(m2v2.useChunkStreaming, false);
  assert.ok(m2v2.arenaRadius > m1v1.arenaRadius);

  const mParty = computeTeamMatchRoster('party-vs', 'veteran', 1, 2);
  assert.equal(mParty.allyCount, 0);
  assert.equal(mParty.enemyCount, 2);
  assert.equal(mParty.useChunkStreaming, false);

  const mBR = computeTeamMatchRoster('battle-royale', 'veteran', 1, 0);
  assert.equal(mBR.totalCombatants, 100);
  assert.equal(mBR.useChunkStreaming, true);
  assert.ok(mBR.arenaRadius >= 250);

  // Bounded 1v1 arena clamps player position within 24m
  const clamped = evaluateMovementPhysics(
    {
      x: 23.8,
      y: 0,
      z: 0,
      vx: 10,
      vy: 0,
      vz: 0,
      yaw: -Math.PI / 2,
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
      movementMode: 'SPRINT',
    },
    {
      forward: 1,
      right: 0,
      sprintHeld: true,
      slideJustPressed: false,
      jumpJustPressed: false,
      jumpHeld: false,
      arenaRadius: 24,
    },
    0.05,
    [],
    'playground'
  );
  assert.ok(clamped.x <= 24, '1v1 arena boundary clamps player within 24m');

  // Verify new themed maps generate valid chunk blueprints
  for (const mapId of ['playground', 'forest', 'water-splash', 'theme-park'] as const) {
    const bp = generateProceduralChunkBlueprint(0, 0, mapId);
    assert.ok(bp.obstacles.length >= 6);
    assert.ok(bp.trees.length > 0);
  }
});

