export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type MapId =
  | 'alpine-outpost'
  | 'dune-refinery'
  | 'emerald-citadel'
  | 'obsidian-foundry'
  | 'cryo-spire';

export type WeaponId =
  | 'vx-carbine'
  | 'kodiak-shotgun'
  | 'solaris-dmr'
  | 'aegis-smg'
  | 'helix-bio-rifle';

export type OpticId = 'iron-sight' | 'holo-reflex' | 'acog-4x' | 'thermal-bio-scope';
export type BarrelId =
  | 'standard-barrel'
  | 'tactical-suppressor'
  | 'muzzle-compensator'
  | 'heavy-fluted';
export type UnderbarrelId =
  | 'none'
  | 'angled-foregrip'
  | 'vertical-stabilizer'
  | 'laser-targeter';
export type MagId = 'standard-mag' | 'extended-drum' | 'fast-mag' | 'bio-catalyst-cell';

export type SkinId =
  | 'vanguard-obsidian'
  | 'alpine-ghost'
  | 'dune-stalker'
  | 'emerald-recon'
  | 'cryo-sentinel';

export type EmoteId =
  | 'salute'
  | 'rally-banner'
  | 'bio-scan'
  | 'victory-flare'
  | 'taunt-pulse';

export type WallType = 'barricade' | 'rampart' | 'bastion';

export type NpcArchetype = 'rusher' | 'marksman' | 'flanker' | 'juggernaut';

export interface BiomeDefinition {
  id: MapId;
  name: string;
  regionCode: string;
  tagline: string;
  skyTopHex: number;
  skyHorizonHex: number;
  fogHex: number;
  fogDensity: number;
  sunHex: number;
  sunIntensity: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  terrainPrimaryHex: string;
  terrainSecondaryHex: string;
  accentHex: string;
  elevationScale: number;
  landmarkType: 'radar-dome' | 'refinery-silo' | 'canopy-bastion' | 'obsidian-reactor' | 'cryo-monolith';
}

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  category: string;
  baseDamage: number;
  fireRateRpm: number;
  pelletCount: number;
  baseSpread: number;
  baseRecoil: number;
  baseRange: number;
  baseMagSize: number;
  reloadSec: number;
  abilityName: string;
  abilityDescription: string;
  abilityCooldownSec: number;
  primaryColorHex: number;
  accentColorHex: number;
}

export interface AttachmentModifiers {
  id: string;
  name: string;
  slot: 'optic' | 'barrel' | 'underbarrel' | 'mag';
  summary: string;
  damageMult?: number;
  recoilMult?: number;
  spreadMult?: number;
  rangeMult?: number;
  magBonus?: number;
  reloadMult?: number;
  adsFov?: number;
  suppressed?: boolean;
  bioDotDamage?: number;
}

export interface ComputedWeaponStats {
  damage: number;
  fireIntervalSec: number;
  pelletCount: number;
  spread: number;
  recoil: number;
  range: number;
  magSize: number;
  reloadSec: number;
  adsFov: number;
  suppressed: boolean;
  bioDotDamage: number;
}

export interface WallBlueprint {
  type: WallType;
  name: string;
  keyHint: string;
  salvageCost: number;
  maxHp: number;
  width: number;
  height: number;
  depth: number;
  description: string;
  accentColor: string;
}

export interface ObstacleBox {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  climbable: boolean;
  vaultable: boolean;
}

export interface PlayerPhysicsState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  grounded: boolean;
  coyoteTimer: number;
  jumpBufferTimer: number;
  isSliding: boolean;
  slideTimer: number;
  slideCooldown: number;
  isVaulting: boolean;
  vaultTimer: number;
  isClimbing: boolean;
  eyeHeight: number;
  stamina: number;
  movementMode: 'WALK' | 'SPRINT' | 'SLIDE' | 'VAULT' | 'CLIMB' | 'AIR';
}

