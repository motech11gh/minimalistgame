export type GameState = 'title' | 'playing' | 'paused' | 'gameover' | 'replay';

export type ControlScheme = 'auto' | 'pc' | 'touch' | 'console';
export type ActiveInputDevice = 'pc' | 'touch' | 'console';
export type ReplayCameraMode = 'fpv' | 'orbit' | 'drone';

export interface SmartControlConfig {
  enabled: boolean;
  aimAssistMagnetism: boolean;
  autoFireOnLock: boolean;
  autoSprintAndParkour: boolean;
}

export interface VirtualTouchInputState {
  moveX: number; // -1 (left) to 1 (right)
  moveY: number; // -1 (backward) to 1 (forward)
  lookDeltaX: number;
  lookDeltaY: number;
  fireHeld: boolean;
  adsHeld: boolean;
  sprintHeld: boolean;
  jumpHeld: boolean;
  jumpJustPressed: boolean;
  slideJustPressed: boolean;
  reloadJustPressed: boolean;
  abilityJustPressed: boolean;
  buildJustPressed: boolean;
  harvestJustPressed: boolean;
  stimJustPressed: boolean;
  emoteJustPressed: boolean;
}

export type MapId =
  | 'playground'
  | 'forest'
  | 'water-splash'
  | 'theme-park'
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
  | 'cryo-sentinel'
  | 'solaris-valkyrie'
  | 'void-walker'
  | 'crimson-ronin'
  | 'nebula-titan'
  | 'apex-sovereign';

export type BattleModeId =
  | '1v1'
  | '2v2'
  | '3v3'
  | '4v4'
  | 'party-vs'
  | 'battle-royale'
  | 'coop-splitscreen'
  | 'practice';

export type BotHardnessId =
  | 'beginner'
  | 'recruit'
  | 'veteran'
  | 'master'
  | 'legend';

export type LobbyPageId =
  | 'play'
  | 'operator'
  | 'shop'
  | 'maps'
  | 'friends'
  | 'practice';

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
  landmarkType:
    | 'playground-fort'
    | 'forest-watchtower'
    | 'water-slide-tower'
    | 'ferris-wheel'
    | 'radar-dome'
    | 'refinery-silo'
    | 'canopy-bastion'
    | 'obsidian-reactor'
    | 'cryo-monolith';
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
  colorHex?: string;
  themePropType?: 'slide' | 'swing' | 'log-bunker' | 'pool-wall' | 'coaster-arch' | 'standard';
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
  skinId?: SkinId;
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
  isDiscovered?: boolean;
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
  playground: {
    id: 'playground',
    name: 'Tactical Playground Park',
    regionCode: 'SECTOR 06 · URBAN REC ZONE',
    tagline: 'Colorful climbing forts, tube slides, swing sets, and sandpit cover blocks.',
    skyTopHex: 0x0284c7,
    skyHorizonHex: 0xbae6fd,
    fogHex: 0x93c5fd,
    fogDensity: 0.0075,
    sunHex: 0xfffbeb,
    sunIntensity: 2.5,
    hemiSkyHex: 0xbae6fd,
    hemiGroundHex: 0x15803d,
    terrainPrimaryHex: '#16a34a',
    terrainSecondaryHex: '#facc15',
    accentHex: '#f97316',
    elevationScale: 0.9,
    landmarkType: 'playground-fort',
  },
  forest: {
    id: 'forest',
    name: 'Redwood Deep Forest',
    regionCode: 'SECTOR 07 · CASCADIA TIMBERLINE',
    tagline: 'Towering ancient redwoods, mossy boulders, hollow-log trenches, and timber watchtowers.',
    skyTopHex: 0x052e16,
    skyHorizonHex: 0x86efac,
    fogHex: 0x4ade80,
    fogDensity: 0.0095,
    sunHex: 0xfef9c3,
    sunIntensity: 2.1,
    hemiSkyHex: 0x86efac,
    hemiGroundHex: 0x14532d,
    terrainPrimaryHex: '#14532d',
    terrainSecondaryHex: '#3f6212',
    accentHex: '#22c55e',
    elevationScale: 1.75,
    landmarkType: 'forest-watchtower',
  },
  'water-splash': {
    id: 'water-splash',
    name: 'Water Splash Aqua Park',
    regionCode: 'SECTOR 08 · LAGOON SPLASH DOME',
    tagline: 'Hydro-slides, shallow splash pools, aqua fountains, and lifeguard overwatch towers.',
    skyTopHex: 0x0369a1,
    skyHorizonHex: 0x67e8f9,
    fogHex: 0x22d3ee,
    fogDensity: 0.008,
    sunHex: 0xffffff,
    sunIntensity: 2.6,
    hemiSkyHex: 0x67e8f9,
    hemiGroundHex: 0x0e7490,
    terrainPrimaryHex: '#0284c7',
    terrainSecondaryHex: '#38bdf8',
    accentHex: '#06b6d4',
    elevationScale: 0.85,
    landmarkType: 'water-slide-tower',
  },
  'theme-park': {
    id: 'theme-park',
    name: 'Abandoned Theme Park',
    regionCode: 'SECTOR 09 · RUSTED CARNIVAL PIER',
    tagline: 'Rusted Ferris wheel, overgrown rollercoaster arches, ticket booths, and carnival stalls.',
    skyTopHex: 0x3b0764,
    skyHorizonHex: 0xfb923c,
    fogHex: 0xc084fc,
    fogDensity: 0.009,
    sunHex: 0xfed7aa,
    sunIntensity: 2.25,
    hemiSkyHex: 0xe879f9,
    hemiGroundHex: 0x334155,
    terrainPrimaryHex: '#334155',
    terrainSecondaryHex: '#7c2d12',
    accentHex: '#ec4899',
    elevationScale: 1.4,
    landmarkType: 'ferris-wheel',
  },
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
    name: 'Monolithic Whisper Suppressor',
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
    summary: '-28% Vertical Recoil Climb',
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

