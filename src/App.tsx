import React, { useEffect, useRef, useState } from 'react';
import {
  BIOMES,
  WEAPONS,
  OPTIC_ATTACHMENTS,
  BARREL_ATTACHMENTS,
  UNDERBARREL_ATTACHMENTS,
  MAG_ATTACHMENTS,
  WALL_BLUEPRINTS,
  OPERATOR_SKINS,
  OPERATOR_EMOTES,
  TRAINING_LEVELS,
  GameState,
  MapId,
  WeaponId,
  OpticId,
  BarrelId,
  UnderbarrelId,
  MagId,
  SkinId,
  EmoteId,
  WallType,
  BuiltWallEntity,
} from './game/types';
import { computeWeaponStats } from './game/rules';
import { soundEngine } from './game/sound';
import {
  ThreeArena,
  HudTelemetrySnapshot,
  RemoteSquadOperator,
} from './game/ThreeArena';
import {
  BioSciencePanel,
  BioCompoundRecord,
} from './components/BioScienceModal';
import {
  auth,
  onAuthStateChanged,
  signInOperator,
  signOutOperator,
  loadOrCreateOperatorProfile,
  saveOperatorCustomization,
  recordMatchAndProgression,
  User,
  OperatorProfileData,
} from './firebase';

type LobbyTab = 'biomes' | 'weaponsmith' | 'cosmetics' | 'bioscience' | 'squad';

