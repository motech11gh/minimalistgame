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
  BATTLE_MODES,
  BOT_HARDNESS_TIERS,
  GameState,
  MapId,
  BattleModeId,
  BotHardnessId,
  LobbyPageId,
  FriendProfile,
  FriendRequestRecord,
  PartyInviteRecord,
  WeatherAtmosphereMode,
  WeaponId,
  OpticId,
  BarrelId,
  UnderbarrelId,
  MagId,
  SkinId,
  EmoteId,
  WallType,
  BuiltWallEntity,
  ControlScheme,
  ActiveInputDevice,
  VirtualTouchInputState,
  SmartControlConfig,
  ReplayCameraMode,
  MatchReplayRecording,
} from './game/types';
import {
  computeWeaponStats,
  calculateMatchXpAndCredits,
  computeOperatorLevelFromXp,
  generatePlayerFriendCode,
  normalizeFriendCode,
  BOT_DISCOVERY_RADIUS,
} from './game/rules';
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
import { TouchControlsOverlay } from './components/TouchControlsOverlay';
import {
  auth,
  onAuthStateChanged,
  ensureValidAuthUser,
  signInOperator,
  signOutOperator,
  loadOrCreateOperatorProfile,
  saveOperatorCustomization,
  recordMatchAndProgression,
  sendFirestoreFriendRequest,
  User,
  OperatorProfileData,
} from './firebase';

const STARTER_UNLOCKED_SKINS: SkinId[] = [
  'vanguard-obsidian',
  'alpine-ghost',
  'dune-stalker',
  'emerald-recon',
  'cryo-sentinel',
];