export interface NpcEntity {
  id: string;
  callsign: string;
  archetype: NpcArchetype;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  rotY: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  state: 'patrol' | 'seek' | 'flank' | 'windup' | 'recover' | 'ko';
  windupTimer: number;
  attackCooldown: number;
  koTimer: number;
  hitFlashTimer: number;
  strafeSign: number;
}

export interface ProjectedOpponentOverlay {
  id: string;
  callsign: string;
  archetype: NpcArchetype | 'SQUAD';
  screenX: number;
  screenY: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  isWindup: boolean;
  distance: number;
  isSquadmate: boolean;
  activeEmote?: string | null;
}

export interface SalvageNode {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  amount: number;
  cooldown: number;
}

export interface BuiltWallEntity {
  id: string;
  type: WallType;
  x: number;
  y: number;
  z: number;
  rotY: number;
  hp: number;
  maxHp: number;
  ownerCallsign: string;
}

export const BIOMES: Record<MapId, BiomeDefinition> = {
  'alpine-outpost': {
    id: 'alpine-outpost',
    name: 'Alpine Bio-Research Outpost',
    regionCode: 'SECTOR 01 · BERNESE ALPS',
    tagline: 'High-altitude glacial ridge with radar domes, pine groves, and fortified bunkers.',
    skyTopHex: 0x1a365d,
    skyHorizonHex: 0x90cdf4,
    fogHex: 0x8bb8e8,
    fogDensity: 0.0085,
    sunHex: 0xfff3d1,
    sunIntensity: 2.3,
    hemiSkyHex: 0x90cdf4,
    hemiGroundHex: 0x334155,
    terrainPrimaryHex: '#475569',
    terrainSecondaryHex: '#cbd5e1',
    accentHex: '#38bdf8',
    elevationScale: 1.8,
    landmarkType: 'radar-dome',
  },
  'dune-refinery': {
    id: 'dune-refinery',
    name: 'Scorched Dune Refinery',
    regionCode: 'SECTOR 02 · RUB AL KHALI',
    tagline: 'Sun-baked sandstone canyons surrounding an automated solar-thermal extraction rig.',
    skyTopHex: 0x451a03,
    skyHorizonHex: 0xfdba74,
    fogHex: 0xfbbf24,
    fogDensity: 0.0095,
    sunHex: 0xffedd5,
    sunIntensity: 2.6,
    hemiSkyHex: 0xfde68a,
    hemiGroundHex: 0x78350f,
    terrainPrimaryHex: '#b45309',
    terrainSecondaryHex: '#d97706',
    accentHex: '#f59e0b',
    elevationScale: 2.1,
    landmarkType: 'refinery-silo',
  },
  'emerald-citadel': {
    id: 'emerald-citadel',
    name: 'Emerald Canopy Citadel',
    regionCode: 'SECTOR 03 · AMAZON BASIN',
    tagline: 'Misty terraced jungle ruins and hydroponic bio-domes overgrown with bioluminescent flora.',
    skyTopHex: 0x064e3b,
    skyHorizonHex: 0x6ee7b7,
    fogHex: 0x34d399,
    fogDensity: 0.009,
    sunHex: 0xfef08a,
    sunIntensity: 2.1,
    hemiSkyHex: 0x6ee7b7,
    hemiGroundHex: 0x14532d,
    terrainPrimaryHex: '#15803d',
    terrainSecondaryHex: '#166534',
    accentHex: '#10b981',
    elevationScale: 1.6,
    landmarkType: 'canopy-bastion',
  },
  'obsidian-foundry': {
    id: 'obsidian-foundry',
    name: 'Volcanic Obsidian Foundry',
    regionCode: 'SECTOR 04 · REYKJANES RIFT',
    tagline: 'Basalt caldera and geothermal turbine platforms lit by molten thermal vents.',
    skyTopHex: 0x18181b,
    skyHorizonHex: 0x991b1b,
    fogHex: 0x7f1d1d,
    fogDensity: 0.01,
    sunHex: 0xfca5a5,
    sunIntensity: 2.2,
    hemiSkyHex: 0xf87171,
    hemiGroundHex: 0x27272a,
    terrainPrimaryHex: '#27272a',
    terrainSecondaryHex: '#450a0a',
    accentHex: '#ef4444',
    elevationScale: 2.3,
    landmarkType: 'obsidian-reactor',
  },
  'cryo-spire': {
    id: 'cryo-spire',
    name: 'Arctic Cryo-Spire',
    regionCode: 'SECTOR 05 · SVALBARD ARCHIPELAGO',
    tagline: 'Sub-zero permafrost fields with crystalline cryo-towers and aurora sky reflections.',
    skyTopHex: 0x0f172a,
    skyHorizonHex: 0x67e8f9,
    fogHex: 0x38bdf8,
    fogDensity: 0.008,
    sunHex: 0xe0f2fe,
    sunIntensity: 2.4,
    hemiSkyHex: 0x7dd3fc,
    hemiGroundHex: 0x1e293b,
    terrainPrimaryHex: '#64748b',
    terrainSecondaryHex: '#e2e8f0',
    accentHex: '#06b6d4',
    elevationScale: 1.5,
    landmarkType: 'cryo-monolith',
  },
};

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  'vx-carbine': {
    id: 'vx-carbine',
    name: 'VX-19 Tactical Carbine',
    category: 'Assault Rifle · Versatile Mid-Range',
    baseDamage: 28,
    fireRateRpm: 650,
    pelletCount: 1,
    baseSpread: 0.014,
    baseRecoil: 0.022,
    baseRange: 95,
    baseMagSize: 30,
    reloadSec: 1.6,
    abilityName: 'Overdrive Burst [Q]',
    abilityDescription: 'Boosts rate of fire by +45% and eliminates recoil for 4.5s.',
    abilityCooldownSec: 12,
    primaryColorHex: 0x1e293b,
    accentColorHex: 0xf59e0b,
  },
  'kodiak-shotgun': {
    id: 'kodiak-shotgun',
    name: 'Kodiak-12 Breacher',
    category: 'Combat Shotgun · Heavy CQB Impact',
    baseDamage: 16,
    fireRateRpm: 160,
    pelletCount: 7,
    baseSpread: 0.068,
    baseRecoil: 0.065,
    baseRange: 38,
    baseMagSize: 8,
    reloadSec: 2.0,
    abilityName: 'Concussive Shockwave [Q]',
    abilityDescription: 'Unleashes a kinetic blast that shatters enemy shields and knocks back nearby hostiles.',
    abilityCooldownSec: 10,
    primaryColorHex: 0x334155,
    accentColorHex: 0xef4444,
  },
  'solaris-dmr': {
    id: 'solaris-dmr',
    name: 'Solaris-X Marksman DMR',
    category: 'Designated Marksman · High-Velocity Precision',
    baseDamage: 68,
    fireRateRpm: 240,
    pelletCount: 1,
    baseSpread: 0.003,
    baseRecoil: 0.048,
    baseRange: 160,
    baseMagSize: 12,
    reloadSec: 1.8,
    abilityName: 'Target Lock Pulse [Q]',
    abilityDescription: 'Highlights all hostiles and amplifies critical weakpoint damage by +35% for 6s.',
    abilityCooldownSec: 14,
    primaryColorHex: 0x0f172a,
    accentColorHex: 0x38bdf8,
  },
  'aegis-smg': {
    id: 'aegis-smg',
    name: 'Aegis-9 PDW',
    category: 'Submachine Gun · High-Mobility Slide Gunner',
    baseDamage: 20,
    fireRateRpm: 900,
    pelletCount: 1,
    baseSpread: 0.025,
    baseRecoil: 0.016,
    baseRange: 62,
    baseMagSize: 40,
    reloadSec: 1.25,
    abilityName: 'Kinetic Phase Dash [Q]',
    abilityDescription: 'Instantly surges forward and refills stamina + magazine immediately.',
    abilityCooldownSec: 8,
    primaryColorHex: 0x18181b,
    accentColorHex: 0x10b981,
  },
  'helix-bio-rifle': {
    id: 'helix-bio-rifle',
    name: 'Helix-7 Bio-Pulse Rifle',
    category: 'Experimental Bio-Weapon · Corrosive & Siphon',
    baseDamage: 34,
    fireRateRpm: 480,
    pelletCount: 1,
    baseSpread: 0.009,
    baseRecoil: 0.018,
    baseRange: 110,
    baseMagSize: 24,
    reloadSec: 1.5,
    abilityName: 'Nano-Cellular Surge [Q]',
    abilityDescription: 'Restores +45 Operator HP immediately and coats rounds with bio-corrosive toxin.',
    abilityCooldownSec: 13,
    primaryColorHex: 0x064e3b,
    accentColorHex: 0x22d3ee,
  },
};