export interface OperatorSkinDef {
  id: SkinId;
  name: string;
  primaryHex: string;
  secondaryHex: string;
  visorHex: string;
  roleTag: string;
  priceCredits: number;
  rarity: 'Starter' | 'Epic' | 'Legendary' | 'Mythic';
  description: string;
}

export const OPERATOR_SKINS: Record<SkinId, OperatorSkinDef> = {
  'vanguard-obsidian': {
    id: 'vanguard-obsidian',
    name: 'Vanguard Obsidian',
    primaryHex: '#1e293b',
    secondaryHex: '#334155',
    visorHex: '#f59e0b',
    roleTag: 'Spec-Ops Carbonweave',
    priceCredits: 0,
    rarity: 'Starter',
    description: 'Standard-issue matte carbonweave exosuit with amber tactical HUD visor.',
  },
  'alpine-ghost': {
    id: 'alpine-ghost',
    name: 'Alpine Ghost Camo',
    primaryHex: '#e2e8f0',
    secondaryHex: '#64748b',
    visorHex: '#38bdf8',
    roleTag: 'Arctic Recon Exosuit',
    priceCredits: 0,
    rarity: 'Starter',
    description: 'Glacial white thermal-baffled armor plated for high-altitude snow sectors.',
  },
  'dune-stalker': {
    id: 'dune-stalker',
    name: 'Dune Stalker Arid',
    primaryHex: '#b45309',
    secondaryHex: '#78350f',
    visorHex: '#fde047',
    roleTag: 'Desert Thermal Rig',
    priceCredits: 0,
    rarity: 'Starter',
    description: 'Dust-sealed ochre chassis engineered for silica sandstorms and heat dispersion.',
  },
  'emerald-recon': {
    id: 'emerald-recon',
    name: 'Emerald Bio-Hazard',
    primaryHex: '#065f46',
    secondaryHex: '#064e3b',
    visorHex: '#34d399',
    roleTag: 'CBRN Sealed Armor',
    priceCredits: 0,
    rarity: 'Starter',
    description: 'Hermetically sealed CBRN filtration rig for bioluminescent spore zones.',
  },
  'cryo-sentinel': {
    id: 'cryo-sentinel',
    name: 'Cryo Sentinel Titanium',
    primaryHex: '#0f172a',
    secondaryHex: '#0284c7',
    visorHex: '#22d3ee',
    roleTag: 'Zero-Kelvin Plating',
    priceCredits: 0,
    rarity: 'Starter',
    description: 'Deep-freeze titanium alloy with superconducting cyan energy conduits.',
  },
  'solaris-valkyrie': {
    id: 'solaris-valkyrie',
    name: 'Solaris Gold Valkyrie',
    primaryHex: '#d97706',
    secondaryHex: '#451a03',
    visorHex: '#fef08a',
    roleTag: 'Auric Command Frame',
    priceCredits: 450,
    rarity: 'Epic',
    description: 'Anodized solar-gold flight plating forged for vanguard strike commanders.',
  },
  'void-walker': {
    id: 'void-walker',
    name: 'Void Walker Stealth',
    primaryHex: '#312e81',
    secondaryHex: '#090d16',
    visorHex: '#a855f7',
    roleTag: 'Phase-Shift Carapace',
    priceCredits: 650,
    rarity: 'Epic',
    description: 'Radar-absorbent deep indigo composite with ultraviolet optical array.',
  },
  'crimson-ronin': {
    id: 'crimson-ronin',
    name: 'Crimson Ronin Cyber',
    primaryHex: '#991b1b',
    secondaryHex: '#18181b',
    visorHex: '#fb7185',
    roleTag: 'High-Velocity Duelist',
    priceCredits: 800,
    rarity: 'Legendary',
    description: 'Articulated crimson alloy plates built for close-quarters 1v1 and 2v2 duels.',
  },
  'nebula-titan': {
    id: 'nebula-titan',
    name: 'Nebula Titan Exo',
    primaryHex: '#0d9488',
    secondaryHex: '#134e4a',
    visorHex: '#2dd4bf',
    roleTag: 'Heavy Bastion Rig',
    priceCredits: 1100,
    rarity: 'Legendary',
    description: 'Reinforced orbital-drop armor with reactive teal kinetic dampeners.',
  },
  'apex-sovereign': {
    id: 'apex-sovereign',
    name: 'Apex Legend Sovereign',
    primaryHex: '#f8fafc',
    secondaryHex: '#b45309',
    visorHex: '#f59e0b',
    roleTag: 'Mythic Champion Suit',
    priceCredits: 1500,
    rarity: 'Mythic',
    description: 'Prestige platinum-and-gold champion exosuit reserved for Legend-tier victors.',
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

export type DynamicEnvironmentEventId =
  | 'playground-overdrive'
  | 'redwood-mist-surge'
  | 'aqua-geyser-burst'
  | 'carnival-neon-surge'
  | 'cryo-blizzard'
  | 'solar-sandstorm'
  | 'bio-spore-bloom'
  | 'magma-eruption'
  | 'aurora-emp-surge';

export interface DynamicEnvironmentEventDef {
  id: DynamicEnvironmentEventId;
  mapId: MapId;
  name: string;
  subtitle: string;
  accentColor: string;
  fogHex: number;
  fogDensityMult: number;
  sunIntensityMult: number;
  particleHex: number;
  windDriftX: number;
  windDriftZ: number;
  speedMultiplier: number;
  damageMultiplier: number;
  shieldRegenBonus: number;
  hpRegenBonus: number;
  jumpMultiplier: number;
  disruptEnemyShields: boolean;
}

export const DYNAMIC_ENVIRONMENT_EVENTS: Record<MapId, DynamicEnvironmentEventDef> = {
  playground: {
    id: 'playground-overdrive',
    mapId: 'playground',
    name: 'KINETIC BOUNCE OVERDRIVE',
    subtitle: '+28% Jump Vault Height · +15% Sprint Cadence · High-Visibility Flare',
    accentColor: '#f97316',
    fogHex: 0xfde047,
    fogDensityMult: 1.25,
    sunIntensityMult: 1.15,
    particleHex: 0xfacc15,
    windDriftX: 0.3,
    windDriftZ: 0.2,
    speedMultiplier: 1.15,
    damageMultiplier: 1.1,
    shieldRegenBonus: 3.0,
    hpRegenBonus: 2.0,
    jumpMultiplier: 1.28,
    disruptEnemyShields: false,
  },
  forest: {
    id: 'redwood-mist-surge',
    mapId: 'forest',
    name: 'CANOPY SPORE & TIMBER MIST',
    subtitle: '+7 HP/s Forest Bio-Regen · +20% Stealth Cover · Pine Spore Drift',
    accentColor: '#22c55e',
    fogHex: 0x166534,
    fogDensityMult: 1.55,
    sunIntensityMult: 0.82,
    particleHex: 0x4ade80,
    windDriftX: 0.35,
    windDriftZ: -0.3,
    speedMultiplier: 1.1,
    damageMultiplier: 1.08,
    shieldRegenBonus: 2.5,
    hpRegenBonus: 7.0,
    jumpMultiplier: 1.05,
    disruptEnemyShields: false,
  },
  'water-splash': {
    id: 'aqua-geyser-burst',
    mapId: 'water-splash',
    name: 'HYDRO-GEYSER TIDAL SURGE',
    subtitle: '+25% Slide Velocity · +5 Shield/s Cooling · Hydro-Mist Spray',
    accentColor: '#06b6d4',
    fogHex: 0x38bdf8,
    fogDensityMult: 1.4,
    sunIntensityMult: 1.1,
    particleHex: 0x67e8f9,
    windDriftX: -0.4,
    windDriftZ: 0.4,
    speedMultiplier: 1.22,
    damageMultiplier: 1.05,
    shieldRegenBonus: 5.0,
    hpRegenBonus: 2.0,
    jumpMultiplier: 1.18,
    disruptEnemyShields: false,
  },
  'theme-park': {
    id: 'carnival-neon-surge',
    mapId: 'theme-park',
    name: 'CARNIVAL GRID OVERCHARGE',
    subtitle: 'Shatters Hostile Shields · +20% Ballistic Output · Neon Spark Shower',
    accentColor: '#ec4899',
    fogHex: 0x701a75,
    fogDensityMult: 1.5,
    sunIntensityMult: 1.2,
    particleHex: 0xf472b6,
    windDriftX: 0.5,
    windDriftZ: 0.35,
    speedMultiplier: 1.12,
    damageMultiplier: 1.2,
    shieldRegenBonus: 3.5,
    hpRegenBonus: 1.5,
    jumpMultiplier: 1.12,
    disruptEnemyShields: true,
  },
  'alpine-outpost': {
    id: 'cryo-blizzard',
    mapId: 'alpine-outpost',
    name: 'CRYO-BLIZZARD SQUALL',
    subtitle: '+40% Shield Recharge · Icy Crosswind · Frost Visibility Shift',
    accentColor: '#38bdf8',
    fogHex: 0xcbd5e1,
    fogDensityMult: 1.75,
    sunIntensityMult: 0.72,
    particleHex: 0xe0f2fe,
    windDriftX: 0.9,
    windDriftZ: 0.35,
    speedMultiplier: 1.05,
    damageMultiplier: 1.0,
    shieldRegenBonus: 4.5,
    hpRegenBonus: 0,
    jumpMultiplier: 1.0,
    disruptEnemyShields: false,
  },
  'dune-refinery': {
    id: 'solar-sandstorm',
    mapId: 'dune-refinery',
    name: 'SOLAR SILICA SANDSTORM',
    subtitle: '+18% Sprint & Slide Velocity · Thermal Target Lock · Amber Dust Wall',
    accentColor: '#f59e0b',
    fogHex: 0xd97706,
    fogDensityMult: 1.85,
    sunIntensityMult: 0.78,
    particleHex: 0xfbbf24,
    windDriftX: -1.1,
    windDriftZ: 0.4,
    speedMultiplier: 1.18,
    damageMultiplier: 1.08,
    shieldRegenBonus: 1.5,
    hpRegenBonus: 0,
    jumpMultiplier: 1.0,
    disruptEnemyShields: false,
  },
  'emerald-citadel': {
    id: 'bio-spore-bloom',
    mapId: 'emerald-citadel',
    name: 'BIOLUMINESCENT SPORE BLOOM',
    subtitle: '+6 HP/s Cellular Bio-Regen · +25% Salvage Yield · Spore Canopy',
    accentColor: '#10b981',
    fogHex: 0x059669,
    fogDensityMult: 1.5,
    sunIntensityMult: 0.88,
    particleHex: 0x34d399,
    windDriftX: 0.25,
    windDriftZ: -0.25,
    speedMultiplier: 1.08,
    damageMultiplier: 1.05,
    shieldRegenBonus: 2.0,
    hpRegenBonus: 6.0,
    jumpMultiplier: 1.05,
    disruptEnemyShields: false,
  },
  'obsidian-foundry': {
    id: 'magma-eruption',
    mapId: 'obsidian-foundry',
    name: 'THERMAL MAGMA ERUPTION',
    subtitle: '+25% Ballistic Damage Overcharge · Thermal Updraft (+22% Jump) · Ember Rain',
    accentColor: '#ef4444',
    fogHex: 0x991b1b,
    fogDensityMult: 1.6,
    sunIntensityMult: 1.35,
    particleHex: 0xf97316,
    windDriftX: 0.4,
    windDriftZ: -0.5,
    speedMultiplier: 1.06,
    damageMultiplier: 1.25,
    shieldRegenBonus: 1.0,
    hpRegenBonus: 0,
    jumpMultiplier: 1.22,
    disruptEnemyShields: false,
  },
  'cryo-spire': {
    id: 'aurora-emp-surge',
    mapId: 'cryo-spire',
    name: 'AURORA EMP IONIC SURGE',
    subtitle: 'Shatters Hostile Energy Shields · -40% Ability Cooldown · Ionized Sky',
    accentColor: '#22d3ee',
    fogHex: 0x0891b2,
    fogDensityMult: 1.4,
    sunIntensityMult: 1.3,
    particleHex: 0x67e8f9,
    windDriftX: -0.5,
    windDriftZ: 0.5,
    speedMultiplier: 1.12,
    damageMultiplier: 1.15,
    shieldRegenBonus: 5.0,
    hpRegenBonus: 2.5,
    jumpMultiplier: 1.1,
    disruptEnemyShields: true,
  },
};

export interface ReplayHighlightMarker {
  id: string;
  timestamp: number;
  frameIndex: number;
  type: 'ELIMINATION' | 'HEADSHOT' | 'WALL_BUILT' | 'ENV_EVENT' | 'ABILITY' | 'WAVE_CLEAR';
  label: string;
  colorHex: string;
}

export interface ReplayFrameSnapshot {
  timestamp: number;
  playerX: number;
  playerY: number;
  playerZ: number;
  playerYaw: number;
  playerPitch: number;
  eyeHeight: number;
  hp: number;
  shield: number;
  score: number;
  eliminations: number;
  movementMode: PlayerPhysicsState['movementMode'];
  firedShot: boolean;
  activeEventId: DynamicEnvironmentEventId | null;
  npcs: Array<{
    id: string;
    callsign: string;
    archetype: NpcArchetype;
    x: number;
    y: number;
    z: number;
    rotY: number;
    hp: number;
    maxHp: number;
    state: NpcEntity['state'];
  }>;
  walls: Array<{
    id: string;
    type: WallType;
    x: number;
    y: number;
    z: number;
    rotY: number;
    hp: number;
  }>;
}

export interface MatchReplayRecording {
  id: string;
  mapId: MapId;
  trainingLevel: number;
  callsign: string;
  weaponId: WeaponId;
  skinId: SkinId;
  durationSec: number;
  finalScore: number;
  finalEliminations: number;
  frames: ReplayFrameSnapshot[];
  highlights: ReplayHighlightMarker[];
}

export interface BattleModeDefinition {
  id: BattleModeId;
  name: string;
  shortLabel: string;
  allyCount: number; // Number of friendly AI/Squad teammates alongside Player 1
  enemyCount: number; // Number of hostile bots per wave (or initial active pool in Battle Royale)
  totalCombatants: number; // Total players in match (e.g. 2 for 1v1, 4 for 2v2, 100 for Battle Royale)
  waves: number;
  arenaRadius: number; // Mode-specific map radius in meters (smaller for 1v1/2v2, huge for Battle Royale)
  arenaSizeLabel: string; // Human-readable map size label for this mode
  useChunkStreaming: boolean; // True ONLY in non-fixed player modes (Battle Royale 100 & Practice)
  xpMultiplier: number;
  creditWinBonus: number;
  description: string;
  isSplitScreen?: boolean;
  isPractice?: boolean;
  isPartyVs?: boolean;
  isBattleRoyale?: boolean;
}

export const BATTLE_MODES: Record<BattleModeId, BattleModeDefinition> = {
  '1v1': {
    id: '1v1',
    name: '1v1 Tactical Duel',
    shortLabel: '1v1 DUEL',
    allyCount: 0,
    enemyCount: 1,
    totalCombatants: 2,
    waves: 1,
    arenaRadius: 24,
    arenaSizeLabel: '48m × 48m Compact Duel Arena (No Chunk Streaming)',
    useChunkStreaming: false,
    xpMultiplier: 1.0,
    creditWinBonus: 140,
    description: 'Pure 1v1 duel against exactly 1 opponent on a compact 48m × 48m tailored map.',
  },
  '2v2': {
    id: '2v2',
    name: '2v2 Wingman Strike',
    shortLabel: '2v2 WINGMAN',
    allyCount: 1,
    enemyCount: 2,
    totalCombatants: 4,
    waves: 1,
    arenaRadius: 34,
    arenaSizeLabel: '68m × 68m Small Wingman Arena (No Chunk Streaming)',
    useChunkStreaming: false,
    xpMultiplier: 1.2,
    creditWinBonus: 180,
    description: 'Real 2v2 Wingman clash (You + 1 Ally vs 2 Rivals) on a small 68m × 68m arena.',
  },
  '3v3': {
    id: '3v3',
    name: '3v3 Squad Skirmish',
    shortLabel: '3v3 SQUAD',
    allyCount: 2,
    enemyCount: 3,
    totalCombatants: 6,
    waves: 1,
    arenaRadius: 46,
    arenaSizeLabel: '92m × 92m Medium Squad Arena (No Chunk Streaming)',
    useChunkStreaming: false,
    xpMultiplier: 1.35,
    creditWinBonus: 220,
    description: 'Real 3v3 fireteam skirmish (3 vs 3) on a medium 92m × 92m tactical sector.',
  },
  '4v4': {
    id: '4v4',
    name: '4v4 Maximum Strike Force',
    shortLabel: '4v4 STRIKE',
    allyCount: 3,
    enemyCount: 4,
    totalCombatants: 8,
    waves: 1,
    arenaRadius: 58,
    arenaSizeLabel: '116m × 116m Full Strike Arena (No Chunk Streaming)',
    useChunkStreaming: false,
    xpMultiplier: 1.55,
    creditWinBonus: 280,
    description: 'Full 4v4 squad warfare (4 vs 4) across a dedicated 116m × 116m battleground.',
  },
  'party-vs': {
    id: 'party-vs',
    name: 'Party Mode (Play vs Your Party)',
    shortLabel: 'VS PARTY',
    allyCount: 0,
    enemyCount: 1,
    totalCombatants: 2,
    waves: 1,
    arenaRadius: 30,
    arenaSizeLabel: '60m × 60m Party Showdown Arena (No Chunk Streaming)',
    useChunkStreaming: false,
    xpMultiplier: 1.4,
    creditWinBonus: 210,
    description: 'Fight head-to-head against the friend(s) currently in your Party on a 60m × 60m arena!',
    isPartyVs: true,
  },
  'battle-royale': {
    id: 'battle-royale',
    name: '100-Player Battle Royale',
    shortLabel: '100P ROYALE',
    allyCount: 0,
    enemyCount: 99,
    totalCombatants: 100,
    waves: 1,
    arenaRadius: 280,
    arenaSizeLabel: '560m × 560m Massive Chunk-Generated Island',
    useChunkStreaming: true,
    xpMultiplier: 2.0,
    creditWinBonus: 450,
    description: '100 combatants drop onto a huge chunk-streaming map with 25-block stealth discovery zones.',
    isBattleRoyale: true,
  },
  'coop-splitscreen': {
    id: 'coop-splitscreen',
    name: 'Offline Co-Op Split-Screen',
    shortLabel: '2P SPLIT-SCREEN',
    allyCount: 1,
    enemyCount: 2,
    totalCombatants: 4,
    waves: 1,
    arenaRadius: 42,
    arenaSizeLabel: '84m × 84m Co-Op Arena (No Chunk Streaming)',
    useChunkStreaming: false,
    xpMultiplier: 1.45,
    creditWinBonus: 240,
    description: 'Dual-viewport local Co-Op: P1 (WASD/Mouse) + P2 (Arrows/Enter or Pad 2).',
    isSplitScreen: true,
  },
  practice: {
    id: 'practice',
    name: 'Open Chunk Practice & Range',
    shortLabel: 'CHUNK PRACTICE',
    allyCount: 0,
    enemyCount: 5,
    totalCombatants: 6,
    waves: 1,
    arenaRadius: 9999,
    arenaSizeLabel: 'Infinite 64m × 64m Procedural Chunk World',
    useChunkStreaming: true,
    xpMultiplier: 0.85,
    creditWinBonus: 90,
    description: 'Infinite procedural chunk streaming world with 300 salvage and 25-block stealth AI.',
    isPractice: true,
  },
};

export interface BotHardnessDefinition {
  id: BotHardnessId;
  name: string;
  rankIndex: number;
  hpScale: number;
  speedScale: number;
  damageScale: number;
  windupSec: number;
  xpCreditMultiplier: number;
  accentColor: string;
  description: string;
}

export const BOT_HARDNESS_TIERS: Record<BotHardnessId, BotHardnessDefinition> = {
  beginner: {
    id: 'beginner',
    name: 'Beginner',
    rankIndex: 1,
    hpScale: 0.7,
    speedScale: 0.68,
    damageScale: 0.55,
    windupSec: 1.35,
    xpCreditMultiplier: 0.85,
    accentColor: '#38bdf8',
    description: 'Relaxed bot cadence, wide telegraph windows, and reduced incoming damage.',
  },
  recruit: {
    id: 'recruit',
    name: 'Recruit',
    rankIndex: 2,
    hpScale: 0.9,
    speedScale: 0.85,
    damageScale: 0.8,
    windupSec: 1.05,
    xpCreditMultiplier: 1.0,
    accentColor: '#10b981',
    description: 'Standard combat AI with balanced patrol, cover seeking, and burst fire.',
  },
  veteran: {
    id: 'veteran',
    name: 'Veteran',
    rankIndex: 3,
    hpScale: 1.1,
    speedScale: 1.02,
    damageScale: 1.0,
    windupSec: 0.8,
    xpCreditMultiplier: 1.3,
    accentColor: '#f59e0b',
    description: 'Coordinated flanking maneuvers, faster target acquisition, and shield discipline.',
  },
  master: {
    id: 'master',
    name: 'Master',
    rankIndex: 4,
    hpScale: 1.35,
    speedScale: 1.18,
    damageScale: 1.25,
    windupSec: 0.58,
    xpCreditMultiplier: 1.65,
    accentColor: '#f97316',
    description: 'High-velocity spec-ops bots with aggressive strafe-dodging and heavy suppression.',
  },
  legend: {
    id: 'legend',
    name: 'Legend',
    rankIndex: 5,
    hpScale: 1.65,
    speedScale: 1.35,
    damageScale: 1.5,
    windupSec: 0.42,
    xpCreditMultiplier: 2.25,
    accentColor: '#ef4444',
    description: 'Maximum lethality apex AI with relentless multi-angle breaches and +125% XP/Credits.',
  },
};

export interface FriendProfile {
  friendCode: string;
  username: string;
  level: number;
  skinId: SkinId;
  status: 'online' | 'in-match' | 'offline';
  online: boolean;
  inParty: boolean;
}

export interface FriendRequestRecord {
  id: string;
  fromCode: string;
  fromUsername: string;
  toCode: string;
  toUsername: string;
  direction: 'incoming' | 'outgoing';
  status: 'pending' | 'accepted' | 'declined';
  timestamp: number;
}

export interface PartyInviteRecord {
  id: string;
  fromCode: string;
  fromUsername: string;
  fromLevel: number;
  fromSkinId: SkinId;
  toCode: string;
  toUsername: string;
  toLevel: number;
  toSkinId: SkinId;
  direction: 'incoming' | 'outgoing';
  status: 'pending' | 'accepted' | 'declined';
  timestamp: number;
}

export type WeatherAtmosphereMode =
  | 'light-rain-blur'
  | 'storm-squall'
  | 'mist-veil';

export interface ProceduralChunkBlueprint {
  cx: number;
  cz: number;
  key: string;
  centerX: number;
  centerZ: number;
  obstacles: ObstacleBox[];
  trees: Array<{
    x: number;
    y: number;
    z: number;
    scale: number;
    rotY: number;
    tintOffset: number;
  }>;
  salvageCrates: SalvageNode[];
  hasOutpostSpire: boolean;
  spirePos: { x: number; y: number; z: number } | null;
}

export interface SplitScreenP2Telemetry {
  active: boolean;
  callsign: string;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  ammo: number;
  magSize: number;
  eliminations: number;
  movementMode: PlayerPhysicsState['movementMode'];
}