export default function App() {
  // Support ?autostart=1 to boot directly into 'playing'
  const initialAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [gameState, setGameState] = useState<GameState>(
    initialAutostart ? 'playing' : 'title'
  );
  const [lobbyPage, setLobbyPage] = useState<LobbyPageId>('play');
  const [accountMinimized, setAccountMinimized] = useState<boolean>(true);

  // Match Mode, Bot Hardness, Weather Atmosphere & Map State
  const [mapId, setMapId] = useState<MapId>('alpine-outpost');
  const [battleMode, setBattleMode] = useState<BattleModeId>('2v2');
  const [botHardness, setBotHardness] = useState<BotHardnessId>('veteran');
  const [weatherMode, setWeatherMode] =
    useState<WeatherAtmosphereMode>('light-rain-blur');
  const [trainingLevel, setTrainingLevel] = useState<number>(1);
  const [highestReachedLevel, setHighestReachedLevel] = useState<number>(4);

  // Operator Account, Friend Code, XP, Credits & Customization State
  const [callsign, setCallsign] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('apex_username') || 'VANGUARD_01';
    }
    return 'VANGUARD_01';
  });
  const [friendCode, setFriendCode] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('apex_friend_code');
      if (saved && /^VX-[A-Z0-9]{6}$/.test(saved)) {
        return saved;
      }
      const generated = generatePlayerFriendCode(
        `${localStorage.getItem('apex_username') || 'VANGUARD_01'}_${Math.random()
          .toString(36)
          .slice(2, 8)}`
      );
      try {
        localStorage.setItem('apex_friend_code', generated);
      } catch {
        // Ignore storage error
      }
      return generated;
    }
    return 'VX-7A9K2M';
  });
  const [codeCopiedToast, setCodeCopiedToast] = useState<boolean>(false);
  const [accountRegistered, setAccountRegistered] = useState<boolean>(true);
  const [usernameDraft, setUsernameDraft] = useState<string>(callsign);
  const [accountToast, setAccountToast] = useState<string | null>(null);

  const [localXp, setLocalXp] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('apex_xp');
      const saved = raw !== null ? Number(raw) : NaN;
      return Number.isFinite(saved) && saved > 0 ? saved : 650;
    }
    return 650;
  });
  const [localCredits, setLocalCredits] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('apex_credits');
      const saved = raw !== null ? Number(raw) : NaN;
      return Number.isFinite(saved) && saved > 0 ? saved : 950;
    }
    return 950;
  });
  const [unlockedSkins, setUnlockedSkins] = useState<SkinId[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('apex_unlocked_skins');
        if (raw) {
          const parsed = JSON.parse(raw) as SkinId[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            return Array.from(new Set([...STARTER_UNLOCKED_SKINS, ...parsed]));
          }
        }
      } catch {
        // Ignore parse error
      }
    }
    return STARTER_UNLOCKED_SKINS;
  });

  const [skinId, setSkinId] = useState<SkinId>('vanguard-obsidian');
  const [shopPreviewSkinId, setShopPreviewSkinId] =
    useState<SkinId>('solaris-valkyrie');
  const [shopToast, setShopToast] = useState<string | null>(null);
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

  // Real Online Friends, Friend Code Requests & Party Handshake State (Zero Bot Friends)
  const [friendsList, setFriendsList] = useState<FriendProfile[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequestRecord[]>(
    []
  );
  const [partyInvites, setPartyInvites] = useState<PartyInviteRecord[]>([]);
  const [partyMembers, setPartyMembers] = useState<FriendProfile[]>([]);
  const [friendCodeInput, setFriendCodeInput] = useState<string>('');
  const [friendStatusMsg, setFriendStatusMsg] = useState<string | null>(null);
  const [friendErrorMsg, setFriendErrorMsg] = useState<string | null>(null);

  const [muted, setMuted] = useState<boolean>(false);
  const [restartNonce, setRestartNonce] = useState<number>(0);

  // Cross-Platform Input Support (PC Keyboard/Mouse · Mobile Touch · Console Controller)
  const [controlScheme, setControlScheme] = useState<ControlScheme>('auto');
  const [detectedDevice, setDetectedDevice] = useState<ActiveInputDevice>(() =>
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 1)
      ? 'touch'
      : 'pc'
  );
  const [gamepadLabel, setGamepadLabel] = useState<string | null>(null);
  const touchInputRef = useRef<VirtualTouchInputState>({
    moveX: 0,
    moveY: 0,
    lookDeltaX: 0,
    lookDeltaY: 0,
    fireHeld: false,
    adsHeld: false,
    sprintHeld: false,
    jumpHeld: false,
    jumpJustPressed: false,
    slideJustPressed: false,
    reloadJustPressed: false,
    abilityJustPressed: false,
    buildJustPressed: false,
    harvestJustPressed: false,
    stimJustPressed: false,
    emoteJustPressed: false,
  });

  const effectiveInputDevice: ActiveInputDevice =
    controlScheme === 'auto' ? detectedDevice : controlScheme;

  // Smart Control Assist Configuration
  const [smartControl, setSmartControl] = useState<SmartControlConfig>({
    enabled: true,
    aimAssistMagnetism: true,
    autoFireOnLock: true,
    autoSprintAndParkour: true,
  });

  // Dynamic Environment Event Trigger Nonce
  const [triggerEventNonce, setTriggerEventNonce] = useState<number>(0);

  // 3D Tactical Match Replay State
  const [replayRecording, setReplayRecording] =
    useState<MatchReplayRecording | null>(null);
  const [replayTimeSec, setReplayTimeSec] = useState<number>(0);
  const [replayPlaying, setReplayPlaying] = useState<boolean>(true);
  const [replaySpeed, setReplaySpeed] = useState<number>(1);
  const [replayCameraMode, setReplayCameraMode] =
    useState<ReplayCameraMode>('orbit');

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

  // Outcome Snapshot & Custom XP/Credits Breakdown for Victory / Defeat Modal
  const [outcomeSnapshot, setOutcomeSnapshot] = useState<{
    victory: boolean;
    score: number;
    eliminations: number;
    wallsConstructed: number;
    waveReached: number;
    durationSec: number;
    rewards: ReturnType<typeof calculateMatchXpAndCredits>;
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
    totalWaves: 2,
    matchElapsedSec: 0,
    enemiesRemaining: 4,
    totalEnemiesInWave: 4,
    score: 0,
    eliminations: 0,
    wallsConstructed: 0,
    activeEmoteBanner: null,
    interactionPrompt: null,
    hitMarkerActive: false,
    killMarkerActive: false,
    damageVignetteIntensity: 0,
    smartTargetLocked: false,
    activeChunkKey: '0,0',
    loadedChunkCount: 25,
    chunksDiscovered: 1,
    discoveredByCount: 0,
    arenaSizeLabel: '68m × 68m Tactical Skirmish Map',
    useChunkStreaming: false,
    brPlayersAlive: null,
    weatherMode: 'light-rain-blur',
    activeEnvironmentEvent: null,
    nextEventCooldownSec: 6.5,
    splitScreenP2: null,
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

  // Persist local XP, Credits, Username, Friend Code, and Unlocked Skins
  useEffect(() => {
    try {
      localStorage.setItem('apex_xp', String(localXp));
      localStorage.setItem('apex_credits', String(localCredits));
      localStorage.setItem('apex_username', callsign);
      localStorage.setItem('apex_friend_code', friendCode);
      localStorage.setItem(
        'apex_unlocked_skins',
        JSON.stringify(unlockedSkins)
      );
    } catch {
      // Ignore storage quota issues
    }
  }, [localXp, localCredits, callsign, friendCode, unlockedSkins]);

  // Mirror game state to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  // Sync Online Account, Personal Friend Code & Friends State with Backend API
  const syncFriendsAndAccount = async (
    usernameToSync = callsign,
    codeToSync = friendCode
  ) => {
    const levelInfo = computeOperatorLevelFromXp(localXp);
    try {
      const regRes = await fetch('/api/accounts/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendCode: codeToSync,
          username: usernameToSync,
          skinId,
          level: levelInfo.level,
          xp: localXp,
          credits: localCredits,
          status: gameState === 'playing' ? 'in-match' : 'online',
        }),
      });
      if (regRes.ok) {
        const regData = await regRes.json();
        if (regData?.account?.friendCode) {
          setFriendCode(regData.account.friendCode);
        }
      }
      const res = await fetch(
        `/api/friends/state?friendCode=${encodeURIComponent(
          codeToSync
        )}&username=${encodeURIComponent(usernameToSync)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.friends)) {
          setFriendsList(data.friends);
        }
        if (Array.isArray(data.requests)) {
          setFriendRequests(data.requests);
        }
        if (Array.isArray(data.partyInvites)) {
          setPartyInvites(data.partyInvites);
        }
        if (Array.isArray(data.partyMembers)) {
          setPartyMembers(data.partyMembers);
        }
      }
    } catch {
      // Offline fallback if needed
    }
  };

  useEffect(() => {
    syncFriendsAndAccount(callsign, friendCode);
  }, [callsign, friendCode, skinId, gameState]);

  // Automatic Hardware Input Mutual-Exclusion Listener
  useEffect(() => {
    const onKeyDown = () => {
      setDetectedDevice('pc');
      setControlScheme('auto');
    };
    const onTouchStart = () => {
      setDetectedDevice('touch');
      setControlScheme('auto');
    };
    const onGamepadConnected = (e: GamepadEvent) => {
      setDetectedDevice('console');
      setControlScheme('auto');
      setGamepadLabel(e.gamepad?.id || 'Controller');
    };
    window.addEventListener('keydown', onKeyDown, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('gamepadconnected', onGamepadConnected);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('gamepadconnected', onGamepadConnected);
    };
  }, []);

  // Advance 3D Match Replay timeline when in 'replay' state
  useEffect(() => {
    if (gameState !== 'replay' || !replayPlaying || !replayRecording) return;
    const duration = Math.max(1, replayRecording.durationSec);
    let lastTs = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const dt = Math.min(0.1, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;
      setReplayTimeSec((prev) => {
        const next = prev + dt * replaySpeed;
        return next > duration ? 0 : next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [gameState, replayPlaying, replaySpeed, replayRecording]);

  // Connect to Firebase Auth and load/create Firestore profile
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCurrentUser(null);
        setOperatorProfile(null);
        return;
      }
      const validUser = await ensureValidAuthUser(user);
      if (!validUser) {
        setCurrentUser(null);
        setOperatorProfile(null);
        return;
      }
      setCurrentUser(validUser);
      clientIdRef.current = validUser.uid;
      try {
        const loaded = await loadOrCreateOperatorProfile(validUser, {
          callsign,
          skinId,
          emoteId,
          primaryWeaponId: weaponId,
          opticId,
          barrelId,
          underbarrelId,
          magId,
          stimCompoundCid,
          xp: localXp,
          credits: localCredits,
          highestTrainingLevel: 4,
          totalEliminations: 0,
          wallsBuilt: 0,
        });
        setOperatorProfile(loaded);
        setCallsign(loaded.callsign);
        setUsernameDraft(loaded.callsign);
        setSkinId(loaded.skinId as SkinId);
        setEmoteId(loaded.emoteId as EmoteId);
        setWeaponId(loaded.primaryWeaponId as WeaponId);
        setOpticId(loaded.opticId as OpticId);
        setBarrelId(loaded.barrelId as BarrelId);
        setUnderbarrelId(loaded.underbarrelId as UnderbarrelId);
        setMagId(loaded.magId as MagId);
        setStimCompoundCid(loaded.stimCompoundCid);
        setLocalXp((prev) => Math.max(prev, loaded.xp));
        setLocalCredits((prev) => Math.max(prev, loaded.credits ?? 600));
        setHighestReachedLevel(Math.max(4, loaded.highestTrainingLevel));
      } catch {
        // Handled via handleFirestoreError or local fallback
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
          } else if (
            msg.type === 'friend:request' ||
            msg.type === 'friend:responded' ||
            msg.type === 'party:invite' ||
            msg.type === 'party:responded' ||
            msg.type === 'party:updated' ||
            msg.type === 'account:status' ||
            msg.type === 'account:registered'
          ) {
            // Real-time refresh of friend requests, party invites & accepted party members
            const savedCode =
              localStorage.getItem('apex_friend_code') || friendCode;
            const savedName =
              localStorage.getItem('apex_username') || callsign;
            fetch(
              `/api/friends/state?friendCode=${encodeURIComponent(
                savedCode
              )}&username=${encodeURIComponent(savedName)}`
            )
              .then((r) => (r.ok ? r.json() : null))
              .then((data) => {
                if (!data) return;
                if (Array.isArray(data.friends)) setFriendsList(data.friends);
                if (Array.isArray(data.requests))
                  setFriendRequests(data.requests);
                if (Array.isArray(data.partyInvites))
                  setPartyInvites(data.partyInvites);
                if (Array.isArray(data.partyMembers))
                  setPartyMembers(data.partyMembers);
              })
              .catch(() => {});
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
      credits: overrides?.credits ?? localCredits,
    }).catch(() => {});
  };

  const handleCopyFriendCode = () => {
    try {
      navigator.clipboard?.writeText(friendCode);
    } catch {
      // Ignore clipboard permission in headless preview
    }
    setCodeCopiedToast(true);
    setTimeout(() => setCodeCopiedToast(false), 2200);
  };

  const handleSaveUsernameAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = usernameDraft
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 20);
    if (cleaned.length < 2) {
      setAccountToast('Username must be at least 2 characters.');
      return;
    }
    setCallsign(cleaned);
    setUsernameDraft(cleaned);
    setAccountRegistered(true);
    persistLoadoutIfSignedIn({ callsign: cleaned });
    await syncFriendsAndAccount(cleaned, friendCode);
    setAccountToast(`Online Account [${cleaned}] (${friendCode}) synced!`);
    setTimeout(() => setAccountToast(null), 3200);
  };

  const handleSendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawTarget = friendCodeInput.trim();
    const normalizedTarget = normalizeFriendCode(rawTarget);
    setFriendStatusMsg(null);
    setFriendErrorMsg(null);

    if (!rawTarget) {
      setFriendErrorMsg(
        'Please enter a player Friend Code (format VX-XXXXXX).'
      );
      return;
    }

    try {
      const levelInfo = computeOperatorLevelFromXp(localXp);
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromCode: friendCode,
          fromUsername: callsign,
          fromLevel: levelInfo.level,
          fromSkinId: skinId,
          toCode: normalizedTarget || rawTarget,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFriendErrorMsg(
          data.error ||
            `No player found with friend code "${
              normalizedTarget || rawTarget
            }".`
        );
        return;
      }
      if (Array.isArray(data.friends)) setFriendsList(data.friends);
      if (Array.isArray(data.requests)) setFriendRequests(data.requests);
      if (Array.isArray(data.partyInvites)) setPartyInvites(data.partyInvites);
      if (Array.isArray(data.partyMembers)) setPartyMembers(data.partyMembers);
      setFriendCodeInput('');
      const targetName = data.targetProfile?.username || normalizedTarget;
      const targetCode = data.targetProfile?.friendCode || normalizedTarget;
      setFriendStatusMsg(
        data.request?.status === 'accepted'
          ? `Connected with ${targetName} (${targetCode}) — added to your Friends list!`
          : `Friend request sent to ${targetName} (${targetCode})! Waiting for them to accept.`
      );
      if (currentUser) {
        sendFirestoreFriendRequest(currentUser, callsign, targetName).catch(
          () => {}
        );
      }
    } catch {
      setFriendErrorMsg('Network error while looking up Friend Code.');
    }
  };

  const handleRespondToFriendRequest = async (
    requestId: string,
    action: 'accept' | 'decline'
  ) => {
    try {
      const res = await fetch('/api/friends/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendCode,
          username: callsign,
          requestId,
          action,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.friends)) setFriendsList(data.friends);
        if (Array.isArray(data.requests)) setFriendRequests(data.requests);
        if (Array.isArray(data.partyInvites)) setPartyInvites(data.partyInvites);
        if (Array.isArray(data.partyMembers)) setPartyMembers(data.partyMembers);
        setFriendErrorMsg(null);
        setFriendStatusMsg(
          action === 'accept'
            ? 'Friend request accepted! Player added to your Friends list.'
            : 'Friend request declined.'
        );
      }
    } catch {
      // Ignore network error
    }
  };

  // Send a Party Invite and WAIT until the other player accepts before adding to Party
  const handleSendPartyInvite = async (friend: FriendProfile) => {
    setFriendErrorMsg(null);
    setFriendStatusMsg(null);

    if (friend.online === false || friend.status === 'offline') {
      setFriendErrorMsg(
        `${friend.username} (${friend.friendCode}) is currently OFFLINE and unavailable for party invites.`
      );
      return;
    }

    try {
      const levelInfo = computeOperatorLevelFromXp(localXp);
      const res = await fetch('/api/party/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromCode: friendCode,
          fromUsername: callsign,
          fromLevel: levelInfo.level,
          fromSkinId: skinId,
          toCode: friend.friendCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFriendErrorMsg(
          data.error || `Could not invite ${friend.username} to party.`
        );
        return;
      }
      if (Array.isArray(data.friends)) setFriendsList(data.friends);
      if (Array.isArray(data.requests)) setFriendRequests(data.requests);
      if (Array.isArray(data.partyInvites)) setPartyInvites(data.partyInvites);
      if (Array.isArray(data.partyMembers)) setPartyMembers(data.partyMembers);
      setFriendStatusMsg(
        `Party invite sent to ${friend.username} (${friend.friendCode})! Waiting until they accept...`
      );
    } catch {
      setFriendErrorMsg('Network error while sending party invite.');
    }
  };

  const handleRespondToPartyInvite = async (
    inviteId: string,
    action: 'accept' | 'decline'
  ) => {
    setFriendErrorMsg(null);
    try {
      const res = await fetch('/api/party/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendCode,
          username: callsign,
          inviteId,
          action,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.friends)) setFriendsList(data.friends);
        if (Array.isArray(data.requests)) setFriendRequests(data.requests);
        if (Array.isArray(data.partyInvites)) setPartyInvites(data.partyInvites);
        if (Array.isArray(data.partyMembers)) setPartyMembers(data.partyMembers);
        setFriendStatusMsg(
          action === 'accept'
            ? 'Party invite accepted! Both operators now appear on screen in your shared Party!'
            : 'Party invite declined.'
        );
      }
    } catch {
      // Ignore network error
    }
  };

  const handleLeaveOrRemovePartyMember = async (targetCode: string) => {
    try {
      const res = await fetch('/api/party/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendCode,
          targetCode,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.friends)) setFriendsList(data.friends);
        if (Array.isArray(data.partyInvites)) setPartyInvites(data.partyInvites);
        if (Array.isArray(data.partyMembers)) setPartyMembers(data.partyMembers);
      }
    } catch {
      setPartyMembers((prev) =>
        prev.filter((p) => p.friendCode !== targetCode)
      );
    }
  };

  const handleToggleAccountOnlineStatus = async (
    targetCode: string,
    nextOnline: boolean
  ) => {
    try {
      await fetch('/api/accounts/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendCode: targetCode,
          online: nextOnline,
          status: nextOnline ? 'online' : 'offline',
        }),
      });
      await syncFriendsAndAccount(callsign, friendCode);
    } catch {
      // Ignore error
    }
  };

  const handleBuyOrEquipSkin = (targetSkinId: SkinId) => {
    const skinDef = OPERATOR_SKINS[targetSkinId];
    if (!skinDef) return;
    const isOwned = unlockedSkins.includes(targetSkinId);

    if (isOwned) {
      setSkinId(targetSkinId);
      setShopPreviewSkinId(targetSkinId);
      persistLoadoutIfSignedIn({ skinId: targetSkinId });
      setShopToast(`Equipped ${skinDef.name}!`);
      setTimeout(() => setShopToast(null), 2500);
      return;
    }

    if (localCredits < skinDef.priceCredits) {
      setShopToast(
        `Need ${skinDef.priceCredits - localCredits} more Credits (CR). Win matches to earn Credits!`
      );
      setTimeout(() => setShopToast(null), 3200);
      return;
    }

    const nextCredits = localCredits - skinDef.priceCredits;
    const nextUnlocked = Array.from(new Set([...unlockedSkins, targetSkinId]));
    setLocalCredits(nextCredits);
    setUnlockedSkins(nextUnlocked);
    setSkinId(targetSkinId);
    setShopPreviewSkinId(targetSkinId);
    persistLoadoutIfSignedIn({ skinId: targetSkinId, credits: nextCredits });
    soundEngine.playMovementAction('pickup');
    setShopToast(
      `Unlocked & Equipped ${skinDef.name} (-${skinDef.priceCredits} CR)!`
    );
    setTimeout(() => setShopToast(null), 3200);
  };

  const handleStartDeployment = (modeOverride?: BattleModeId) => {
    if (modeOverride) {
      setBattleMode(modeOverride);
    }
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
      score: boolean extends never ? number : number;
      eliminations: number;
      wallsConstructed: number;
      waveReached: number;
      durationSec: number;
    }
  ) => {
    document.body.dataset.state = nextState;
    if (outcome) {
      const rewards = calculateMatchXpAndCredits({
        victory: outcome.victory,
        eliminations: outcome.eliminations,
        durationSec: outcome.durationSec,
        wallsConstructed: outcome.wallsConstructed,
        battleMode,
        botHardness,
      });

      const nextXp = localXp + rewards.totalXpEarned;
      const nextCredits = localCredits + rewards.creditsEarned;
      setLocalXp(nextXp);
      setLocalCredits(nextCredits);

      setOutcomeSnapshot({
        ...outcome,
        rewards,
      });

      if (currentUser && operatorProfile) {
        recordMatchAndProgression(
          currentUser,
          {
            ...operatorProfile,
            xp: localXp,
            credits: localCredits,
          },
          {
            mapId,
            trainingLevel,
            score: outcome.score,
            eliminations: outcome.eliminations,
            wallsConstructed: outcome.wallsConstructed,
            outcome: outcome.victory ? 'victory' : 'defeat',
            xpEarned: rewards.totalXpEarned,
            creditsEarned: rewards.creditsEarned,
          }
        )
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
  const activeVisualSkinId =
    gameState === 'title' && lobbyPage === 'shop' ? shopPreviewSkinId : skinId;
  const currentSkin =
    OPERATOR_SKINS[skinId] || OPERATOR_SKINS['vanguard-obsidian'];
  const currentEmote = OPERATOR_EMOTES[emoteId];
  const currentModeDef = BATTLE_MODES[battleMode] || BATTLE_MODES['2v2'];
  const currentHardnessDef =
    BOT_HARDNESS_TIERS[botHardness] || BOT_HARDNESS_TIERS.veteran;
  const levelInfo = computeOperatorLevelFromXp(localXp);

  // Incoming pending notifications for the top menu slider (Friend Requests + Party Invites)
  const incomingPendingFriendRequests = friendRequests.filter(
    (r) => r.status === 'pending' && r.fromCode !== friendCode
  );
  const incomingPendingPartyInvites = partyInvites.filter(
    (inv) => inv.status === 'pending' && inv.toCode === friendCode
  );
  const outgoingPendingPartyInvites = partyInvites.filter(
    (inv) => inv.status === 'pending' && inv.fromCode === friendCode
  );
  const totalMenuNotificationCount =
    incomingPendingFriendRequests.length + incomingPendingPartyInvites.length;

  return (
    <main className="relative w-screen h-screen overflow-hidden select-none">
      {/* Isolated Full-Bleed Three.js 3D Viewport */}
      <ThreeArena
        gameState={gameState}
        mapId={mapId}
        battleMode={battleMode}
        botHardness={botHardness}
        weatherMode={weatherMode}
        partyMembers={partyMembers}
        trainingLevel={trainingLevel}
        callsign={callsign}
        skinId={activeVisualSkinId}
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
        touchInputRef={touchInputRef}
        smartControl={smartControl}
        triggerEventNonce={triggerEventNonce}
        replayRecording={replayRecording}
        replayTimeSec={replayTimeSec}
        replayCameraMode={replayCameraMode}
        onDetectedInputDevice={(device, gpName) => {
          setDetectedDevice(device);
          setControlScheme('auto');
          if (gpName !== undefined) setGamepadLabel(gpName);
        }}
        onSelectWallType={(t) => setSelectedWallType(t)}
        onHudUpdate={setHud}
        onStateChange={handleStateChange}
        onSendMultiplayerUpdate={sendMultiplayerUpdate}
        onReplayUpdated={setReplayRecording}
      />

      {/* Atmospheric Horizon Blur & Light Rain Veil (masks distant chunk streaming without WebGL backdrop-filter stall) */}
      <div
        data-testid="weather-horizon-veil"
        data-weather={weatherMode}
        className="fixed inset-0 z-10 pointer-events-none overflow-hidden"
        style={{
          background:
            weatherMode === 'storm-squall'
              ? 'radial-gradient(circle at 50% 48%, rgba(15,23,42,0) 42%, rgba(15,23,42,0.52) 100%), linear-gradient(180deg, rgba(148,163,184,0.18) 0%, rgba(100,116,139,0.22) 38%, rgba(15,23,42,0.04) 68%, rgba(15,23,42,0.34) 100%)'
              : weatherMode === 'mist-veil'
                ? 'radial-gradient(circle at 50% 48%, rgba(15,23,42,0) 38%, rgba(30,41,59,0.48) 100%), linear-gradient(180deg, rgba(203,213,225,0.16) 0%, rgba(148,163,184,0.24) 44%, rgba(15,23,42,0.03) 72%, rgba(15,23,42,0.28) 100%)'
                : 'radial-gradient(circle at 50% 48%, rgba(15,23,42,0) 46%, rgba(15,23,42,0.38) 100%), linear-gradient(180deg, rgba(186,230,253,0.12) 0%, rgba(148,163,184,0.18) 40%, rgba(15,23,42,0.02) 70%, rgba(15,23,42,0.26) 100%)',
        }}
      />

      {/* ===================================================================== */}
      {/* STATE 1: MULTI-PAGE GAME LOBBY SHELL                                  */}
      {/* ===================================================================== */}
      {gameState === 'title' && (
        <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 md:p-6">
          {/* TOP NAVIGATION BAR: Game Crest + Dedicated Lobby Pages + Account Icon Toggle */}
          <header className="pointer-events-auto flex flex-wrap items-center justify-between gap-3">
            {/* Left: Game Brand + Multi-Page Navigation Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-white/15"
                style={{ backgroundColor: 'rgba(9,13,22,0.92)' }}
              >
                <svg
                  viewBox="0 0 64 64"
                  className="w-8 h-8 shrink-0"
                  aria-hidden="true"
                >
                  <polygon
                    points="32,4 58,18 58,46 32,60 6,46 6,18"
                    fill="#0f172a"
                    stroke="#f59e0b"
                    strokeWidth="3"
                  />
                  <path
                    d="M20 42 L32 16 L44 42 L37 42 L32 30 L27 42 Z"
                    fill="#f8fafc"
                  />
                  <circle cx="32" cy="39" r="3.5" fill="#f59e0b" />
                </svg>
                <div>
                  <div className="text-sm font-display font-bold tracking-wider text-white leading-none">
                    APEX VANGUARD
                  </div>
                  <div className="text-[10px] font-mono text-amber-400">
                    ONLINE MULTIPLAYER FPS
                  </div>
                </div>
              </div>

              {/* Dedicated Lobby Pages Navigation Slider with Live Notification Badges */}
              <nav
                aria-label="Lobby Pages"
                className="flex flex-wrap items-center gap-1 p-1 rounded-xl border border-white/15"
                style={{ backgroundColor: 'rgba(9,13,22,0.92)' }}
              >
                {(
                  [
                    { id: 'play', label: 'PLAY', badge: 0 },
                    { id: 'operator', label: 'OPERATOR', badge: 0 },
                    { id: 'shop', label: 'SKIN SHOP', badge: 0 },
                    { id: 'maps', label: 'MAPS & MODES', badge: 0 },
                    {
                      id: 'friends',
                      label: `FRIENDS (${friendsList.length})`,
                      badge: totalMenuNotificationCount,
                    },
                    { id: 'practice', label: 'PRACTICE', badge: 0 },
                  ] as const
                ).map((tab) => {
                  const active = lobbyPage === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      data-testid={`lobby-nav-${tab.id}`}
                      onClick={() => setLobbyPage(tab.id)}
                      className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-display font-bold tracking-wide transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                      }`}
                    >
                      <span>{tab.label}</span>
                      {tab.badge > 0 && (
                        <span
                          data-testid="menu-notification-badge"
                          className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white font-mono text-[11px] font-bold shadow-md animate-pulse"
                        >
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Right: Level Badge + Credits + Friend Code + Collapsible Account Icon Button */}
            <div className="relative flex items-center gap-2">
              <div
                className="hidden sm:flex items-center gap-3 px-3.5 py-2 rounded-xl border border-white/15 font-mono text-xs"
                style={{ backgroundColor: 'rgba(9,13,22,0.92)' }}
              >
                <span className="text-amber-400 font-bold">
                  CR {localCredits}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-sky-300 font-bold">
                  LVL {levelInfo.level}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-emerald-400">{callsign}</span>
                <span className="text-slate-600">·</span>
                <span
                  data-testid="header-friend-code"
                  className="text-amber-300 font-bold"
                >
                  {friendCode}
                </span>
              </div>

              {/* Account Icon Button to Show or Minimize Account Drawer */}
              <button
                type="button"
                data-testid="lobby-account-toggle"
                aria-expanded={!accountMinimized}
                aria-label={
                  accountMinimized
                    ? 'Show Account & Controls Panel'
                    : 'Minimize Account Panel'
                }
                onClick={() => setAccountMinimized((prev) => !prev)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors cursor-pointer ${
                  !accountMinimized
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                    : 'bg-slate-900/95 text-white border-white/15 hover:border-amber-400/60'
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5 fill-current"
                  aria-hidden="true"
                >
                  <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z" />
                </svg>
                <span className="text-xs font-mono font-bold">
                  {accountMinimized ? 'ACCOUNT' : 'MINIMIZE'}
                </span>
              </button>

              {/* Collapsible Account Creation, Friend Code, Level, Credits & Controls Popover */}
              {!accountMinimized && (
                <div
                  data-testid="lobby-account-drawer"
                  className="absolute right-0 top-13 w-84 sm:w-96 rounded-2xl border border-white/20 p-4 shadow-2xl z-40 space-y-3"
                  style={{ backgroundColor: 'rgba(9,13,22,0.97)' }}
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <div>
                      <div className="text-[10px] font-mono text-amber-400 uppercase">
                        ONLINE OPERATOR ACCOUNT
                      </div>
                      <div className="text-base font-display font-bold text-white">
                        {callsign}{' '}
                        <span className="text-xs font-mono text-sky-400">
                          (LVL {levelInfo.level})
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAccountMinimized(true)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 cursor-pointer"
                    >
                      Minimize [–]
                    </button>
                  </div>

                  {/* Unique Player Friend Code Card inside Account Tab */}
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-400/40 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-mono text-amber-300 uppercase">
                        YOUR PERSONAL FRIEND CODE (SHARE TO ADD FRIENDS)
                      </div>
                      <div
                        data-testid="account-friend-code"
                        className="text-base font-mono font-bold tracking-wider text-white"
                      >
                        {friendCode}
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid="copy-friend-code-btn"
                      onClick={() => {
                        navigator.clipboard?.writeText(friendCode).catch(() => {});
                        setAccountToast(`Copied Friend Code ${friendCode}!`);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-bold text-xs cursor-pointer shrink-0"
                    >
                      Copy Code
                    </button>
                  </div>

                  {/* Level & XP Progress Bar + Credits */}
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-white/10 space-y-1.5 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">
                        LEVEL {levelInfo.level} PROGRESS
                      </span>
                      <span className="text-sky-400">
                        {levelInfo.xpIntoLevel} / {levelInfo.xpForNextLevel} XP
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-400"
                        style={{
                          width: `${levelInfo.progressPct}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="text-amber-400 font-bold">
                        CREDITS: {localCredits} CR
                      </span>
                      <span className="text-slate-400">
                        TOTAL XP: {localXp}
                      </span>
                    </div>
                  </div>

                  {/* Online Account Username Form */}
                  <form
                    onSubmit={handleSaveUsernameAccount}
                    className="space-y-1.5"
                  >
                    <label
                      htmlFor="account-username-input"
                      className="block text-[11px] font-mono text-slate-300"
                    >
                      Online Account Callsign (Linked to {friendCode})
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="account-username-input"
                        data-testid="account-username-input"
                        type="text"
                        maxLength={20}
                        value={usernameDraft}
                        onChange={(e) => setUsernameDraft(e.target.value)}
                        placeholder="Enter username..."
                        className="w-full bg-slate-950 border border-white/15 rounded-lg px-3 py-1.5 text-xs font-mono text-white"
                      />
                      <button
                        type="submit"
                        data-testid="account-save-username-btn"
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-bold text-xs cursor-pointer shrink-0"
                      >
                        Save
                      </button>
                    </div>
                    {accountToast && (
                      <div
                        data-testid="account-toast-msg"
                        className="text-[11px] font-mono text-emerald-400"
                      >
                        {accountToast}
                      </div>
                    )}
                  </form>

                  {/* Cloud Sync + Audio + Input Mode Switcher */}
                  <div className="pt-2 border-t border-white/10 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      {currentUser ? (
                        <button
                          type="button"
                          onClick={() => signOutOperator()}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono cursor-pointer"
                        >
                          Sign Out Cloud ({currentUser.displayName || 'Synced'})
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
                                'Local Online Account active (' + callsign + ').'
                              );
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-mono font-semibold cursor-pointer"
                        >
                          Link Google Cloud
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setMuted(soundEngine.toggleMute())}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono cursor-pointer"
                      >
                        {muted ? 'AUDIO: OFF' : 'AUDIO: ON'}
                      </button>
                    </div>

                    {authStatusText && (
                      <div className="text-[11px] font-mono text-amber-300">
                        {authStatusText}
                      </div>
                    )}

                    {/* Input Hardware Mode & Smart Assist */}
                    <div className="flex flex-wrap items-center gap-1 pt-1">
                      {(
                        [
                          {
                            id: 'auto',
                            label: `AUTO (${detectedDevice.toUpperCase()})`,
                          },
                          { id: 'pc', label: 'PC' },
                          { id: 'touch', label: 'TOUCH' },
                          { id: 'console', label: 'PAD' },
                        ] as const
                      ).map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          data-testid={`control-mode-${mode.id}`}
                          onClick={() => setControlScheme(mode.id)}
                          className={`px-2 py-1 rounded font-mono text-[10px] font-bold cursor-pointer ${
                            controlScheme === mode.id
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-900 text-slate-300'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        data-testid="lobby-smart-control-toggle"
                        onClick={() =>
                          setSmartControl((prev) => ({
                            ...prev,
                            enabled: !prev.enabled,
                          }))
                        }
                        className={`px-2 py-1 rounded font-mono text-[10px] font-bold cursor-pointer ${
                          smartControl.enabled
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-900 text-slate-400'
                        }`}
                      >
                        SMART:{smartControl.enabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </header>

          {/* =============================================================== */}
          {/* PAGE 1: MAIN PAGE (`play`) — ONLY Play Button, 3D Skin, Level,   */}
          {/* Account Icon, and `+` Sign to Add Friends to Party!              */}
          {/* =============================================================== */}
          {lobbyPage === 'play' && (
            <div className="flex-1 flex flex-col justify-between pointer-events-none py-2">
              {/* Center-Top Floating Operator Level & Skin Tag + `+` Party Slots */}
              <div
                className={`flex flex-col items-center mt-1 gap-3 transition-opacity ${
                  !accountMinimized ? 'opacity-0 pointer-events-none' : 'opacity-100'
                }`}
              >
                {/* Operator Level + Skin Badge over 3D Character */}
                <div
                  className="pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-full border border-white/20 shadow-xl"
                  style={{ backgroundColor: 'rgba(9,13,22,0.88)' }}
                >
                  <span
                    data-testid="main-operator-level"
                    className="px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-mono font-bold text-xs"
                  >
                    LVL {levelInfo.level}
                  </span>
                  <span className="text-sm font-display font-bold text-white">
                    {callsign}
                  </span>
                  <span className="text-slate-500">·</span>
                  <span className="text-xs font-mono text-sky-300">
                    {currentSkin.name}
                  </span>
                </div>

                {/* `+` Signs to Invite Friends to Party (Wait for Acceptance -> Shared 3D Avatar on Screen) */}
                <div
                  className="pointer-events-auto flex flex-wrap items-center justify-center gap-2.5"
                  aria-label="Party Squad Slots"
                >
                  {[0, 1, 2].map((slotIdx) => {
                    const member = partyMembers[slotIdx];
                    const pendingOutgoing: PartyInviteRecord | undefined =
                      !member
                        ? outgoingPendingPartyInvites[
                            slotIdx - partyMembers.length
                          ]
                        : undefined;
                    if (member) {
                      return (
                        <div
                          key={member.friendCode || member.username}
                          data-testid={`party-active-member-${member.friendCode}`}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-400/60 text-xs font-mono text-white shadow-lg"
                          style={{ backgroundColor: 'rgba(9,13,22,0.92)' }}
                        >
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          <span className="font-bold">{member.username}</span>
                          <span className="text-[10px] text-emerald-300">
                            ON SCREEN · LVL {member.level}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove ${member.username} from party`}
                            onClick={() =>
                              handleLeaveOrRemovePartyMember(member.friendCode)
                            }
                            className="ml-1 text-slate-400 hover:text-rose-400 font-bold cursor-pointer"
                          >
                            ×
                          </button>
                        </div>
                      );
                    }
                    if (pendingOutgoing) {
                      return (
                        <div
                          key={pendingOutgoing.id}
                          data-testid={`party-waiting-slot-${pendingOutgoing.toCode}`}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-amber-400/60 text-xs font-mono text-amber-200 shadow-lg"
                          style={{ backgroundColor: 'rgba(9,13,22,0.92)' }}
                        >
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                          <span className="font-bold">
                            {pendingOutgoing.toUsername}
                          </span>
                          <span className="text-[10px] text-amber-300 uppercase">
                            WAITING FOR ACCEPTANCE...
                          </span>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={slotIdx}
                        type="button"
                        data-testid={`party-plus-slot-${slotIdx}`}
                        onClick={() => {
                          const availableOnlineFriend = friendsList.find(
                            (f) =>
                              f.online !== false &&
                              f.status !== 'offline' &&
                              !partyMembers.some(
                                (pm) => pm.friendCode === f.friendCode
                              ) &&
                              !outgoingPendingPartyInvites.some(
                                (inv) => inv.toCode === f.friendCode
                              )
                          );
                          if (availableOnlineFriend && slotIdx === 0) {
                            handleSendPartyInvite(availableOnlineFriend);
                          } else {
                            setLobbyPage('friends');
                          }
                        }}
                        title="Invite Friend to Party"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-white/30 hover:border-amber-400 text-xs font-mono text-slate-200 hover:text-amber-300 transition-colors cursor-pointer shadow-lg"
                        style={{ backgroundColor: 'rgba(9,13,22,0.82)' }}
                      >
                        <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-300 font-bold text-sm leading-none">
                          +
                        </span>
                        <span>Invite Friend</span>
                      </button>
                    );
                  })}

                  {partyMembers.length > 0 && (
                    <button
                      type="button"
                      data-testid="lobby-play-vs-party-btn"
                      onClick={() => handleStartDeployment('party-vs')}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-mono font-bold text-xs shadow-lg cursor-pointer"
                    >
                      ⚔ PLAY VS PARTY ({partyMembers[0].username})
                    </button>
                  )}
                </div>

                {/* Incoming Party Invite / Friend Request Quick Notification Banner on Main Screen */}
                {incomingPendingPartyInvites.length > 0 && (
                  <div
                    data-testid="main-incoming-party-invite-banner"
                    className="pointer-events-auto flex flex-wrap items-center gap-2.5 px-4 py-2 rounded-xl border border-amber-400 bg-slate-950/95 text-xs font-mono text-white shadow-2xl"
                  >
                    <span className="text-amber-300 font-bold">
                      PARTY INVITE FROM{' '}
                      {incomingPendingPartyInvites[0].fromUsername} (
                      {incomingPendingPartyInvites[0].fromCode})
                    </span>
                    <button
                      type="button"
                      data-testid="main-accept-party-invite-btn"
                      onClick={() =>
                        handleRespondToPartyInvite(
                          incomingPendingPartyInvites[0].id,
                          'accept'
                        )
                      }
                      className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer"
                    >
                      Accept Party
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleRespondToPartyInvite(
                          incomingPendingPartyInvites[0].id,
                          'decline'
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>

              {/* Bottom Bar: Minimalist Play Button + Current Mode/Map Pill */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setLobbyPage('maps')}
                  className="pointer-events-auto px-4 py-2.5 rounded-xl border border-white/15 hover:border-sky-400/60 text-left transition-colors cursor-pointer"
                  style={{ backgroundColor: 'rgba(9,13,22,0.88)' }}
                >
                  <div className="text-[10px] font-mono text-sky-400 uppercase">
                    SELECTED MODE &amp; SECTOR (CLICK TO CHANGE)
                  </div>
                  <div className="text-sm font-display font-bold text-white">
                    {currentModeDef.name} · {currentHardnessDef.name} Bots ·{' '}
                    {currentBiome.name}
                  </div>
                </button>

                <button
                  type="button"
                  data-start="true"
                  data-testid="lobby-main-play-btn"
                  onClick={() => handleStartDeployment()}
                  className="pointer-events-auto px-10 py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xl tracking-wider uppercase shadow-2xl transition-transform active:scale-95 cursor-pointer"
                >
                  PLAY [{currentModeDef.shortLabel}]
                </button>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* PAGE 2: OPERATOR PAGE (`operator`) — Your Skin, Loadout & Walls */}
          {/* =============================================================== */}
          {lobbyPage === 'operator' && (
            <div
              data-testid="lobby-page-operator"
              className="pointer-events-auto w-full max-w-5xl mx-auto my-auto rounded-2xl border border-white/15 p-5 shadow-2xl space-y-4 max-h-[80vh] overflow-y-auto"
              style={{ backgroundColor: 'rgba(9,13,22,0.94)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div>
                  <div className="text-xs font-mono text-amber-400">
                    PERSONAL OPERATOR ARMORY
                  </div>
                  <h2 className="text-xl font-display font-bold text-white">
                    {callsign} · {currentSkin.name} · {currentWeapon.name}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setLobbyPage('shop')}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400 text-amber-300 text-xs font-mono font-bold cursor-pointer"
                >
                  Unlock More Skins in Shop ({localCredits} CR) →
                </button>
              </div>

              {/* Owned Skins Selector */}
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-2">
                  Owned Exosuit Skins ({unlockedSkins.length} /{' '}
                  {Object.keys(OPERATOR_SKINS).length} Unlocked)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {unlockedSkins.map((id) => {
                    const s = OPERATOR_SKINS[id];
                    if (!s) return null;
                    const active = skinId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setSkinId(id);
                          persistLoadoutIfSignedIn({ skinId: id });
                        }}
                        className={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${
                          active
                            ? 'bg-slate-800 border-amber-400 text-white'
                            : 'bg-slate-900 border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className="w-3.5 h-3.5 rounded-sm border border-white/20"
                            style={{ backgroundColor: s.primaryHex }}
                          />
                          <span
                            className="w-3.5 h-3.5 rounded-sm"
                            style={{ backgroundColor: s.visorHex }}
                          />
                          <span className="ml-auto text-[10px] font-mono text-amber-400">
                            {s.rarity}
                          </span>
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

              {/* Primary Weapon & 4 Realistic Attachments */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2 border-t border-white/10">
                <div className="lg:col-span-8 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-300 mb-1.5">
                      Primary Weapon &amp; Tactical Ability [Q]
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
                              persistLoadoutIfSignedIn({ primaryWeaponId: id });
                            }}
                            className={`p-2 rounded-lg border text-left cursor-pointer ${
                              active
                                ? 'bg-sky-500/20 border-sky-400 text-white'
                                : 'bg-slate-900 border-white/10 text-slate-300'
                            }`}
                          >
                            <div className="text-xs font-bold truncate">
                              {w.name}
                            </div>
                            <div className="text-[10px] text-sky-300 truncate">
                              {w.abilityName}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 4 Attachments */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Optic Sight
                      </label>
                      <select
                        value={opticId}
                        onChange={(e) => {
                          const v = e.target.value as OpticId;
                          setOpticId(v);
                          persistLoadoutIfSignedIn({ opticId: v });
                        }}
                        className="w-full bg-slate-900 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white"
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
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Barrel
                      </label>
                      <select
                        value={barrelId}
                        onChange={(e) => {
                          const v = e.target.value as BarrelId;
                          setBarrelId(v);
                          persistLoadoutIfSignedIn({ barrelId: v });
                        }}
                        className="w-full bg-slate-900 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      >
                        {(Object.keys(BARREL_ATTACHMENTS) as BarrelId[]).map(
                          (k) => (
                            <option key={k} value={k}>
                              {BARREL_ATTACHMENTS[k].name}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Underbarrel
                      </label>
                      <select
                        value={underbarrelId}
                        onChange={(e) => {
                          const v = e.target.value as UnderbarrelId;
                          setUnderbarrelId(v);
                          persistLoadoutIfSignedIn({ underbarrelId: v });
                        }}
                        className="w-full bg-slate-900 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white"
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
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Magazine
                      </label>
                      <select
                        value={magId}
                        onChange={(e) => {
                          const v = e.target.value as MagId;
                          setMagId(v);
                          persistLoadoutIfSignedIn({ magId: v });
                        }}
                        className="w-full bg-slate-900 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      >
                        {(Object.keys(MAG_ATTACHMENTS) as MagId[]).map((k) => (
                          <option key={k} value={k}>
                            {MAG_ATTACHMENTS[k].name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Emote & Wall Blueprints */}
                <div className="lg:col-span-4 space-y-2.5">
                  <div>
                    <div className="text-xs font-semibold text-slate-300 mb-1">
                      Equipped Emote [V]
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(OPERATOR_EMOTES) as EmoteId[]).map((id) => {
                        const em = OPERATOR_EMOTES[id];
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => {
                              setEmoteId(id);
                              persistLoadoutIfSignedIn({ emoteId: id });
                            }}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold text-left cursor-pointer ${
                              emoteId === id
                                ? 'bg-emerald-500/20 border-emerald-400 text-white'
                                : 'bg-slate-900 border-white/10 text-slate-300'
                            }`}
                          >
                            {em.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-slate-300 mb-1">
                      Default Fortification Wall [F]
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(Object.keys(WALL_BLUEPRINTS) as WallType[]).map(
                        (wt) => (
                          <button
                            key={wt}
                            type="button"
                            onClick={() => setSelectedWallType(wt)}
                            className={`p-2 rounded-lg border text-left text-xs cursor-pointer ${
                              selectedWallType === wt
                                ? 'bg-sky-500/20 border-sky-400 text-white'
                                : 'bg-slate-900 border-white/10 text-slate-300'
                            }`}
                          >
                            <div className="font-bold">
                              {WALL_BLUEPRINTS[wt].name.split(' ')[0]}
                            </div>
                            <div className="text-[10px] font-mono text-amber-400">
                              {WALL_BLUEPRINTS[wt].salvageCost} Salvage
                            </div>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* PAGE 3: SKIN SHOP PAGE (`shop`) — Buy Skins with Credits (CR)   */}
          {/* =============================================================== */}
          {lobbyPage === 'shop' && (
            <div
              data-testid="lobby-page-shop"
              className="pointer-events-auto w-full max-w-5xl mx-auto my-auto rounded-2xl border border-white/15 p-5 shadow-2xl space-y-4 max-h-[80vh] overflow-y-auto"
              style={{ backgroundColor: 'rgba(9,13,22,0.94)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div>
                  <div className="text-xs font-mono text-amber-400 uppercase">
                    EXOSUIT COSMETICS STORE · EARN CREDITS BY WINNING MATCHES
                  </div>
                  <h2 className="text-xl font-display font-bold text-white">
                    Operator Skin Shop
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <div
                    data-testid="shop-credits-balance"
                    className="px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-400 text-amber-300 font-mono font-bold text-sm"
                  >
                    BALANCE: {localCredits} CR
                  </div>
                </div>
              </div>

              {shopToast && (
                <div
                  data-testid="shop-toast-banner"
                  className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400 text-emerald-200 text-xs font-mono font-bold"
                >
                  {shopToast}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {(Object.keys(OPERATOR_SKINS) as SkinId[]).map((id) => {
                  const s = OPERATOR_SKINS[id];
                  const owned = unlockedSkins.includes(id);
                  const equipped = skinId === id;
                  return (
                    <div
                      key={id}
                      onClick={() => setShopPreviewSkinId(id)}
                      className={`p-3.5 rounded-xl border flex flex-col justify-between transition-colors cursor-pointer ${
                        equipped
                          ? 'bg-slate-800/95 border-amber-400'
                          : shopPreviewSkinId === id
                            ? 'bg-slate-800/80 border-sky-400'
                            : 'bg-slate-900/90 border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-4 h-4 rounded-sm border border-white/20"
                              style={{ backgroundColor: s.primaryHex }}
                            />
                            <span
                              className="w-4 h-4 rounded-sm"
                              style={{ backgroundColor: s.visorHex }}
                            />
                          </div>
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                              s.rarity === 'Mythic'
                                ? 'bg-amber-500/20 text-amber-300'
                                : s.rarity === 'Legendary'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : s.rarity === 'Epic'
                                    ? 'bg-purple-500/20 text-purple-300'
                                    : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {s.rarity}
                          </span>
                        </div>

                        <div className="text-sm font-display font-bold text-white">
                          {s.name}
                        </div>
                        <div className="text-[10px] font-mono text-sky-300 mb-1.5">
                          {s.roleTag}
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-2 mb-3">
                          {s.description}
                        </p>
                      </div>

                      <button
                        type="button"
                        data-testid={`shop-action-${id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBuyOrEquipSkin(id);
                        }}
                        className={`w-full py-2 rounded-lg font-mono font-bold text-xs cursor-pointer transition-colors ${
                          equipped
                            ? 'bg-emerald-500 text-slate-950'
                            : owned
                              ? 'bg-slate-700 hover:bg-slate-600 text-white'
                              : localCredits >= s.priceCredits
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                                : 'bg-slate-950 text-slate-500 border border-white/10'
                        }`}
                      >
                        {equipped
                          ? 'EQUIPPED'
                          : owned
                            ? 'EQUIP SKIN'
                            : `BUY · ${s.priceCredits} CR`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* PAGE 4: MAPS, MODES (1v1..4v4, Co-Op) & BOT HARDNESS (`maps`)   */}
          {/* =============================================================== */}
          {lobbyPage === 'maps' && (
            <div
              data-testid="lobby-page-maps"
              className="pointer-events-auto w-full max-w-5xl mx-auto my-auto rounded-2xl border border-white/15 p-5 shadow-2xl space-y-4 max-h-[80vh] overflow-y-auto"
              style={{ backgroundColor: 'rgba(9,13,22,0.94)' }}
            >
              {/* Team Modes (1v1, 2v2, 3v3, 4v4, Party VS, 100-Player Battle Royale, Co-Op) */}
              <div>
                <div className="text-xs font-mono text-amber-400 uppercase mb-1">
                  1. SELECT MATCH MODE (1V1, 2V2, 3V3, 4V4, PARTY VS PARTY &amp;
                  100-PLAYER BATTLE ROYALE)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {Object.values(BATTLE_MODES).map((m) => {
                    const active = battleMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        data-testid={`select-battle-mode-${m.id}`}
                        onClick={() => setBattleMode(m.id)}
                        className={`p-3 rounded-xl border text-left cursor-pointer transition-colors flex flex-col justify-between ${
                          active
                            ? 'bg-amber-500/20 border-amber-400 text-white'
                            : 'bg-slate-900 border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-xs font-bold">{m.name}</span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-950 text-[10px] font-mono text-amber-400">
                              {m.shortLabel}
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-emerald-300 mb-1">
                            {m.arenaSizeLabel} ·{' '}
                            {m.useChunkStreaming
                              ? '∞ CHUNK STREAMING'
                              : 'TAILORED ARENA'}
                          </div>
                          <p className="text-[11px] text-slate-400 line-clamp-2">
                            {m.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bot Hardness Levels (Beginner to Legend) + 25-Block Stealth Rule */}
              <div className="pt-2 border-t border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <div className="text-xs font-mono text-sky-400 uppercase">
                    2. SELECT BOT HARDNESS LEVEL (BEGINNER TO LEGEND)
                  </div>
                  <div
                    data-testid="bot-discovery-rule-badge"
                    className="text-[10px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-400/30 px-2.5 py-0.5 rounded"
                  >
                    ANTI-CHAOS AI: BOTS ONLY DISCOVER &amp; ENGAGE WITHIN{' '}
                    {BOT_DISCOVERY_RADIUS} BLOCKS
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                  {Object.values(BOT_HARDNESS_TIERS).map((tier) => {
                    const active = botHardness === tier.id;
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        data-testid={`select-bot-hardness-${tier.id}`}
                        onClick={() => setBotHardness(tier.id)}
                        className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                          active
                            ? 'bg-sky-500/20 border-sky-400 text-white'
                            : 'bg-slate-900 border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold">{tier.name}</span>
                          <span className="text-[10px] font-mono text-emerald-400">
                            {tier.xpCreditMultiplier}x XP/CR
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {tier.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 9 Maps (Including Playground, Forest, Water Splash & Abandoned Theme Park) */}
              <div className="pt-2 border-t border-white/10 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-mono text-emerald-400 uppercase block">
                      3. SELECT COMBAT MAP ({currentModeDef.arenaSizeLabel})
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {currentModeDef.useChunkStreaming
                        ? 'Open-world mode active: 64m × 64m procedural chunks stream endlessly in all directions.'
                        : `Fixed-team mode (${currentModeDef.shortLabel}) active: Uses tailored ${currentModeDef.arenaSizeLabel} bounds without infinite chunk streaming.`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStartDeployment()}
                    className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs cursor-pointer"
                  >
                    Deploy Into {currentBiome.name} →
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-2.5">
                  {(Object.keys(BIOMES) as MapId[]).map((id) => {
                    const b = BIOMES[id];
                    const active = mapId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        data-testid={`map-select-${id}`}
                        onClick={() => setMapId(id)}
                        className={`text-left p-3 rounded-xl border transition-colors cursor-pointer flex flex-col justify-between ${
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
                            <span className="text-[10px] font-mono text-amber-300">
                              {currentModeDef.useChunkStreaming
                                ? '∞ CHUNK STREAM'
                                : currentModeDef.arenaSizeLabel.split(' ')[0] +
                                  '×' +
                                  currentModeDef.arenaSizeLabel.split(' ')[2]}
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

                {/* Weather Atmosphere & Horizon Blur Selector (Masks Chunk Generation) */}
                <div className="pt-2 border-t border-white/10">
                  <div className="text-xs font-mono text-sky-300 uppercase mb-1.5">
                    4. WEATHER ATMOSPHERE &amp; HORIZON BLUR (MASKS CHUNK STREAMING)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {(
                      [
                        {
                          id: 'light-rain-blur',
                          name: 'Light Rain + Horizon Blur',
                          tag: 'RECOMMENDED',
                          desc: 'Gentle 3D rain streaks, ground ripples, and atmospheric horizon mist veil make new chunk generation unnoticeable.',
                        },
                        {
                          id: 'storm-squall',
                          name: 'Heavy Storm Squall',
                          tag: 'DENSE RAIN',
                          desc: 'High-velocity rain curtains and deeper horizon fog for close-quarters tactical ambushes.',
                        },
                        {
                          id: 'mist-veil',
                          name: 'Soft Horizon Mist Veil',
                          tag: 'LOW PARTICLES',
                          desc: 'Subtle peripheral atmospheric blur and exponential distance haze with minimal precipitation.',
                        },
                      ] as const
                    ).map((wm) => {
                      const active = weatherMode === wm.id;
                      return (
                        <button
                          key={wm.id}
                          type="button"
                          data-testid={`weather-mode-${wm.id}`}
                          onClick={() => setWeatherMode(wm.id)}
                          className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                            active
                              ? 'bg-sky-500/20 border-sky-400 text-white'
                              : 'bg-slate-900 border-white/10 text-slate-300 hover:border-white/25'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-xs font-bold">{wm.name}</span>
                            <span className="text-[10px] font-mono text-sky-300">
                              {wm.tag}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            {wm.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* PAGE 5: REAL FRIENDS & PARTY PAGE (`friends`) — Friend Codes    */}
          {/* =============================================================== */}
          {lobbyPage === 'friends' && (
            <div
              data-testid="lobby-page-friends"
              className="pointer-events-auto w-full max-w-4xl mx-auto my-auto rounded-2xl border border-white/15 p-5 shadow-2xl space-y-4 max-h-[80vh] overflow-y-auto"
              style={{ backgroundColor: 'rgba(9,13,22,0.94)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div>
                  <div className="text-xs font-mono text-amber-400 uppercase">
                    REAL ONLINE SOCIAL NETWORK · ZERO BOT FRIENDS
                  </div>
                  <h2 className="text-xl font-display font-bold text-white">
                    Add Real Friends via Personal Friend Code &amp; Build Squad
                  </h2>
                </div>
                <div className="flex items-center gap-2.5 bg-slate-950 border border-amber-400/40 px-3.5 py-2 rounded-xl">
                  <div>
                    <div className="text-[10px] font-mono text-slate-400 uppercase">
                      YOUR ACCOUNT CODE ({callsign})
                    </div>
                    <div
                      data-testid="friends-page-own-code"
                      className="text-sm font-mono font-bold text-amber-300"
                    >
                      {friendCode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(friendCode).catch(() => {});
                      setFriendStatusMsg(`Copied your Friend Code (${friendCode})!`);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-bold text-xs cursor-pointer"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* Send Real Friend Request by Friend Code */}
              <form
                onSubmit={handleSendFriendRequest}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 bg-slate-950 p-3.5 rounded-xl border border-white/10"
              >
                <div className="flex-1">
                  <label
                    htmlFor="friend-code-input"
                    className="block text-[10px] font-mono text-slate-400 uppercase mb-1"
                  >
                    ENTER PLAYER FRIEND CODE (FROM THEIR ACCOUNT TAB, E.G. VX-849204)
                  </label>
                  <input
                    id="friend-code-input"
                    type="text"
                    data-testid="friend-code-input"
                    value={friendCodeInput}
                    onChange={(e) => {
                      setFriendCodeInput(e.target.value.toUpperCase());
                      if (friendErrorMsg) setFriendErrorMsg(null);
                    }}
                    placeholder="Enter Friend Code (e.g. VX-739201)..."
                    className="w-full bg-slate-900 border border-white/15 rounded-lg px-3.5 py-2 text-xs font-mono text-white tracking-wider uppercase"
                  />
                </div>
                <button
                  type="submit"
                  data-testid="send-friend-request-btn"
                  className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs cursor-pointer shrink-0 self-end sm:self-center"
                >
                  Send Friend Request
                </button>
              </form>

              {/* Explicit Error Banner when no player exists with that Friend Code */}
              {friendErrorMsg && (
                <div
                  data-testid="friend-request-error"
                  role="alert"
                  className="px-4 py-2.5 rounded-xl bg-rose-500/20 border border-rose-400 text-rose-200 text-xs font-mono font-bold"
                >
                  ⚠ {friendErrorMsg}
                </div>
              )}

              {friendStatusMsg && (
                <div
                  data-testid="friend-status-banner"
                  className="px-3.5 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400 text-emerald-200 text-xs font-mono"
                >
                  {friendStatusMsg}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Only Your Friends Roster + Online/Offline Availability + Party Handshake */}
                <div className="md:col-span-7 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-slate-300">
                      Your Friends Only ({friendsList.length}) · Online / Offline
                      Availability
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400">
                      Party ({partyMembers.length}/3)
                    </span>
                  </div>

                  <div className="space-y-2">
                    {friendsList.length === 0 ? (
                      <div
                        data-testid="empty-friends-banner"
                        className="p-4 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-400 font-mono space-y-1"
                      >
                        <div className="text-slate-200 font-bold">
                          Your Friends list is empty (Only your added friends are
                          shown here).
                        </div>
                        <div>
                          Share your personal code{' '}
                          <span className="text-amber-300 font-bold">
                            {friendCode}
                          </span>{' '}
                          or enter a friend&apos;s code above to add them!
                        </div>
                      </div>
                    ) : (
                      friendsList.map((f) => {
                        const inParty = partyMembers.some(
                          (pm) => pm.friendCode === f.friendCode
                        );
                        const pendingInviteSent = outgoingPendingPartyInvites.some(
                          (inv) => inv.toCode === f.friendCode
                        );
                        const isOnline =
                          f.online !== false && f.status !== 'offline';

                        return (
                          <div
                            key={f.friendCode}
                            data-testid={`friend-row-${f.friendCode}`}
                            className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-900 border border-white/10"
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`w-2.5 h-2.5 rounded-full ${
                                  isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                                }`}
                              />
                              <div>
                                <div className="flex items-center gap-2 text-xs font-mono font-bold text-white">
                                  <span>{f.username}</span>
                                  <span className="text-amber-300">
                                    [{f.friendCode}]
                                  </span>
                                  <span className="text-sky-400">
                                    LVL {f.level}
                                  </span>
                                  <span
                                    data-testid={`friend-availability-${f.friendCode}`}
                                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                      isOnline
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                                        : 'bg-slate-800 text-slate-400 border border-white/10'
                                    }`}
                                  >
                                    {isOnline
                                      ? 'ONLINE · AVAILABLE'
                                      : 'OFFLINE · UNAVAILABLE'}
                                  </span>
                                </div>
                                <div className="text-[10px] font-mono text-slate-400 mt-0.5 flex items-center gap-2">
                                  <span>
                                    Skin:{' '}
                                    {OPERATOR_SKINS[f.skinId]?.name ||
                                      'Vanguard Obsidian'}
                                  </span>
                                  <button
                                    type="button"
                                    data-testid={`toggle-friend-online-${f.friendCode}`}
                                    onClick={() =>
                                      handleToggleAccountOnlineStatus(
                                        f.friendCode,
                                        !isOnline
                                      )
                                    }
                                    className="text-[10px] text-sky-400 hover:underline cursor-pointer"
                                  >
                                    [Set {isOnline ? 'Offline' : 'Online'}]
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {inParty ? (
                                <>
                                  <span
                                    data-testid={`friend-in-party-badge-${f.friendCode}`}
                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-mono text-xs font-bold"
                                  >
                                    ✓ IN PARTY (ON SCREEN)
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleLeaveOrRemovePartyMember(f.friendCode)
                                    }
                                    className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-rose-300 font-mono text-xs cursor-pointer"
                                  >
                                    Leave
                                  </button>
                                </>
                              ) : pendingInviteSent ? (
                                <span
                                  data-testid={`friend-party-waiting-${f.friendCode}`}
                                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400 text-amber-300 font-mono text-xs font-bold"
                                >
                                  ⏳ WAITING FOR ACCEPT...
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={!isOnline}
                                  data-testid={`friend-party-invite-${f.friendCode}`}
                                  onClick={() => handleSendPartyInvite(f)}
                                  className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition-colors ${
                                    isOnline
                                      ? 'bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 cursor-pointer'
                                      : 'bg-slate-950 text-slate-600 border border-white/5 cursor-not-allowed'
                                  }`}
                                >
                                  {isOnline
                                    ? '+ INVITE TO PARTY'
                                    : 'OFFLINE'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Active Party Summary + Play vs Party Mode Shortcut */}
                  {partyMembers.length > 0 && (
                    <div
                      data-testid="active-party-summary-card"
                      className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-400/40 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="text-xs font-mono text-emerald-200">
                        <span className="font-bold text-emerald-300">
                          SHARED 3D PARTY ACTIVE:
                        </span>{' '}
                        {partyMembers.map((m) => m.username).join(', ')} standing
                        on your lobby screen!
                      </div>
                      <button
                        type="button"
                        data-testid="friends-page-play-vs-party-btn"
                        onClick={() => handleStartDeployment('party-vs')}
                        className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-slate-950 font-mono font-bold text-xs cursor-pointer"
                      >
                        ⚔ Play VS Your Party Now →
                      </button>
                    </div>
                  )}
                </div>

                {/* Right Column: Party Invites Handshake + Friend Requests */}
                <div className="md:col-span-5 space-y-3">
                  {/* Party Invites Section */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-amber-300">
                      Party Invites ({partyInvites.length})
                    </div>
                    {partyInvites.length === 0 ? (
                      <div className="p-3 rounded-xl bg-slate-950 border border-white/5 text-xs text-slate-400 font-mono">
                        No active party invites. Invite an ONLINE friend to your
                        party — they will see the invite and once accepted, both
                        3D operators appear on screen!
                      </div>
                    ) : (
                      partyInvites.map((inv) => (
                        <div
                          key={inv.id}
                          data-testid={`party-invite-card-${inv.id}`}
                          className="p-2.5 rounded-xl bg-slate-900 border border-amber-400/30 flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="text-xs font-mono font-bold text-white">
                              {inv.fromCode === friendCode
                                ? `To: ${inv.toUsername} (${inv.toCode})`
                                : `From: ${inv.fromUsername} (${inv.fromCode})`}
                            </div>
                            <div className="text-[10px] font-mono text-amber-300 uppercase">
                              {inv.status === 'pending'
                                ? inv.fromCode === friendCode
                                  ? 'WAITING FOR ACCEPTANCE...'
                                  : 'INVITED YOU TO PARTY'
                                : inv.status}
                            </div>
                          </div>
                          {inv.status === 'pending' &&
                            inv.toCode === friendCode && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  data-testid={`accept-party-invite-${inv.id}`}
                                  onClick={() =>
                                    handleRespondToPartyInvite(inv.id, 'accept')
                                  }
                                  className="px-2.5 py-1 rounded bg-emerald-500 text-slate-950 font-mono font-bold text-[11px] cursor-pointer"
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  data-testid={`decline-party-invite-${inv.id}`}
                                  onClick={() =>
                                    handleRespondToPartyInvite(inv.id, 'decline')
                                  }
                                  className="px-2 py-1 rounded bg-slate-800 text-slate-300 font-mono text-[11px] cursor-pointer"
                                >
                                  Decline
                                </button>
                              </div>
                            )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Friend Requests Section */}
                  <div className="space-y-1.5 pt-2 border-t border-white/10">
                    <div className="text-xs font-semibold text-slate-300">
                      Friend Requests ({friendRequests.length})
                    </div>
                    <div className="space-y-2">
                      {friendRequests.length === 0 ? (
                        <div className="p-3 rounded-xl bg-slate-950 border border-white/5 text-xs text-slate-400 font-mono">
                          No pending friend requests. Enter a player&apos;s
                          Friend Code above to send a request!
                        </div>
                      ) : (
                        friendRequests.map((req) => (
                          <div
                            key={req.id}
                            data-testid={`friend-request-card-${req.id}`}
                            className="p-2.5 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-between gap-2"
                          >
                            <div>
                              <div className="text-xs font-mono font-bold text-white">
                                {req.fromCode === friendCode
                                  ? `To: ${req.toUsername} (${req.toCode})`
                                  : `From: ${req.fromUsername} (${req.fromCode})`}
                              </div>
                              <div className="text-[10px] font-mono text-amber-400 uppercase">
                                {req.status}
                              </div>
                            </div>
                            {req.status === 'pending' &&
                              req.fromCode !== friendCode && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    data-testid={`accept-request-${req.id}`}
                                    onClick={() =>
                                      handleRespondToFriendRequest(
                                        req.id,
                                        'accept'
                                      )
                                    }
                                    className="px-2.5 py-1 rounded bg-emerald-500 text-slate-950 font-mono font-bold text-[11px] cursor-pointer"
                                  >
                                    Accept
                                  </button>
                                  <button
                                    type="button"
                                    data-testid={`decline-request-${req.id}`}
                                    onClick={() =>
                                      handleRespondToFriendRequest(
                                        req.id,
                                        'decline'
                                      )
                                    }
                                    className="px-2 py-1 rounded bg-slate-800 text-slate-300 font-mono text-[11px] cursor-pointer"
                                  >
                                    Decline
                                  </button>
                                </div>
                              )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* PAGE 6: PRACTICE & BIOSCIENCE STIM LAB PAGE (`practice`)        */}
          {/* =============================================================== */}
          {lobbyPage === 'practice' && (
            <div
              data-testid="lobby-page-practice"
              className="pointer-events-auto w-full max-w-5xl mx-auto my-auto rounded-2xl border border-white/15 p-5 shadow-2xl space-y-4 max-h-[80vh] overflow-y-auto"
              style={{ backgroundColor: 'rgba(9,13,22,0.94)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div>
                  <div className="text-xs font-mono text-emerald-400 uppercase">
                    COMBAT TRAINING RANGE &amp; BIOSCIENCE STIMULANT LAB
                  </div>
                  <h2 className="text-xl font-display font-bold text-white">
                    Practice Target Range, AI Tiers &amp; 3D Replay Theater
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="lobby-watch-replay-btn"
                    onClick={() => {
                      setReplayTimeSec(0);
                      setReplayPlaying(true);
                      handleStateChange('replay');
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-400/30 text-xs font-mono font-bold cursor-pointer"
                  >
                    Watch 3D Match Replay
                  </button>
                  <button
                    type="button"
                    data-testid="start-practice-btn"
                    onClick={() => handleStartDeployment('practice')}
                    className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs cursor-pointer"
                  >
                    Launch Practice Range →
                  </button>
                </div>
              </div>

              {/* 4 AI Training Progression Tiers */}
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-2">
                  Select AI Combat Training Tier
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
                        className={`text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${
                          active
                            ? 'bg-amber-500/15 border-amber-400 text-white'
                            : 'bg-slate-900 border-white/10 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span>{tier.name}</span>
                          <span className="font-mono text-[11px] text-amber-400">
                            {tier.enemyCount} Bots
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

              {/* Bioscience Combat Stimulant Workbench */}
              <div className="pt-2 border-t border-white/10">
                <BioSciencePanel
                  selectedCid={stimCompoundCid}
                  onSelectCompound={(comp: BioCompoundRecord) => {
                    setStimCompoundCid(comp.cid);
                    setStimBuff(comp.combatBuff);
                    persistLoadoutIfSignedIn({ stimCompoundCid: comp.cid });
                  }}
                />
              </div>
            </div>
          )}

          {/* Bottom-Right Corner Attribution Credits */}
          <div
            data-testid="app-credits-badge"
            className="pointer-events-none self-end mt-2 px-3 py-1 rounded-lg border border-white/15 text-[11px] font-mono tracking-wide text-slate-300 shadow-lg"
            style={{ backgroundColor: 'rgba(9,13,22,0.88)' }}
          >
            Credits:{' '}
            <span className="font-bold text-amber-400">
              motech11, Google LLC.
            </span>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STATE 2: PLAYING HUD (WORLD-MATCHED, >= 85% CLEAR VIEWPORT)           */}
      {/* ===================================================================== */}
      {gameState === 'playing' && (
        <div className="fixed inset-0 z-10 pointer-events-none overflow-hidden">
          {/* Split-Screen Center Divider Line & Player 2 Overlay when in Offline Co-Op Split-Screen */}
          {battleMode === 'coop-splitscreen' && hud.splitScreenP2 && (
            <>
              <div className="fixed inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-amber-400/70 pointer-events-none z-20" />
              <div
                data-testid="splitscreen-p2-hud"
                className="fixed top-4 left-[51.5%] max-w-[290px] rounded-xl border border-sky-400/40 px-3 py-2 text-[11px] font-mono pointer-events-none z-20"
                style={{ backgroundColor: 'rgba(9,13,22,0.88)' }}
              >
                <div className="text-[10px] text-sky-400 font-bold truncate">
                  P2 CO-OP · {hud.splitScreenP2.callsign}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-white whitespace-nowrap">
                  <span>
                    HP {hud.splitScreenP2.hp}/{hud.splitScreenP2.maxHp}
                  </span>
                  <span className="text-sky-300">
                    SH {hud.splitScreenP2.shield}
                  </span>
                  <span className="text-amber-400">
                    AMMO {hud.splitScreenP2.ammo}
                  </span>
                  <span className="text-emerald-400">
                    {hud.splitScreenP2.eliminations}K
                  </span>
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5 truncate">
                  Arrows Move · IJKL Aim · Enter Fire
                </div>
              </div>
            </>
          )}

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

                {opp.maxShield > 0 && (
                  <div className="w-full h-1 bg-slate-950/90 rounded-sm overflow-hidden mb-0.5 border border-black/60">
                    <div
                      className="h-full bg-sky-400 transition-transform duration-75 origin-left"
                      style={{ transform: `scaleX(${shieldPct / 100})` }}
                    />
                  </div>
                )}

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
              </div>
            );
          })}

          {/* Precision Crosshair + Hit/Kill Reticle */}
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="relative w-8 h-8 flex items-center justify-center">
              <div className="w-1 h-1 rounded-full bg-amber-400" />
              <div className="absolute top-0 w-0.5 h-2 bg-white/80" />
              <div className="absolute bottom-0 w-0.5 h-2 bg-white/80" />
              <div className="absolute left-0 h-0.5 w-2 bg-white/80" />
              <div className="absolute right-0 h-0.5 w-2 bg-white/80" />
              {hud.smartTargetLocked && (
                <div className="absolute inset-0 rounded-full border border-emerald-400/80 scale-110" />
              )}
              {(hud.hitMarkerActive || hud.killMarkerActive) && (
                <svg
                  viewBox="0 0 32 32"
                  className={`absolute inset-0 w-8 h-8 ${
                    hud.killMarkerActive ? 'stroke-rose-500' : 'stroke-amber-400'
                  }`}
                  fill="none"
                  strokeWidth="2.2"
                >
                  <line x1="4" y1="4" x2="11" y2="11" />
                  <line x1="28" y1="4" x2="21" y2="11" />
                  <line x1="4" y1="28" x2="11" y2="21" />
                  <line x1="28" y1="28" x2="21" y2="21" />
                </svg>
              )}
            </div>
          </div>

          {/* Dynamic Environment Event Banner */}
          {hud.activeEnvironmentEvent && (
            <div
              data-testid="active-env-event-banner"
              className="fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl border text-center pointer-events-none"
              style={{
                backgroundColor: 'rgba(9,13,22,0.9)',
                borderColor: hud.activeEnvironmentEvent.accentColor,
              }}
            >
              <div
                className="text-xs font-mono font-bold tracking-wider uppercase"
                style={{ color: hud.activeEnvironmentEvent.accentColor }}
              >
                ⚡ {hud.activeEnvironmentEvent.name} (
                {hud.activeEnvironmentEvent.remainingSec.toFixed(0)}s)
              </div>
              <div className="text-[11px] font-mono text-slate-200">
                {hud.activeEnvironmentEvent.subtitle}
              </div>
            </div>
          )}

          {/* Contextual Salvage Pickup Prompt */}
          {hud.interactionPrompt && (
            <div className="fixed left-1/2 top-[58%] -translate-x-1/2 px-3 py-1 rounded bg-slate-950/90 border border-amber-400/50 text-xs font-mono text-amber-300">
              {hud.interactionPrompt}
            </div>
          )}

          {/* CORNER CLUSTER 1 (TOP-LEFT): Tactical Radar + Infinite Chunk Telemetry */}
          <div
            className="fixed top-4 left-4 rounded-xl border border-white/15 p-3 flex items-center gap-3.5"
            style={{ backgroundColor: 'rgba(9,13,22,0.86)' }}
          >
            <div className="relative w-20 h-20 rounded-full bg-slate-950 border border-sky-400/40 overflow-hidden shrink-0">
              <div className="absolute inset-2 rounded-full border border-white/10" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white" />
              {hud.minimapEntities.enemies.map((e, idx) => {
                const dx = (e.x - hud.minimapEntities.playerX) * 0.65;
                const dz = (e.z - hud.minimapEntities.playerZ) * 0.65;
                const cx = Math.max(-34, Math.min(34, dx));
                const cz = Math.max(-34, Math.min(34, dz));
                return (
                  <span
                    key={idx}
                    style={{
                      transform: `translate3d(${40 + cx}px, ${40 + cz}px, 0)`,
                    }}
                    className={`absolute left-0 top-0 w-1.5 h-1.5 -ml-0.5 -mt-0.5 rounded-full ${
                      e.isWindup ? 'bg-amber-400' : 'bg-rose-500'
                    }`}
                  />
                );
              })}
              {hud.minimapEntities.squadmates.map((sq, idx) => {
                const dx = (sq.x - hud.minimapEntities.playerX) * 0.65;
                const dz = (sq.z - hud.minimapEntities.playerZ) * 0.65;
                const cx = Math.max(-34, Math.min(34, dx));
                const cz = Math.max(-34, Math.min(34, dz));
                return (
                  <span
                    key={idx}
                    style={{
                      transform: `translate3d(${40 + cx}px, ${40 + cz}px, 0)`,
                    }}
                    className="absolute left-0 top-0 w-1.5 h-1.5 -ml-0.5 -mt-0.5 rounded-full bg-emerald-400"
                  />
                );
              })}
            </div>

            <div className="space-y-1 pr-1">
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-[10px] font-mono uppercase text-sky-400">
                    {currentModeDef.shortLabel} · {currentHardnessDef.name}
                  </div>
                  <div className="text-lg font-display font-bold tabular-nums text-white">
                    {battleMode === 'battle-royale'
                      ? `ALIVE ${hud.brPlayersAlive ?? 100}/100`
                      : `WAVE ${hud.wave}/${hud.totalWaves}`}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-400">
                    {battleMode === 'party-vs' ? 'PARTY RIVALS' : 'HOSTILES'}
                  </div>
                  <div
                    data-testid="hud-hostiles-remaining"
                    className="text-lg font-display font-bold tabular-nums text-rose-400"
                  >
                    {hud.enemiesRemaining}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-400">
                    TIME · KILLS
                  </div>
                  <div className="text-lg font-display font-bold tabular-nums text-amber-400">
                    {hud.matchElapsedSec}s · {hud.eliminations}K
                  </div>
                </div>
              </div>
              <div
                data-testid="hud-chunk-weather-badge"
                className="text-[10px] font-mono text-emerald-300 flex flex-wrap items-center gap-2 border-t border-white/10 pt-1"
              >
                <span>
                  {hud.useChunkStreaming
                    ? `CHUNK [${hud.activeChunkKey}] · ${hud.loadedChunkCount} STREAMING`
                    : `${hud.arenaSizeLabel}`}
                </span>
                <span className="text-slate-500">·</span>
                <span
                  data-testid="hud-stealth-discovery-badge"
                  className={
                    hud.discoveredByCount > 0
                      ? 'text-amber-300 font-bold'
                      : 'text-emerald-300'
                  }
                >
                  {hud.discoveredByCount > 0
                    ? `ENGAGED (${hud.discoveredByCount} IN 25M)`
                    : 'STEALTH (>25 BLOCKS)'}
                </span>
              </div>
            </div>
          </div>

          {/* CORNER CLUSTER 2 (TOP-RIGHT): Compact Utility Buttons */}
          <div className="fixed top-4 right-4 pointer-events-auto flex items-center gap-1.5">
            <button
              type="button"
              tabIndex={-1}
              data-testid="hud-weather-toggle-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                setWeatherMode((prev) =>
                  prev === 'light-rain-blur'
                    ? 'storm-squall'
                    : prev === 'storm-squall'
                      ? 'mist-veil'
                      : 'light-rain-blur'
                );
              }}
              className="px-2.5 h-9 rounded-lg border border-sky-400/35 flex items-center justify-center text-[10px] font-mono font-bold text-sky-300 hover:bg-slate-800 cursor-pointer"
              style={{ backgroundColor: 'rgba(9,13,22,0.85)' }}
            >
              RAIN/BLUR
            </button>
            <button
              type="button"
              tabIndex={-1}
              data-testid="hud-trigger-event-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                setTriggerEventNonce((n) => n + 1);
              }}
              className="px-2.5 h-9 rounded-lg border border-amber-400/35 flex items-center justify-center text-[10px] font-mono font-bold text-amber-300 hover:bg-slate-800 cursor-pointer"
              style={{ backgroundColor: 'rgba(9,13,22,0.85)' }}
            >
              EVENT [H]
            </button>
            <button
              type="button"
              tabIndex={-1}
              data-testid="hud-smart-assist-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                setSmartControl((prev) => ({
                  ...prev,
                  enabled: !prev.enabled,
                }));
              }}
              className={`px-2.5 h-9 rounded-lg border flex items-center justify-center text-[10px] font-mono font-bold cursor-pointer ${
                smartControl.enabled
                  ? 'border-emerald-400/40 text-emerald-300'
                  : 'border-white/15 text-slate-400'
              }`}
              style={{ backgroundColor: 'rgba(9,13,22,0.85)' }}
            >
              {smartControl.enabled ? 'SMART:ON' : 'SMART:OFF'}
            </button>
            <button
              type="button"
              tabIndex={-1}
              data-testid="hud-open-replay-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                document.exitPointerLock?.();
                setReplayTimeSec(0);
                setReplayPlaying(true);
                handleStateChange('replay');
              }}
              className="px-2.5 h-9 rounded-lg border border-white/15 flex items-center justify-center text-[10px] font-mono font-bold text-emerald-300 hover:bg-slate-800 cursor-pointer"
              style={{ backgroundColor: 'rgba(9,13,22,0.85)' }}
            >
              REPLAY
            </button>
            <button
              type="button"
              tabIndex={-1}
              data-testid="hud-cycle-controls-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                setControlScheme((prev) =>
                  prev === 'auto'
                    ? 'touch'
                    : prev === 'touch'
                      ? 'console'
                      : prev === 'console'
                        ? 'pc'
                        : 'auto'
                );
              }}
              className="px-2.5 h-9 rounded-lg border border-white/15 flex items-center justify-center text-[10px] font-mono font-bold text-sky-300 hover:bg-slate-800 cursor-pointer"
              style={{ backgroundColor: 'rgba(9,13,22,0.85)' }}
            >
              {controlScheme === 'auto'
                ? `AUTO:${effectiveInputDevice.toUpperCase()}`
                : controlScheme.toUpperCase()}
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

          {/* MUTUALLY EXCLUSIVE ACTIVE INPUT OVERLAY */}
          {effectiveInputDevice === 'touch' ? (
            <TouchControlsOverlay
              touchInputRef={touchInputRef}
              selectedWallType={selectedWallType}
              onSelectWallType={setSelectedWallType}
            />
          ) : (
            <div
              data-testid="active-device-prompt"
              data-device={effectiveInputDevice}
              className="fixed bottom-4 left-1/2 -translate-x-1/2 max-w-[540px] truncate px-3 py-1 rounded-lg border border-white/10 text-[10px] font-mono text-slate-300 pointer-events-none whitespace-nowrap hidden xl:block"
              style={{ backgroundColor: 'rgba(9,13,22,0.82)' }}
            >
              {effectiveInputDevice === 'console'
                ? 'PAD ACTIVE · LS Move/Parkour · RS Aim · RT/LT Fire/ADS · [A] Vault · [B] Slide · [RB] Build · [Y] Ability'
                : 'PC KBM ACTIVE · WASD Move · Space Vault/Climb · C Slide · LMB/RMB Fire/ADS · Q Ability · F Build · H Event'}
            </div>
          )}

          {/* CORNER CLUSTER 3 (BOTTOM-LEFT): Operator HP, Shield, Stamina & Movement State */}
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

            <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
              <span>STAMINA {hud.stamina}%</span>
              <span className="text-emerald-300">
                {hud.stimActiveTimer > 0
                  ? `BIO-STIM (${hud.stimActiveTimer.toFixed(1)}s)`
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
                    ? `${currentWeapon.abilityName} ACTIVE`
                    : `${currentWeapon.abilityName} · [Q] READY`}
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

            <div className="grid grid-cols-3 gap-2.5 mb-4 text-center font-mono tabular-nums">
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
                <div className="text-[10px] text-slate-400">TIME</div>
                <div className="text-lg font-bold text-sky-400">
                  {hud.matchElapsedSec}s
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
                data-testid="pause-watch-replay-btn"
                onClick={() => {
                  setReplayTimeSec(0);
                  setReplayPlaying(true);
                  handleStateChange('replay');
                }}
                className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
              >
                Watch 3D Match Replay
              </button>
              <button
                type="button"
                onClick={() => handleStateChange('title')}
                className="w-full py-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-white/10 text-xs font-semibold cursor-pointer"
              >
                Return to Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STATE 4: VICTORY / DEFEAT MODAL WITH CUSTOM TIME + KPM XP & CREDITS   */}
      {/* ===================================================================== */}
      {gameState === 'gameover' && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-6"
          style={{ backgroundColor: 'rgba(9,13,22,0.88)' }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div>
              <div
                className={`text-xs font-mono font-bold mb-1 ${
                  outcomeSnapshot?.victory
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                {outcomeSnapshot?.victory
                  ? 'SECTOR SECURED · VICTORY CREDITS AWARDED'
                  : 'OPERATOR DOWN · MATCH COMPLETED'}
              </div>
              <h2 className="text-2xl font-display font-bold text-white">
                {outcomeSnapshot?.victory
                  ? 'Tactical Victory'
                  : 'Combat Defeat'}
              </h2>
            </div>

            {/* Custom XP (Time + Kills-Per-Minute Velocity) & Credits Breakdown */}
            {outcomeSnapshot?.rewards && (
              <div
                data-testid="match-rewards-breakdown"
                className="p-3.5 rounded-xl bg-slate-950 border border-white/10 space-y-2 font-mono text-xs"
              >
                <div className="flex items-center justify-between text-slate-300">
                  <span>
                    Match Time ({outcomeSnapshot.durationSec}s) +{' '}
                    {outcomeSnapshot.eliminations} Kills (
                    {outcomeSnapshot.rewards.killsPerMinute} KPM)
                  </span>
                  <span className="text-sky-400 font-bold">
                    +{outcomeSnapshot.rewards.timeXp + outcomeSnapshot.rewards.eliminationXp} XP
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>Kills-Per-Minute Velocity Bonus XP</span>
                  <span className="text-emerald-400 font-bold">
                    +{outcomeSnapshot.rewards.kpmVelocityBonusXp} XP
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/10 text-sm font-bold">
                  <span className="text-white">TOTAL CUSTOM XP EARNED</span>
                  <span className="text-sky-300">
                    +{outcomeSnapshot.rewards.totalXpEarned} XP (LVL{' '}
                    {levelInfo.level})
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/10 text-sm font-bold">
                  <span className="text-amber-300">
                    SHOP CREDITS EARNED{' '}
                    {outcomeSnapshot.victory ? '(WIN BONUS!)' : ''}
                  </span>
                  <span className="text-amber-400">
                    +{outcomeSnapshot.rewards.creditsEarned} CR (Total:{' '}
                    {localCredits} CR)
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                data-start="true"
                onClick={() => {
                  setRestartNonce((n) => n + 1);
                  handleStartDeployment();
                }}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm cursor-pointer"
              >
                Play Again ({currentModeDef.name})
              </button>
              <button
                type="button"
                onClick={() => {
                  setLobbyPage('shop');
                  handleStateChange('title');
                }}
                className="w-full py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer"
              >
                Spend Credits in Skin Shop ({localCredits} CR)
              </button>
              <button
                type="button"
                onClick={() => {
                  setLobbyPage('play');
                  handleStateChange('title');
                }}
                className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
              >
                Return to Main Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STATE 5: 3D TACTICAL MATCH REPLAY VIEWER                              */}
      {/* ===================================================================== */}
      {gameState === 'replay' && (
        <div
          data-testid="replay-viewer-overlay"
          className="fixed inset-0 z-30 pointer-events-none flex flex-col justify-between p-5"
        >
          <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-3">
            <div
              className="px-4 py-2.5 rounded-xl border border-emerald-400/40 flex items-center gap-3"
              style={{ backgroundColor: 'rgba(9,13,22,0.9)' }}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <div>
                <div className="text-xs font-mono font-bold text-emerald-300">
                  3D TACTICAL MATCH REPLAY · {currentBiome.name.toUpperCase()}
                </div>
                <div className="text-[11px] font-mono text-slate-300">
                  Operator {replayRecording?.callsign ?? callsign} · Score{' '}
                  {replayRecording?.finalScore ?? hud.score}
                </div>
              </div>
            </div>

            <div
              className="flex items-center gap-1.5 p-1.5 rounded-xl border border-white/15"
              style={{ backgroundColor: 'rgba(9,13,22,0.9)' }}
            >
              {(
                [
                  { id: 'fpv', label: '1ST-PERSON POV' },
                  { id: 'orbit', label: '3RD-PERSON ORBIT' },
                  { id: 'drone', label: 'TACTICAL DRONE' },
                ] as const
              ).map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  data-testid={`replay-cam-${cam.id}`}
                  onClick={() => setReplayCameraMode(cam.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold cursor-pointer ${
                    replayCameraMode === cam.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-900 text-slate-300'
                  }`}
                >
                  {cam.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="replay-return-game-btn"
                onClick={() => handleStateChange('playing')}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs cursor-pointer"
              >
                Resume Live Match
              </button>
              <button
                type="button"
                data-testid="replay-exit-lobby-btn"
                onClick={() => handleStateChange('title')}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-white/15 text-xs font-semibold cursor-pointer"
              >
                Lobby
              </button>
            </div>
          </div>

          <div
            className="pointer-events-auto w-full max-w-4xl mx-auto rounded-xl border border-white/15 p-4 shadow-2xl space-y-3"
            style={{ backgroundColor: 'rgba(9,13,22,0.92)' }}
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-testid="replay-play-toggle"
                onClick={() => setReplayPlaying((p) => !p)}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-bold text-xs cursor-pointer shrink-0"
              >
                {replayPlaying ? 'PAUSE' : 'PLAY'}
              </button>

              <input
                type="range"
                data-testid="replay-scrubber"
                min={0}
                max={Math.max(1, replayRecording?.durationSec ?? 12)}
                step={0.05}
                value={Math.min(
                  replayTimeSec,
                  Math.max(1, replayRecording?.durationSec ?? 12)
                )}
                onChange={(e) => setReplayTimeSec(parseFloat(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />

              <div className="text-xs font-mono tabular-nums text-white shrink-0 w-24 text-right">
                {replayTimeSec.toFixed(1)}s /{' '}
                {(replayRecording?.durationSec ?? 12).toFixed(1)}s
              </div>
            </div>
          </div>
        </div>
      )}

      {gameState !== 'title' && (
        <div
          data-testid="app-credits-hud-badge"
          className="fixed bottom-0.5 right-4 z-30 pointer-events-none text-[10px] leading-none font-mono tracking-wide text-slate-400/90"
        >
          Credits:{' '}
          <span className="font-semibold text-amber-400/90">
            motech11, Google LLC.
          </span>
        </div>
      )}
    </main>
  );
}