export const OPTIC_ATTACHMENTS: Record<OpticId, AttachmentModifiers> = {
  'iron-sight': {
    id: 'iron-sight',
    name: 'Tritium Iron Sights',
    slot: 'optic',
    summary: 'Fastest ADS handling · 65° FOV',
    adsFov: 62,
    spreadMult: 1.0,
  },
  'holo-reflex': {
    id: 'holo-reflex',
    name: 'EOTech Holo-Reflex 1.5x',
    slot: 'optic',
    summary: '-15% ADS Spread · Crisp holographic ring · 52° FOV',
    adsFov: 52,
    spreadMult: 0.85,
  },
  'acog-4x': {
    id: 'acog-4x',
    name: 'Vanguard ACOG 4x Prism',
    slot: 'optic',
    summary: '+25% Effective Range · -25% Spread · 36° Zoom FOV',
    adsFov: 36,
    spreadMult: 0.75,
    rangeMult: 1.25,
  },
  'thermal-bio-scope': {
    id: 'thermal-bio-scope',
    name: 'FLIR Bio-Signature Scope',
    slot: 'optic',
    summary: '+10% Weakpoint Damage · Thermal target acquisition · 42° FOV',
    adsFov: 42,
    spreadMult: 0.78,
    damageMult: 1.1,
  },
};