export default function App() {
  // Support ?autostart=1 to boot directly into 'playing'
  const initialAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [gameState, setGameState] = useState<GameState>(
    initialAutostart ? 'playing' : 'title'
  );
  const [mapId, setMapId] = useState<MapId>('alpine-outpost');
  const [trainingLevel, setTrainingLevel] = useState<number>(1);
  const [highestReachedLevel, setHighestReachedLevel] = useState<number>(4);

  // Operator Customization State
  const [callsign, setCallsign] = useState<string>('VANGUARD-01');
  const [skinId, setSkinId] = useState<SkinId>('vanguard-obsidian');
  const [emoteId, setEmoteId] = useState<EmoteId>('salute');
  const [weaponId, setWeaponId] = useState<WeaponId>('vx-carbine');
  const [opticId, setOpticId] = useState<OpticId>('holo-reflex');
  const [barrelId, setBarrelId] = useState<BarrelId>('muzzle-compensator');
  const [underbarrelId, setUnderbarrelId] =
    useState<UnderbarrelId>('angled-foregrip');
  const [magId, setMagId] = useState<MagId>('extended-drum');
  const [selectedWallType, setSelectedWallType] =
    useState<WallType>('barricade');
  const [stimCompoundCid, setStimCompoundCid] = useState<number>(5816);
  const [stimBuff, setStimBuff] = useState({
    label: '+18% Sprint & Slide Velocity · +4 HP/s Trauma Recovery',
    speedMultiplier: 1.18,
    recoilReduction: 0.08,
    regenPerSec: 4,
    damageBonus: 0.05,
  });

  // Lobby Dock Controls
  const [lobbyTab, setLobbyTab] = useState<LobbyTab>('biomes');
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [restartNonce, setRestartNonce] = useState<number>(0);

  // Firebase Auth & Persistent Operator Profile
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [operatorProfile, setOperatorProfile] =
    useState<OperatorProfileData | null>(null);
  const [authStatusText, setAuthStatusText] = useState<string | null>(null);

  // Real-Time WebSocket Multiplayer State
  const [remoteOperators, setRemoteOperators] = useState<RemoteSquadOperator[]>(
    []
  );
  const [sharedWalls, setSharedWalls] = useState<BuiltWallEntity[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string>(
    `op_${Math.random().toString(36).slice(2, 10)}`
  );

  // Outcome Snapshot for Victory / Defeat Modal
  const [outcomeSnapshot, setOutcomeSnapshot] = useState<{
    victory: boolean;
    score: number;
    eliminations: number;
    wallsConstructed: number;
    waveReached: number;
  } | null>(null);

  // Live HUD Telemetry Snapshot
  const [hud, setHud] = useState<HudTelemetrySnapshot>({
    hp: 100,
    maxHp: 100,
    shield: 50,
    maxShield: 50,
    stamina: 100,
    ammo: 45,
    magSize: 45,
    isReloading: false,
    salvage: 120,
    selectedWallType: 'barricade',
    buildModeActive: false,
    movementMode: 'WALK',
    abilityCooldown: 0,
    abilityActiveTimer: 0,
    stimCooldown: 0,
    stimActiveTimer: 0,
    wave: 1,
    enemiesRemaining: 6,
    totalEnemiesInWave: 6,
    score: 0,
    eliminations: 0,
    wallsConstructed: 0,
    activeEmoteBanner: null,
    interactionPrompt: null,
    hitMarkerActive: false,
    killMarkerActive: false,
    damageVignetteIntensity: 0,
    opponentsOverlay: [],
    minimapEntities: {
      playerX: 0,
      playerZ: 20,
      playerYaw: 0,
      enemies: [],
      walls: [],
      crates: [],
      squadmates: [],
    },
  });

  // Mirror game state to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  // Connect to Firebase Auth and load/create Firestore profile
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        clientIdRef.current = user.uid;
        try {
          const loaded = await loadOrCreateOperatorProfile(user, {
            callsign,
            skinId,
            emoteId,
            primaryWeaponId: weaponId,
            opticId,
            barrelId,
            underbarrelId,
            magId,
            stimCompoundCid,
            xp: 0,
            highestTrainingLevel: 4,
            totalEliminations: 0,
            wallsBuilt: 0,
          });
          setOperatorProfile(loaded);
          setCallsign(loaded.callsign);
          setSkinId(loaded.skinId as SkinId);
          setEmoteId(loaded.emoteId as EmoteId);
          setWeaponId(loaded.primaryWeaponId as WeaponId);
          setOpticId(loaded.opticId as OpticId);
          setBarrelId(loaded.barrelId as BarrelId);
          setUnderbarrelId(loaded.underbarrelId as UnderbarrelId);
          setMagId(loaded.magId as MagId);
          setStimCompoundCid(loaded.stimCompoundCid);
          setHighestReachedLevel(Math.max(4, loaded.highestTrainingLevel));
        } catch {
          // Handled via handleFirestoreError
        }
      } else {
        setOperatorProfile(null);
      }
    });
    return () => unsub();
  }, []);

  // Connect to Authoritative WebSocket Server on Port 3000
  useEffect(() => {
    let reconnectTimer = 0;
    let unmounted = false;

    function connectWs() {
      if (unmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'player:join',
            id: clientIdRef.current,
            callsign,
            skinId,
            emoteId,
            weaponId,
            mapId,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.type === 'room:init') {
            const ops = (msg.operators || []) as RemoteSquadOperator[];
            setRemoteOperators(
              ops.filter((o) => o.id !== clientIdRef.current)
            );
            setSharedWalls((msg.walls || []) as BuiltWallEntity[]);
          } else if (msg.type === 'player:updated' && msg.operator) {
            const op = msg.operator as RemoteSquadOperator;
            if (op.id === clientIdRef.current) return;
            setRemoteOperators((prev) => {
              const filtered = prev.filter((item) => item.id !== op.id);
              return [...filtered, op];
            });
          } else if (msg.type === 'player:left' && msg.id) {
            setRemoteOperators((prev) =>
              prev.filter((item) => item.id !== msg.id)
            );
          } else if (msg.type === 'wall:created' && msg.wall) {
            const w = msg.wall as BuiltWallEntity;
            setSharedWalls((prev) => {
              if (prev.some((existing) => existing.id === w.id)) return prev;
              return [...prev, w];
            });
          } else if (msg.type === 'wall:destroyed' && msg.id) {
            setSharedWalls((prev) => prev.filter((w) => w.id !== msg.id));
          }
        } catch {
          // Ignore malformed WS packets
        }
      };

      ws.onclose = () => {
        if (!unmounted) {
          reconnectTimer = window.setTimeout(connectWs, 2500);
        }
      };
    }

    connectWs();
    return () => {
      unmounted = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  const sendMultiplayerUpdate = (payload: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          id: clientIdRef.current,
          ...payload,
        })
      );
    }
  };

  // Persist customization to Firestore when signed in
  const persistLoadoutIfSignedIn = (overrides?: Partial<OperatorProfileData>) => {
    if (!currentUser) return;
    saveOperatorCustomization(currentUser, {
      callsign: overrides?.callsign ?? callsign,
      skinId: overrides?.skinId ?? skinId,
      emoteId: overrides?.emoteId ?? emoteId,
      primaryWeaponId: overrides?.primaryWeaponId ?? weaponId,
      opticId: overrides?.opticId ?? opticId,
      barrelId: overrides?.barrelId ?? barrelId,
      underbarrelId: overrides?.underbarrelId ?? underbarrelId,
      magId: overrides?.magId ?? magId,
      stimCompoundCid: overrides?.stimCompoundCid ?? stimCompoundCid,
    }).catch(() => {});
  };

  const handleStartDeployment = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.body.dataset.state = 'playing';
    setOutcomeSnapshot(null);
    setGameState('playing');
  };

  const handleStateChange = (
    nextState: GameState,
    outcome?: {
      victory: boolean;
      score: number;
      eliminations: number;
      wallsConstructed: number;
      waveReached: number;
    }
  ) => {
    document.body.dataset.state = nextState;
    if (outcome) {
      setOutcomeSnapshot(outcome);
      if (currentUser && operatorProfile) {
        recordMatchAndProgression(currentUser, operatorProfile, {
          mapId,
          trainingLevel,
          score: outcome.score,
          eliminations: outcome.eliminations,
          wallsConstructed: outcome.wallsConstructed,
          outcome: outcome.victory ? 'victory' : 'defeat',
        })
          .then((updated) => {
            setOperatorProfile(updated);
            setHighestReachedLevel(Math.max(4, updated.highestTrainingLevel));
          })
          .catch(() => {});
      }
    }
    setGameState(nextState);
  };

  const currentBiome = BIOMES[mapId];
  const currentWeapon = WEAPONS[weaponId];
  const computedStats = computeWeaponStats(
    weaponId,
    { opticId, barrelId, underbarrelId, magId },
    stimBuff
  );
  const currentSkin = OPERATOR_SKINS[skinId];
  const currentEmote = OPERATOR_EMOTES[emoteId];

  return (
    <main className="relative w-screen h-screen overflow-hidden select-none">
      {/* Isolated Full-Bleed Three.js 3D Viewport */}
      <ThreeArena
        gameState={gameState}
        mapId={mapId}
        trainingLevel={trainingLevel}
        callsign={callsign}
        skinId={skinId}
        emoteId={emoteId}
        weaponId={weaponId}
        opticId={opticId}
        barrelId={barrelId}
        underbarrelId={underbarrelId}
        magId={magId}
        selectedWallType={selectedWallType}
        stimBuff={stimBuff}
        remoteOperators={remoteOperators}
        sharedWalls={sharedWalls}
        restartNonce={restartNonce}
        onSelectWallType={(t) => setSelectedWallType(t)}
        onHudUpdate={setHud}
        onStateChange={handleStateChange}
        onSendMultiplayerUpdate={sendMultiplayerUpdate}
      />

      {/* ===================================================================== */}
      {/* STATE 1: TITLE SCREEN & TACTICAL LOBBY SHELL                          */}
      {/* ===================================================================== */}
      {gameState === 'title' && (
        <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-6 md:p-8">
          {/* Upper Left Negative-Space Hero Title Lockup + Primary Start CTA */}
          <div className="flex flex-col md:flex-row items-start justify-between gap-6">
            <div
              className="pointer-events-auto max-w-xl p-6 rounded-xl border border-white/15 shadow-2xl"
              style={{
                background:
                  'linear-gradient(165deg, rgba(9,13,22,0.92) 0%, rgba(15,23,42,0.84) 100%)',
              }}
            >
              {/* Bespoke Inline SVG Tactical Crest & Title Lockup */}
              <div className="flex items-center gap-4 mb-3">
                <svg
                  viewBox="0 0 64 64"
                  className="w-14 h-14 shrink-0"
                  aria-hidden="true"
                >
                  <polygon
                    points="32,4 58,18 58,46 32,60 6,46 6,18"
                    fill="#0f172a"
                    stroke="#f59e0b"
                    strokeWidth="2.5"
                  />
                  <polygon
                    points="32,11 51,21 51,43 32,53 13,43 13,21"
                    fill="#1e293b"
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M20 42 L32 16 L44 42 L37 42 L32 30 L27 42 Z"
                    fill="#f8fafc"
                  />
                  <circle cx="32" cy="39" r="3.5" fill="#f59e0b" />
                </svg>
                <div>
                  <div className="text-xs font-mono tracking-wider text-amber-400">
                    {currentBiome.regionCode} · {TRAINING_LEVELS[trainingLevel - 1]?.name}
                  </div>
                  <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight text-white">
                    APEX VANGUARD
                  </h1>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Bio-Tactical Multiplayer FPS · Custom Weaponsmith · Fortification Engineering
                  </p>
                </div>
              </div>

              {/* Active Operator Summary Line (Unboxed Metadata with Separators) */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 mb-4 pb-3 border-b border-white/10">
                <span className="font-semibold text-white">{callsign}</span>
                <span aria-hidden="true">·</span>
                <span className="text-sky-300">{currentWeapon.name}</span>
                <span aria-hidden="true">·</span>
                <span>Skin: {currentSkin.name}</span>
                <span aria-hidden="true">·</span>
                <span>Emote: {currentEmote.name}</span>
              </div>

              {/* Primary CTA & Secondary Lobby Actions (<= 3 Menu Actions) */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  data-start="true"
                  onClick={handleStartDeployment}
                  className="px-6 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-base tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-lg"
                >
                  Deploy To {currentBiome.name} [Enter]
                </button>

                <button
                  type="button"
                  onClick={() => setDockCollapsed((prev) => !prev)}
                  className="px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-white/15 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {dockCollapsed ? 'Show Loadout & Maps' : 'Hide Loadout Dock'}
                </button>

                {currentUser ? (
                  <button
                    type="button"
                    onClick={() => signOutOperator()}
                    className="px-3.5 py-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-white/10 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Sign Out ({currentUser.displayName || 'Operator'})
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        setAuthStatusText(null);
                        await signInOperator();
                      } catch {
                        setAuthStatusText(
                          'Cloud Sign-In popup closed. Local profile active.'
                        );
                      }
                    }}
                    className="px-3.5 py-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Google Cloud Sync
                  </button>
                )}
              </div>

              {authStatusText && (
                <p className="text-[11px] text-amber-300 mt-2">{authStatusText}</p>
              )}
            </div>

            {/* Top-Right Audio Utility & Cloud Telemetry Readout */}
            <div
              className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-lg border border-white/15 text-xs"
              style={{ backgroundColor: 'rgba(9,13,22,0.88)' }}
            >
              <div className="font-mono tabular-nums text-slate-300">
                <span>XP {operatorProfile?.xp ?? 0}</span>
                <span className="mx-2 text-slate-600">·</span>
                <span>ELIMS {operatorProfile?.totalEliminations ?? 0}</span>
                <span className="mx-2 text-slate-600">·</span>
                <span>SQUAD ONLINE {remoteOperators.length + 1}</span>
              </div>
              <button
                type="button"
                aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setMuted(soundEngine.toggleMute());
                }}
                className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs cursor-pointer"
              >
                {muted ? 'AUDIO: OFF' : 'AUDIO: ON'}
              </button>
            </div>
          </div>

          {/* Unified Collapsible Bottom Customization Dock */}
          <div className="pointer-events-auto w-full max-w-[1060px] mx-auto">
            <div className="flex items-center justify-between mb-1.5">
              <div
                className="flex items-center gap-1 p-1 rounded-lg border border-white/15"
                style={{ backgroundColor: 'rgba(9,13,22,0.92)' }}
                role="tablist"
                aria-label="Lobby Customization Categories"
              >
                {(
                  [
                    { id: 'biomes', label: '1. Maps & Training Tiers' },
                    { id: 'weaponsmith', label: '2. Weaponsmith & Attachments' },
                    { id: 'cosmetics', label: '3. Operator Skins & Emotes' },
                    { id: 'bioscience', label: '4. Bioscience Stim Lab' },
                    { id: 'squad', label: '5. Fortifications & Squad' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={lobbyTab === tab.id}
                    onClick={() => {
                      setLobbyTab(tab.id);
                      setDockCollapsed(false);
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      lobbyTab === tab.id && !dockCollapsed
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setDockCollapsed((prev) => !prev)}
                className="px-3 py-1.5 rounded-lg border border-white/15 text-xs font-mono text-slate-300 hover:text-white cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5"
                style={{ backgroundColor: 'rgba(9,13,22,0.92)' }}
              >
                <span>{dockCollapsed ? 'Expand Lobby Dock' : 'Collapse Dock'}</span>
              </button>
            </div>

            {!dockCollapsed && (
              <div
                className="rounded-xl border border-white/15 p-4 shadow-2xl"
                style={{ backgroundColor: 'rgba(9,13,22,0.94)' }}
              >
                {/* TAB 1: 5 MAPS / BIOMES & 4 AI TRAINING LEVELS */}
                {lobbyTab === 'biomes' && (
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs font-semibold text-slate-300 mb-2">
                        Select Deployment Biome (5 Photorealistic Sectors)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                        {(Object.keys(BIOMES) as MapId[]).map((id) => {
                          const b = BIOMES[id];
                          const active = mapId === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setMapId(id)}
                              className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer flex flex-col justify-between ${
                                active
                                  ? 'bg-slate-800 border-amber-400 text-white'
                                  : 'bg-slate-900/90 border-white/10 text-slate-300 hover:border-white/25'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <span
                                    className="w-3 h-3 rounded-sm shrink-0"
                                    style={{ backgroundColor: b.accentHex }}
                                  />
                                  <span className="text-[10px] font-mono text-slate-400 truncate">
                                    {b.regionCode.split('·')[0]}
                                  </span>
                                </div>
                                <div className="text-xs font-bold leading-snug">
                                  {b.name}
                                </div>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2">
                                {b.tagline}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/10">
                      <div className="text-xs font-semibold text-slate-300 mb-2">
                        Select AI Combat Training Level
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        {TRAINING_LEVELS.map((tier) => {
                          const locked = tier.level > highestReachedLevel;
                          const active = trainingLevel === tier.level;
                          return (
                            <button
                              key={tier.level}
                              type="button"
                              disabled={locked}
                              onClick={() => setTrainingLevel(tier.level)}
                              className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                                active
                                  ? 'bg-amber-500/15 border-amber-400 text-white'
                                  : locked
                                    ? 'bg-slate-950 border-white/5 text-slate-600 cursor-not-allowed'
                                    : 'bg-slate-900 border-white/10 text-slate-300 hover:border-white/25'
                              }`}
                            >
                              <div className="flex items-center justify-between text-xs font-bold">
                                <span>{tier.name}</span>
                                <span className="font-mono tabular-nums text-[11px] text-amber-400">
                                  {tier.enemyCount} Hostiles
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1">
                                {tier.subtitle}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: WEAPONSMITH & REALISTIC ATTACHMENTS */}
                {lobbyTab === 'weaponsmith' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                    <div className="lg:col-span-8 space-y-2.5">
                      <div>
                        <div className="text-xs font-semibold text-slate-300 mb-1.5">
                          Primary Weapon Platform &amp; Active Ability [Q]
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                          {(Object.keys(WEAPONS) as WeaponId[]).map((id) => {
                            const w = WEAPONS[id];
                            const active = weaponId === id;
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => {
                                  setWeaponId(id);
                                  persistLoadoutIfSignedIn({
                                    primaryWeaponId: id,
                                  });
                                }}
                                className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-sky-500/20 border-sky-400 text-white'
                                    : 'bg-slate-900 border-white/10 text-slate-300 hover:border-white/25'
                                }`}
                              >
                                <div className="text-xs font-bold truncate">
                                  {w.name}
                                </div>
                                <div className="text-[10px] text-sky-300 mt-0.5 truncate">
                                  {w.abilityName}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 4 Attachment Slots */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                        {/* Optic */}
                        <div>
                          <label
                            htmlFor="select-optic"
                            className="block text-[11px] font-medium text-slate-400 mb-1"
                          >
                            Optic Sight
                          </label>
                          <select
                            id="select-optic"
                            value={opticId}
                            onChange={(e) => {
                              const v = e.target.value as OpticId;
                              setOpticId(v);
                              persistLoadoutIfSignedIn({ opticId: v });
                            }}
                            className="w-full bg-slate-900 border border-white/15 rounded-md px-2.5 py-1.5 text-xs text-white"
                          >
                            {(Object.keys(OPTIC_ATTACHMENTS) as OpticId[]).map(
                              (k) => (
                                <option key={k} value={k}>
                                  {OPTIC_ATTACHMENTS[k].name}
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        {/* Barrel */}
                        <div>
                          <label
                            htmlFor="select-barrel"
                            className="block text-[11px] font-medium text-slate-400 mb-1"
                          >
                            Muzzle / Barrel
                          </label>
                          <select
                            id="select-barrel"
                            value={barrelId}
                            onChange={(e) => {
                              const v = e.target.value as BarrelId;
                              setBarrelId(v);
                              persistLoadoutIfSignedIn({ barrelId: v });
                            }}
                            className="w-full bg-slate-900 border border-white/15 rounded-md px-2.5 py-1.5 text-xs text-white"
                          >
                            {(
                              Object.keys(BARREL_ATTACHMENTS) as BarrelId[]
                            ).map((k) => (
                              <option key={k} value={k}>
                                {BARREL_ATTACHMENTS[k].name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Underbarrel */}
                        <div>
                          <label
                            htmlFor="select-underbarrel"
                            className="block text-[11px] font-medium text-slate-400 mb-1"
                          >
                            Underbarrel Rail
                          </label>
                          <select
                            id="select-underbarrel"
                            value={underbarrelId}
                            onChange={(e) => {
                              const v = e.target.value as UnderbarrelId;
                              setUnderbarrelId(v);
                              persistLoadoutIfSignedIn({ underbarrelId: v });
                            }}
                            className="w-full bg-slate-900 border border-white/15 rounded-md px-2.5 py-1.5 text-xs text-white"
                          >
                            {(
                              Object.keys(
                                UNDERBARREL_ATTACHMENTS
                              ) as UnderbarrelId[]
                            ).map((k) => (
                              <option key={k} value={k}>
                                {UNDERBARREL_ATTACHMENTS[k].name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Magazine */}
                        <div>
                          <label
                            htmlFor="select-mag"
                            className="block text-[11px] font-medium text-slate-400 mb-1"
                          >
                            Magazine / Payload
                          </label>
                          <select
                            id="select-mag"
                            value={magId}
                            onChange={(e) => {
                              const v = e.target.value as MagId;
                              setMagId(v);
                              persistLoadoutIfSignedIn({ magId: v });
                            }}
                            className="w-full bg-slate-900 border border-white/15 rounded-md px-2.5 py-1.5 text-xs text-white"
                          >
                            {(Object.keys(MAG_ATTACHMENTS) as MagId[]).map(
                              (k) => (
                                <option key={k} value={k}>
                                  {MAG_ATTACHMENTS[k].name}
                                </option>
                              )
                            )}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Live Ballistic Telemetry Readout */}
                    <div className="lg:col-span-4 bg-slate-900/90 border border-white/10 rounded-lg p-3 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">
                            {currentWeapon.name}
                          </span>
                          <span className="text-[11px] font-mono text-amber-400">
                            {computedStats.suppressed
                              ? 'SUPPRESSED'
                              : 'UNSUPPRESSED'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {currentWeapon.abilityName}:{' '}
                          {currentWeapon.abilityDescription}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-2 my-2 text-center font-mono tabular-nums">
                        <div className="bg-slate-950 p-1.5 rounded border border-white/5">
                          <div className="text-[10px] text-slate-400">DMG</div>
                          <div className="text-sm font-bold text-white">
                            {computedStats.damage}
                          </div>
                        </div>
                        <div className="bg-slate-950 p-1.5 rounded border border-white/5">
                          <div className="text-[10px] text-slate-400">MAG</div>
                          <div className="text-sm font-bold text-sky-400">
                            {computedStats.magSize}
                          </div>
                        </div>
                        <div className="bg-slate-950 p-1.5 rounded border border-white/5">
                          <div className="text-[10px] text-slate-400">RANGE</div>
                          <div className="text-sm font-bold text-emerald-400">
                            {computedStats.range}m
                          </div>
                        </div>
                      </div>

                      <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                        <span>Reload: {computedStats.reloadSec}s</span>
                        <span>ADS FOV: {computedStats.adsFov}°</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: OPERATOR SKINS, CALLSIGN & TACTICAL EMOTES */}
                {lobbyTab === 'cosmetics' && (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-3">
                      <label
                        htmlFor="operator-callsign-input"
                        className="block text-xs font-semibold text-slate-300 mb-1.5"
                      >
                        Operator Callsign
                      </label>
                      <input
                        id="operator-callsign-input"
                        type="text"
                        maxLength={24}
                        value={callsign}
                        onChange={(e) => {
                          setCallsign(e.target.value);
                          persistLoadoutIfSignedIn({
                            callsign: e.target.value,
                          });
                        }}
                        className="w-full bg-slate-900 border border-white/15 rounded-lg px-3 py-2 text-xs font-mono text-white"
                      />
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        Displayed over your operator in squad multiplayer and match logs.
                      </p>
                    </div>

                    <div className="md:col-span-5">
                      <div className="text-xs font-semibold text-slate-300 mb-1.5">
                        Exosuit Armor Skin (5 Material Finishes)
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {(Object.keys(OPERATOR_SKINS) as SkinId[]).map((id) => {
                          const s = OPERATOR_SKINS[id];
                          const active = skinId === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => {
                                setSkinId(id);
                                persistLoadoutIfSignedIn({ skinId: id });
                              }}
                              className={`p-2 rounded-lg border text-left cursor-pointer transition-colors ${
                                active
                                  ? 'bg-slate-800 border-amber-400 text-white'
                                  : 'bg-slate-900 border-white/10 text-slate-300 hover:border-white/25'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <span
                                  className="w-3 h-3 rounded-sm border border-white/20"
                                  style={{ backgroundColor: s.primaryHex }}
                                />
                                <span
                                  className="w-3 h-3 rounded-sm"
                                  style={{ backgroundColor: s.visorHex }}
                                />
                              </div>
                              <div className="text-xs font-bold truncate">
                                {s.name}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                {s.roleTag}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="md:col-span-4">
                      <div className="text-xs font-semibold text-slate-300 mb-1.5">
                        Equipped Squad Emote [V]
                      </div>
                      <div className="grid grid-cols-1 gap-1.5">
                        {(Object.keys(OPERATOR_EMOTES) as EmoteId[]).map(
                          (id) => {
                            const em = OPERATOR_EMOTES[id];
                            const active = emoteId === id;
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => {
                                  setEmoteId(id);
                                  persistLoadoutIfSignedIn({ emoteId: id });
                                }}
                                className={`px-3 py-1.5 rounded-lg border text-left flex items-center justify-between cursor-pointer ${
                                  active
                                    ? 'bg-emerald-500/20 border-emerald-400 text-white'
                                    : 'bg-slate-900 border-white/10 text-slate-300 hover:border-white/25'
                                }`}
                              >
                                <span className="text-xs font-semibold">
                                  {em.name}
                                </span>
                                <span className="text-[10px] font-mono text-emerald-300">
                                  [{em.iconLabel}]
                                </span>
                              </button>
                            );
                          }
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: BIOSCIENCE COMBAT STIMULANT WORKBENCH */}
                {lobbyTab === 'bioscience' && (
                  <BioSciencePanel
                    selectedCid={stimCompoundCid}
                    onSelectCompound={(comp: BioCompoundRecord) => {
                      setStimCompoundCid(comp.cid);
                      setStimBuff(comp.combatBuff);
                      persistLoadoutIfSignedIn({ stimCompoundCid: comp.cid });
                    }}
                  />
                )}

                {/* TAB 5: DEFENSIVE FORTIFICATIONS & MULTIPLAYER SQUAD */}
                {lobbyTab === 'squad' && (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-7">
                      <div className="text-xs font-semibold text-slate-300 mb-2">
                        Defensive Wall Blueprints (Collect Salvage Crates [E] &amp; Build [B] / [F])
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {(Object.keys(WALL_BLUEPRINTS) as WallType[]).map(
                          (type) => {
                            const bp = WALL_BLUEPRINTS[type];
                            const active = selectedWallType === type;
                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={() => setSelectedWallType(type)}
                                className={`p-2.5 rounded-lg border text-left cursor-pointer ${
                                  active
                                    ? 'bg-sky-500/20 border-sky-400 text-white'
                                    : 'bg-slate-900 border-white/10 text-slate-300 hover:border-white/25'
                                }`}
                              >
                                <div className="flex items-center justify-between text-xs font-bold">
                                  <span>
                                    [{bp.keyHint}] {bp.name}
                                  </span>
                                  <span className="font-mono text-amber-400">
                                    {bp.salvageCost} Salvage
                                  </span>
                                </div>
                                <div className="text-[11px] font-mono text-sky-300 mt-0.5">
                                  Integrity: {bp.maxHp} HP
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1">
                                  {bp.description}
                                </p>
                              </button>
                            );
                          }
                        )}
                      </div>
                    </div>

                    <div className="md:col-span-5 bg-slate-900 border border-white/10 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-white">
                          Live Multiplayer Sector Roster
                        </span>
                        <span className="text-[11px] font-mono text-emerald-400">
                          WebSocket Synced · Port 3000
                        </span>
                      </div>
                      <div className="space-y-1.5 text-xs font-mono">
                        <div className="flex items-center justify-between py-1 px-2 rounded bg-slate-950 text-white">
                          <span>{callsign} (YOU)</span>
                          <span className="text-amber-400">
                            {WEAPONS[weaponId].name}
                          </span>
                        </div>
                        {remoteOperators.length === 0 ? (
                          <div className="text-[11px] text-slate-400 py-1">
                            Open another browser tab to join this live multiplayer sector simultaneously.
                          </div>
                        ) : (
                          remoteOperators.map((ro) => (
                            <div
                              key={ro.id}
                              className="flex items-center justify-between py-1 px-2 rounded bg-slate-950 text-sky-300"
                            >
                              <span>{ro.callsign}</span>
                              <span>
                                HP {ro.hp}/{ro.maxHp} · Score {ro.score}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Flat Borderless Single-Line Control Hint in Bottom Safe Margin */}
            <div className="text-center text-xs font-mono text-slate-200 mt-2 hud-stroke whitespace-nowrap overflow-hidden text-ellipsis">
              WASD Move · Shift Sprint · C Slide · Space Jump/Vault/Climb · LMB Fire · Q Ability · F Build Wall · G Bio-Stim · V Emote · Esc Pause
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STATE 2: PLAYING HUD (WORLD-MATCHED, >= 85% CLEAR VIEWPORT)           */}
      {/* ===================================================================== */}
      {gameState === 'playing' && (
        <div className="fixed inset-0 z-10 pointer-events-none overflow-hidden">
          {/* Peripheral Critical Damage Vignette */}
          {hud.damageVignetteIntensity > 0.02 && (
            <div
              className="fixed inset-0 pointer-events-none"
              style={{
                boxShadow: `inset 0 0 110px rgba(220, 38, 38, ${Math.min(
                  0.75,
                  hud.damageVignetteIntensity
                )})`,
              }}
            />
          )}

          {/* 3D-to-2D Projected OVER-THE-HEAD OPPONENT & SQUADMATE HP BARS */}
          {hud.opponentsOverlay.map((opp) => {
            const hpPct = Math.max(
              0,
              Math.min(100, (opp.hp / Math.max(1, opp.maxHp)) * 100)
            );
            const shieldPct =
              opp.maxShield > 0
                ? Math.max(0, Math.min(100, (opp.shield / opp.maxShield) * 100))
                : 0;
            return (
              <div
                key={opp.id}
                style={{
                  transform: `translate3d(${Math.round(
                    opp.screenX - 64
                  )}px, ${Math.round(opp.screenY - 36)}px, 0)`,
                }}
                className="fixed left-0 top-0 w-32 pointer-events-none"
              >
                <div className="flex items-center justify-between text-[10px] font-mono font-bold hud-stroke mb-0.5">
                  <span
                    className={
                      opp.isSquadmate
                        ? 'text-sky-300'
                        : opp.isWindup
                          ? 'text-amber-300'
                          : 'text-white'
                    }
                  >
                    {opp.callsign}
                  </span>
                  <span className="text-slate-300 tabular-nums">
                    {opp.hp} HP
                  </span>
                </div>

                {/* Shield Bar if present */}
                {opp.maxShield > 0 && (
                  <div className="w-full h-1 bg-slate-950/90 rounded-sm overflow-hidden mb-0.5 border border-black/60">
                    <div
                      className="h-full bg-sky-400 transition-transform duration-75 origin-left"
                      style={{ transform: `scaleX(${shieldPct / 100})` }}
                    />
                  </div>
                )}

                {/* Primary Over-Head Health Bar */}
                <div className="w-full h-2 bg-slate-950/90 rounded-sm overflow-hidden border border-black/70">
                  <div
                    className={`h-full transition-transform duration-75 origin-left ${
                      opp.isSquadmate
                        ? 'bg-emerald-400'
                        : hpPct > 50
                          ? 'bg-rose-500'
                          : hpPct > 25
                            ? 'bg-amber-500'
                            : 'bg-red-600'
                    }`}
                    style={{ transform: `scaleX(${hpPct / 100})` }}
                  />
                </div>

                {opp.isWindup && (
                  <div className="text-[10px] font-mono font-bold text-amber-300 text-center mt-0.5 hud-stroke">
                    ▲ INCOMING FIRE ▲
                  </div>
                )}
                {opp.activeEmote && (
                  <div className="text-[10px] font-mono font-bold text-emerald-300 text-center mt-0.5 hud-stroke">
                    [{opp.activeEmote.toUpperCase()}]
                  </div>
                )}
              </div>
            );
          })}

          {/* Exact (50%, 50%) Center Reticle & Hit/Kill Confirmation */}
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <svg viewBox="0 0 48 48" className="w-10 h-10">
              <circle
                cx="24"
                cy="24"
                r="2"
                fill={hud.killMarkerActive ? '#ef4444' : '#38bdf8'}
              />
              <line
                x1="24"
                y1="10"
                x2="24"
                y2="17"
                stroke="#f8fafc"
                strokeWidth="1.8"
              />
              <line
                x1="24"
                y1="31"
                x2="24"
                y2="38"
                stroke="#f8fafc"
                strokeWidth="1.8"
              />
              <line
                x1="10"
                y1="24"
                x2="17"
                y2="24"
                stroke="#f8fafc"
                strokeWidth="1.8"
              />
              <line
                x1="31"
                y1="24"
                x2="38"
                y2="24"
                stroke="#f8fafc"
                strokeWidth="1.8"
              />
              {hud.hitMarkerActive && (
                <g
                  stroke={hud.killMarkerActive ? '#ef4444' : '#f59e0b'}
                  strokeWidth="2.2"
                >
                  <line x1="15" y1="15" x2="20" y2="20" />
                  <line x1="33" y1="15" x2="28" y2="20" />
                  <line x1="15" y1="33" x2="20" y2="28" />
                  <line x1="33" y1="33" x2="28" y2="28" />
                </g>
              )}
            </svg>
          </div>

          {/* Contextual Salvage / Emote Callout near Gaze Center */}
          {(hud.interactionPrompt || hud.activeEmoteBanner) && (
            <div className="fixed left-1/2 top-[58%] -translate-x-1/2 pointer-events-none text-center">
              {hud.interactionPrompt && (
                <div
                  className="px-3 py-1 rounded border border-amber-400/50 text-xs font-mono font-semibold text-amber-300 mb-1"
                  style={{ backgroundColor: 'rgba(9,13,22,0.88)' }}
                >
                  {hud.interactionPrompt}
                </div>
              )}
              {hud.activeEmoteBanner && (
                <div
                  className="px-3 py-1 rounded border border-emerald-400/50 text-xs font-mono font-semibold text-emerald-300"
                  style={{ backgroundColor: 'rgba(9,13,22,0.88)' }}
                >
                  {hud.activeEmoteBanner}: {currentEmote.calloutText}
                </div>
              )}
            </div>
          )}

          {/* CORNER CLUSTER 1 (TOP-LEFT): Tactical Minimap + Wave / Score Telemetry */}
          <div className="fixed top-4 left-4 flex items-start gap-3">
            {/* Live Radar Minimap */}
            <div
              className="w-28 h-28 rounded-lg border border-white/20 p-1.5 relative overflow-hidden"
              style={{ backgroundColor: 'rgba(9,13,22,0.86)' }}
            >
              <svg viewBox="-70 -70 140 140" className="w-full h-full">
                <circle
                  cx="0"
                  cy="0"
                  r="64"
                  fill="none"
                  stroke="rgba(148,163,184,0.25)"
                  strokeWidth="1.5"
                />
                <circle
                  cx="0"
                  cy="0"
                  r="32"
                  fill="none"
                  stroke="rgba(148,163,184,0.18)"
                  strokeWidth="1"
                />
                {/* Salvage Crates */}
                {hud.minimapEntities.crates.map(
                  (c, idx) =>
                    c.ready && (
                      <rect
                        key={`mc-${idx}`}
                        x={c.x - 2}
                        y={c.z - 2}
                        width="4"
                        height="4"
                        fill="#f59e0b"
                      />
                    )
                )}
                {/* Built Defensive Walls */}
                {hud.minimapEntities.walls.map((w, idx) => (
                  <rect
                    key={`mw-${idx}`}
                    x={w.x - 3}
                    y={w.z - 1.5}
                    width="6"
                    height="3"
                    fill="#38bdf8"
                  />
                ))}
                {/* Hostile NPCs */}
                {hud.minimapEntities.enemies.map((e, idx) => (
                  <circle
                    key={`me-${idx}`}
                    cx={e.x}
                    cy={e.z}
                    r={e.isWindup ? 4.2 : 3}
                    fill={e.isWindup ? '#f59e0b' : '#ef4444'}
                  />
                ))}
                {/* Player Arrow */}
                <g
                  transform={`translate(${hud.minimapEntities.playerX}, ${hud.minimapEntities.playerZ}) rotate(${
                    (-hud.minimapEntities.playerYaw * 180) / Math.PI
                  })`}
                >
                  <polygon points="0,-6 4.5,5 -4.5,5" fill="#10b981" />
                </g>
              </svg>
            </div>

            {/* Wave, Hostiles & Score Readout */}
            <div
              className="px-3.5 py-2 rounded-lg border border-white/15 flex items-center gap-4"
              style={{ backgroundColor: 'rgba(9,13,22,0.84)' }}
            >
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400">
                  TRAINING WAVE
                </div>
                <div className="text-xl font-display font-bold tabular-nums text-white">
                  {hud.wave} / 2
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400">
                  HOSTILES
                </div>
                <div className="text-xl font-display font-bold tabular-nums text-rose-400">
                  {hud.enemiesRemaining}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400">
                  SCORE
                </div>
                <div className="text-xl font-display font-bold tabular-nums text-amber-400">
                  {hud.score}
                </div>
              </div>
            </div>
          </div>

          {/* CORNER CLUSTER 2 (TOP-RIGHT): Compact Utility Buttons (Mute, Restart, Pause) */}
          <div className="fixed top-4 right-4 pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              tabIndex={-1}
              aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
              onClick={(e) => {
                e.currentTarget.blur();
                setMuted(soundEngine.toggleMute());
              }}
              className="w-9 h-9 rounded-lg border border-white/15 flex items-center justify-center text-slate-200 hover:bg-slate-800 cursor-pointer"
              style={{ backgroundColor: 'rgba(9,13,22,0.85)' }}
            >
              <span className="text-[10px] font-mono font-bold">
                {muted ? 'MUTE' : 'SND'}
              </span>
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Restart Wave"
              onClick={(e) => {
                e.currentTarget.blur();
                setRestartNonce((n) => n + 1);
              }}
              className="w-9 h-9 rounded-lg border border-white/15 flex items-center justify-center text-slate-200 hover:bg-slate-800 cursor-pointer"
              style={{ backgroundColor: 'rgba(9,13,22,0.85)' }}
            >
              <span className="text-[10px] font-mono font-bold">RST</span>
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause Game"
              onClick={(e) => {
                e.currentTarget.blur();
                document.exitPointerLock?.();
                handleStateChange('paused');
              }}
              className="px-3 h-9 rounded-lg border border-white/15 flex items-center justify-center text-xs font-mono font-bold text-amber-400 hover:bg-slate-800 cursor-pointer"
              style={{ backgroundColor: 'rgba(9,13,22,0.85)' }}
            >
              ESC · PAUSE
            </button>
          </div>

          {/* CORNER CLUSTER 3 (BOTTOM-LEFT): Clean Unobtrusive Operator HP, Shield, Stamina & Movement State */}
          <div
            className="fixed bottom-4 left-4 w-72 rounded-xl border border-white/15 p-3.5"
            style={{ backgroundColor: 'rgba(9,13,22,0.86)' }}
          >
            <div className="flex items-baseline justify-between mb-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  HP
                </span>
                <span className="text-2xl font-display font-bold tabular-nums text-white">
                  {hud.hp}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  / {hud.maxHp}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-sky-300 tabular-nums">
                  SHIELD {hud.shield}
                </span>
                <span>·</span>
                <span className="text-amber-400 font-bold">
                  {hud.movementMode}
                </span>
              </div>
            </div>

            {/* Shield Bar */}
            <div className="w-full h-1.5 bg-slate-950 rounded-sm overflow-hidden mb-1">
              <div
                className="h-full bg-sky-400 transition-transform duration-75 origin-left"
                style={{
                  transform: `scaleX(${Math.max(
                    0,
                    Math.min(1, hud.shield / hud.maxShield)
                  )})`,
                }}
              />
            </div>

            {/* Primary Health Bar */}
            <div className="w-full h-3 bg-slate-950 rounded-sm overflow-hidden mb-2 border border-white/10">
              <div
                className={`h-full transition-transform duration-75 origin-left ${
                  hud.hp > 50
                    ? 'bg-emerald-400'
                    : hud.hp > 25
                      ? 'bg-amber-400'
                      : 'bg-rose-500'
                }`}
                style={{
                  transform: `scaleX(${Math.max(
                    0,
                    Math.min(1, hud.hp / hud.maxHp)
                  )})`,
                }}
              />
            </div>

            {/* Stamina + Bio-Stim Status */}
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
              <span>STAMINA {hud.stamina}%</span>
              <span className="text-emerald-300">
                {hud.stimActiveTimer > 0
                  ? `BIO-STIM ACTIVE (${hud.stimActiveTimer.toFixed(1)}s)`
                  : hud.stimCooldown > 0
                    ? `[G] STIM CD ${hud.stimCooldown.toFixed(0)}s`
                    : '[G] BIO-STIM READY'}
              </span>
            </div>
          </div>

          {/* CORNER CLUSTER 4 (BOTTOM-RIGHT): Ammo, Weapon Ability [Q], Salvage & Wall Builder */}
          <div
            className="fixed bottom-4 right-4 rounded-xl border border-white/15 p-3.5 flex flex-col gap-2 min-w-[300px]"
            style={{ backgroundColor: 'rgba(9,13,22,0.86)' }}
          >
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400">
                  {currentWeapon.name}
                </div>
                <div className="text-xs font-mono text-sky-300">
                  {hud.abilityActiveTimer > 0
                    ? `${currentWeapon.abilityName} ACTIVE (${hud.abilityActiveTimer.toFixed(1)}s)`
                    : hud.abilityCooldown > 0
                      ? `${currentWeapon.abilityName} (${hud.abilityCooldown.toFixed(0)}s)`
                      : `${currentWeapon.abilityName} · READY`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-mono uppercase text-slate-400">
                  {hud.isReloading ? 'RELOADING...' : 'AMMO'}
                </div>
                <div className="text-2xl font-display font-bold tabular-nums text-white">
                  {hud.ammo}{' '}
                  <span className="text-sm text-slate-400">
                    / {hud.magSize}
                  </span>
                </div>
              </div>
            </div>

            {/* Salvage & Wall Construction Strip */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-xs font-mono">
              <div>
                <span className="text-slate-400">SALVAGE: </span>
                <span className="text-amber-400 font-bold tabular-nums">
                  {hud.salvage}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {(Object.keys(WALL_BLUEPRINTS) as WallType[]).map((wt) => {
                  const bp = WALL_BLUEPRINTS[wt];
                  const selected = hud.selectedWallType === wt;
                  return (
                    <span
                      key={wt}
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        selected
                          ? 'bg-sky-500 text-slate-950 font-bold'
                          : 'bg-slate-900 text-slate-400'
                      }`}
                    >
                      [{bp.keyHint}] {bp.salvageCost}
                    </span>
                  );
                })}
                <span className="text-emerald-400 font-semibold ml-1">
                  {hud.buildModeActive ? '[LMB/F] PLACE' : '[F/B] BUILD'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STATE 3: PAUSE MODAL                                                  */}
      {/* ===================================================================== */}
      {gameState === 'paused' && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-6"
          style={{ backgroundColor: 'rgba(9,13,22,0.82)' }}
        >
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <div className="text-xs font-mono text-amber-400 mb-1">
              TACTICAL OPERATIONS SUSPENDED
            </div>
            <h2 className="text-2xl font-display font-bold text-white mb-4">
              Mission Paused
            </h2>

            <div className="grid grid-cols-3 gap-2.5 mb-5 text-center font-mono tabular-nums">
              <div className="p-2.5 rounded-lg bg-slate-950 border border-white/10">
                <div className="text-[10px] text-slate-400">SCORE</div>
                <div className="text-lg font-bold text-amber-400">
                  {hud.score}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-white/10">
                <div className="text-[10px] text-slate-400">ELIMINATIONS</div>
                <div className="text-lg font-bold text-white">
                  {hud.eliminations}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-white/10">
                <div className="text-[10px] text-slate-400">WALLS BUILT</div>
                <div className="text-lg font-bold text-sky-400">
                  {hud.wallsConstructed}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => handleStateChange('playing')}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm cursor-pointer"
              >
                Resume Combat [Esc]
              </button>
              <button
                type="button"
                onClick={() => {
                  setRestartNonce((n) => n + 1);
                  handleStateChange('playing');
                }}
                className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
              >
                Restart Training Wave
              </button>
              <button
                type="button"
                onClick={() => handleStateChange('title')}
                className="w-full py-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-white/10 text-xs font-semibold cursor-pointer"
              >
                Return to Customization Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STATE 4: VICTORY / DEFEAT OUTCOME MODAL                               */}
      {/* ===================================================================== */}
      {gameState === 'gameover' && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-6"
          style={{ backgroundColor: 'rgba(9,13,22,0.86)' }}
        >
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <div
              className={`text-xs font-mono font-bold mb-1 ${
                outcomeSnapshot?.victory ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {outcomeSnapshot?.victory
                ? 'SECTOR SECURED · TRAINING TIER CLEARED'
                : 'OPERATOR DOWN · MISSION TERMINATED'}
            </div>
            <h2 className="text-2xl font-display font-bold text-white mb-4">
              {outcomeSnapshot?.victory
                ? 'Tactical Victory'
                : 'Combat Defeat'}
            </h2>

            <div className="grid grid-cols-3 gap-2.5 mb-5 text-center font-mono tabular-nums">
              <div className="p-2.5 rounded-lg bg-slate-950 border border-white/10">
                <div className="text-[10px] text-slate-400">FINAL SCORE</div>
                <div className="text-lg font-bold text-amber-400">
                  {outcomeSnapshot?.score ?? hud.score}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-white/10">
                <div className="text-[10px] text-slate-400">ELIMINATIONS</div>
                <div className="text-lg font-bold text-white">
                  {outcomeSnapshot?.eliminations ?? hud.eliminations}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-white/10">
                <div className="text-[10px] text-slate-400">WALLS BUILT</div>
                <div className="text-lg font-bold text-sky-400">
                  {outcomeSnapshot?.wallsConstructed ?? hud.wallsConstructed}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                data-start="true"
                onClick={() => {
                  if (outcomeSnapshot?.victory && trainingLevel < 4) {
                    setTrainingLevel((lvl) => Math.min(4, lvl + 1));
                  }
                  setRestartNonce((n) => n + 1);
                  handleStartDeployment();
                }}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm cursor-pointer"
              >
                {outcomeSnapshot?.victory && trainingLevel < 4
                  ? `Advance to Level ${trainingLevel + 1}`
                  : 'Deploy Again'}
              </button>
              <button
                type="button"
                onClick={() => handleStateChange('title')}
                className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
              >
                Return to Lobby &amp; Weaponsmith
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