export const BARREL_ATTACHMENTS: Record<BarrelId, AttachmentModifiers> = {
  'standard-barrel': {
    id: 'standard-barrel',
    name: 'Factory Mil-Spec Barrel',
    slot: 'barrel',
    summary: 'Balanced ballistic profile',
  },
  'tactical-suppressor': {
    id: 'tactical-suppressor',
    name: ' monolithic Whisper Suppressor',
    slot: 'barrel',
    summary: 'Silences acoustic signature · -12% Recoil · +8% Range',
    recoilMult: 0.88,
    rangeMult: 1.08,
    suppressed: true,
  },
  'muzzle-compensator': {
    id: 'muzzle-compensator',
    name: 'Dual-Port Muzzle Brake',
    slot: 'barrel',
    summary: '-28% Vertical RecoilClimb',
    recoilMult: 0.72,
  },
  'heavy-fluted': {
    id: 'heavy-fluted',
    name: 'Heavy Fluted Match Barrel',
    slot: 'barrel',
    summary: '+15% Ballistic Damage · +30% Range',
    damageMult: 1.15,
    rangeMult: 1.3,
  },
};

export const UNDERBARREL_ATTACHMENTS: Record<UnderbarrelId, AttachmentModifiers> = {
  none: {
    id: 'none',
    name: 'Standard Handguard Rail',
    slot: 'underbarrel',
    summary: 'No additional weight',
  },
  'angled-foregrip': {
    id: 'angled-foregrip',
    name: 'Ergonomic Angled Foregrip',
    slot: 'underbarrel',
    summary: '-18% Horizontal Recoil · Faster weapon swap',
    recoilMult: 0.82,
  },
  'vertical-stabilizer': {
    id: 'vertical-stabilizer',
    name: 'Hydraulic Vertical Grip',
    slot: 'underbarrel',
    summary: '-26% Sustained Fire Recoil',
    recoilMult: 0.74,
  },
  'laser-targeter': {
    id: 'laser-targeter',
    name: 'PEQ-16 Tactical Laser Module',
    slot: 'underbarrel',
    summary: '-35% Hipfire & Slide Spread',
    spreadMult: 0.65,
  },
};

export const MAG_ATTACHMENTS: Record<MagId, AttachmentModifiers> = {
  'standard-mag': {
    id: 'standard-mag',
    name: 'Standard Issue Polymer Mag',
    slot: 'mag',
    summary: 'Baseline capacity & reload cadence',
  },
  'extended-drum': {
    id: 'extended-drum',
    name: 'High-Capacity Drum Mag',
    slot: 'mag',
    summary: '+50% Magazine Capacity · +15% Reload Time',
    magBonus: 15,
    reloadMult: 1.15,
  },
  'fast-mag': {
    id: 'fast-mag',
    name: 'Dual-Clamped Speed Mag',
    slot: 'mag',
    summary: '-32% Reload Duration',
    reloadMult: 0.68,
  },
  'bio-catalyst-cell': {
    id: 'bio-catalyst-cell',
    name: 'Bio-Enzyme Payload Cell',
    slot: 'mag',
    summary: '+12% Bio-Acid Damage + Corrosive Over-Time Burn',
    damageMult: 1.12,
    bioDotDamage: 8,
  },
};

export const WALL_BLUEPRINTS: Record<WallType, WallBlueprint> = {
  barricade: {
    type: 'barricade',
    name: 'Ballistic Barricade',
    keyHint: '1',
    salvageCost: 20,
    maxHp: 280,
    width: 3.4,
    height: 1.45,
    depth: 0.55,
    description: 'Waist-high composite cover you can vault over or crouch behind.',
    accentColor: '#38bdf8',
  },
  rampart: {
    type: 'rampart',
    name: 'Reinforced Rampart',
    keyHint: '2',
    salvageCost: 35,
    maxHp: 450,
    width: 4.2,
    height: 2.6,
    depth: 0.65,
    description: 'Full-height armored steel wall with firing slit and climbable rungs.',
    accentColor: '#f59e0b',
  },
  bastion: {
    type: 'bastion',
    name: 'Bio-Shielded Bastion',
    keyHint: '3',
    salvageCost: 50,
    maxHp: 650,
    width: 4.8,
    height: 3.0,
    depth: 0.8,
    description: 'Heavy energy-reinforced fortress wall that regenerates nearby operator shields.',
    accentColor: '#10b981',
  },
};

export const OPERATOR_SKINS: Record<
  SkinId,
  { id: SkinId; name: string; primaryHex: string; secondaryHex: string; visorHex: string; roleTag: string }
> = {
  'vanguard-obsidian': {
    id: 'vanguard-obsidian',
    name: 'Vanguard Obsidian',
    primaryHex: '#1e293b',
    secondaryHex: '#334155',
    visorHex: '#f59e0b',
    roleTag: 'Spec-Ops Carbonweave',
  },
  'alpine-ghost': {
    id: 'alpine-ghost',
    name: 'Alpine Ghost Camo',
    primaryHex: '#e2e8f0',
    secondaryHex: '#64748b',
    visorHex: '#38bdf8',
    roleTag: 'Arctic Recon Exosuit',
  },
  'dune-stalker': {
    id: 'dune-stalker',
    name: 'Dune Stalker Arid',
    primaryHex: '#b45309',
    secondaryHex: '#78350f',
    visorHex: '#fde047',
    roleTag: 'Desert Thermal Rig',
  },
  'emerald-recon': {
    id: 'emerald-recon',
    name: 'Emerald Bio-Hazard',
    primaryHex: '#065f46',
    secondaryHex: '#064e3b',
    visorHex: '#34d399',
    roleTag: 'CBRN Sealed Armor',
  },
  'cryo-sentinel': {
    id: 'cryo-sentinel',
    name: 'Cryo Sentinel Titanium',
    primaryHex: '#0f172a',
    secondaryHex: '#0284c7',
    visorHex: '#22d3ee',
    roleTag: 'Zero-Kelvin Plating',
  },
};

export const OPERATOR_EMOTES: Record<
  EmoteId,
  { id: EmoteId; name: string; calloutText: string; iconLabel: string }
> = {
  salute: {
    id: 'salute',
    name: 'Vanguard Salute',
    calloutText: 'salutes the squad — "Eyes sharp, sector secure!"',
    iconLabel: 'SALUTE',
  },
  'rally-banner': {
    id: 'rally-banner',
    name: 'Plant Rally Beacon',
    calloutText: 'deploys a Holographic Rally Banner — "Fortify this position!"',
    iconLabel: 'RALLY',
  },
  'bio-scan': {
    id: 'bio-scan',
    name: 'Bio-Telemetry Sweep',
    calloutText: 'runs a wrist Bio-Scanner sweep — "Analyzing pathogen signatures."',
    iconLabel: 'SCAN',
  },
  'victory-flare': {
    id: 'victory-flare',
    name: 'Ignition Signal Flare',
    calloutText: 'launches a Golden Signal Flare — "Target zone dominated!"',
    iconLabel: 'FLARE',
  },
  'taunt-pulse': {
    id: 'taunt-pulse',
    name: 'Kinetic Challenge',
    calloutText: 'strikes chest armor — "Bring the whole battalion!"',
    iconLabel: 'CHALLENGE',
  },
};

export const TRAINING_LEVELS = [
  {
    level: 1,
    name: 'Level 1 · Recruit Cadence',
    subtitle: 'Fundamentals: Target tracking, obstacle vaulting, and wall placement drills.',
    enemyCount: 6,
    enemyHpScale: 0.85,
    enemySpeedScale: 0.85,
    enemyDamageScale: 0.75,
    startingSalvage: 120,
    archetypeWeights: { rusher: 0.5, marksman: 0.3, flanker: 0.2, juggernaut: 0.0 },
  },
  {
    level: 2,
    name: 'Level 2 · Tactical Specialist',
    subtitle: 'Combined arms: Flanking AI squads, sniper overwatch, and defensive fortification.',
    enemyCount: 9,
    enemyHpScale: 1.0,
    enemySpeedScale: 1.0,
    enemyDamageScale: 1.0,
    startingSalvage: 100,
    archetypeWeights: { rusher: 0.35, marksman: 0.3, flanker: 0.25, juggernaut: 0.1 },
  },
  {
    level: 3,
    name: 'Level 3 · Apex Spec-Ops',
    subtitle: 'High-intensity combat: Coordinated shield juggernauts and multi-angle breaches.',
    enemyCount: 12,
    enemyHpScale: 1.25,
    enemySpeedScale: 1.15,
    enemyDamageScale: 1.2,
    startingSalvage: 90,
    archetypeWeights: { rusher: 0.25, marksman: 0.25, flanker: 0.3, juggernaut: 0.2 },
  },
  {
    level: 4,
    name: 'Level 4 · Bio-Hazard Siege',
    subtitle: 'Mastery gauntlet: Elite armored shock troops with aggressive suppression.',
    enemyCount: 16,
    enemyHpScale: 1.5,
    enemySpeedScale: 1.25,
    enemyDamageScale: 1.35,
    startingSalvage: 110,
    archetypeWeights: { rusher: 0.2, marksman: 0.25, flanker: 0.25, juggernaut: 0.3 },
  },
];
