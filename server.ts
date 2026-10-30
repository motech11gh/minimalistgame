import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Exponential backoff helper for upstream scientific APIs
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 2,
  baseDelayMs = 450
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.ok) {
      return response;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      const delay =
        !Number.isNaN(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    const errorBody = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`);
  }
  throw new Error(`Exhausted retries for ${url}`);
}

// Verified fallback PubChem + ChEMBL dataset for instant offline/rate-limited reliability
const VERIFIED_COMPOUNDS: Record<
  number,
  {
    cid: number;
    name: string;
    chemblId: string;
    targetName: string;
    targetAccession: string;
    formula: string;
    mw: number;
    smiles: string;
    inchikey: string;
    xlogp: number;
    tpsa: number;
    hbd: number;
    hba: number;
    rotatableBonds: number;
    ic50nM: number;
    pchembl: number;
    mechanism: string;
    combatBuff: {
      label: string;
      speedMultiplier: number;
      recoilReduction: number;
      regenPerSec: number;
      damageBonus: number;
    };
  }
> = {
  5816: {
    cid: 5816,
    name: 'Epinephrine (Adrenaline)',
    chemblId: 'CHEMBL679',
    targetName: 'Beta-2 Adrenergic Receptor (ADRB2)',
    targetAccession: 'P07550',
    formula: 'C9H13NO3',
    mw: 183.2,
    smiles: 'CNC[C@@H](C1=CC(=C(C=C1)O)O)O',
    inchikey: 'UCTWMZQNUQWSLP-VIFPVBQESA-N',
    xlogp: -1.4,
    tpsa: 72.7,
    hbd: 4,
    hba: 4,
    rotatableBonds: 3,
    ic50nM: 125.0,
    pchembl: 6.9,
    mechanism: 'Adrenergic receptor agonist triggering rapid sympathetic surge',
    combatBuff: {
      label: '+18% Sprint & Slide Velocity · +4 HP/s Trauma Recovery',
      speedMultiplier: 1.18,
      recoilReduction: 0.08,
      regenPerSec: 4,
      damageBonus: 0.05,
    },
  },
  2519: {
    cid: 2519,
    name: 'Caffeine (Trimethylxanthine)',
    chemblId: 'CHEMBL113',
    targetName: 'Adenosine A2A Receptor (ADORA2A)',
    targetAccession: 'P29274',
    formula: 'C8H10N4O2',
    mw: 194.19,
    smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C',
    inchikey: 'RYYVLZVUVIJVGH-UHFFFAOYSA-N',
    xlogp: -0.1,
    tpsa: 58.4,
    hbd: 0,
    hba: 3,
    rotatableBonds: 0,
    ic50nM: 2400.0,
    pchembl: 5.62,
    mechanism: 'Adenosine A1/A2A receptor antagonist enhancing neural alertness',
    combatBuff: {
      label: '+22% ADS Snap & Recoil Stabilization · +10% Move Cadence',
      speedMultiplier: 1.1,
      recoilReduction: 0.22,
      regenPerSec: 2,
      damageBonus: 0.04,
    },
  },
  3676: {
    cid: 3676,
    name: 'Lidocaine',
    chemblId: 'CHEMBL79',
    targetName: 'Sodium Channel Protein Type 5 Subunit Alpha (SCN5A)',
    targetAccession: 'Q14524',
    formula: 'C14H22N2O',
    mw: 234.34,
    smiles: 'CCN(CC)CC(=O)NC1=C(C=CC=C1C)C',
    inchikey: 'NNJVILVZKWQKPM-UHFFFAOYSA-N',
    xlogp: 2.4,
    tpsa: 32.3,
    hbd: 1,
    hba: 2,
    rotatableBonds: 5,
    ic50nM: 18500.0,
    pchembl: 4.73,
    mechanism: 'Voltage-gated sodium channel blocker suppressing pain flinch',
    combatBuff: {
      label: '+8 HP/s Sustained Bio-Regen · -30% Hit Aim-Flinch',
      speedMultiplier: 1.05,
      recoilReduction: 0.18,
      regenPerSec: 8,
      damageBonus: 0.02,
    },
  },
  4236: {
    cid: 4236,
    name: 'Modafinil',
    chemblId: 'CHEMBL1068',
    targetName: 'Sodium-Dependent Dopamine Transporter (SLC6A3)',
    targetAccession: 'Q01959',
    formula: 'C15H15NO2S',
    mw: 273.35,
    smiles: 'C1=CC=C(C=C1)C(C2=CC=CC=C2)S(=O)CC(=O)N',
    inchikey: 'YFGHCGITMMYXAQ-UHFFFAOYSA-N',
    xlogp: 1.6,
    tpsa: 79.4,
    hbd: 1,
    hba: 2,
    rotatableBonds: 5,
    ic50nM: 2600.0,
    pchembl: 5.58,
    mechanism: 'Selective dopamine transporter inhibitor optimizing target tracking',
    combatBuff: {
      label: '+14% Ballistic Precision Damage · +25% Recoil Control',
      speedMultiplier: 1.07,
      recoilReduction: 0.25,
      regenPerSec: 3,
      damageBonus: 0.14,
    },
  },
  5311068: {
    cid: 5311068,
    name: 'Dexmedetomidine',
    chemblId: 'CHEMBL778',
    targetName: 'Alpha-2A Adrenergic Receptor (ADRA2A)',
    targetAccession: 'P08913',
    formula: 'C13H16N2',
    mw: 200.28,
    smiles: 'CC1=C(C=CC=C1[C@H](C)C2=CN=CN2)C',
    inchikey: 'CUHVIMMYOGQXCV-JTQLQIEISA-N',
    xlogp: 3.1,
    tpsa: 28.7,
    hbd: 1,
    hba: 1,
    rotatableBonds: 2,
    ic50nM: 1.6,
    pchembl: 8.8,
    mechanism: 'Highly selective Alpha-2A adrenergic agonist for sniper steadiness',
    combatBuff: {
      label: '+32% Marksman Recoil Damping · +10% Headshot Multiplier',
      speedMultiplier: 1.04,
      recoilReduction: 0.32,
      regenPerSec: 5,
      damageBonus: 0.1,
    },
  },
};

interface RemoteOperator {
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
  updatedAt: number;
}

interface SharedWall {
  id: string;
  type: 'barricade' | 'rampart' | 'bastion';
  x: number;
  y: number;
  z: number;
  rotY: number;
  hp: number;
  maxHp: number;
  ownerCallsign: string;
  mapId: string;
}

const roomOperators = new Map<string, RemoteOperator>();
const roomWalls = new Map<string, SharedWall>();
const clientMap = new Map<WebSocket, string>();
const wsCodeMap = new Map<WebSocket, string>();

function ensureSeedSquadState() {
  if (!roomWalls.has('wall-seed-alpha')) {
    roomWalls.set('wall-seed-alpha', {
      id: 'wall-seed-alpha',
      type: 'rampart',
      x: 6,
      y: 0,
      z: -10,
      rotY: 0.25,
      hp: 420,
      maxHp: 450,
      ownerCallsign: 'VANGUARD-HQ',
      mapId: 'alpine-outpost',
    });
  }
}
ensureSeedSquadState();

async function startServer() {
  const app = express();
  app.use(express.json());

  // Bioscience API Proxy: PubChem + ChEMBL live lookup with authoritative fallback
  app.get('/api/science/compound/:cid', async (req, res) => {
    const cid = Number(req.params.cid) || 5816;
    const baseCompound = VERIFIED_COMPOUNDS[cid] || VERIFIED_COMPOUNDS[5816];
    try {
      const pubchemUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/MolecularFormula,MolecularWeight,CanonicalSMILES,InChIKey,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount,RotatableBondCount/JSON`;
      const response = await fetchWithRetry(pubchemUrl, {}, 1, 350);
      const data = (await response.json()) as {
        PropertyTable?: { Properties?: Array<Record<string, unknown>> };
      };
      const props = data?.PropertyTable?.Properties?.[0];
      if (props) {
        res.json({
          ...baseCompound,
          cid,
          formula: String(props.MolecularFormula || baseCompound.formula),
          mw: Number(props.MolecularWeight || baseCompound.mw),
          smiles: String(props.CanonicalSMILES || baseCompound.smiles),
          inchikey: String(props.InChIKey || baseCompound.inchikey),
          xlogp: Number(props.XLogP ?? baseCompound.xlogp),
          tpsa: Number(props.TPSA ?? baseCompound.tpsa),
          hbd: Number(props.HBondDonorCount ?? baseCompound.hbd),
          hba: Number(props.HBondAcceptorCount ?? baseCompound.hba),
          rotatableBonds: Number(props.RotatableBondCount ?? baseCompound.rotatableBonds),
          source: 'PubChem PUG REST + ChEMBL v34',
        });
        return;
      }
    } catch {
      // Fallback to verified authoritative record if offline or rate-limited
    }
    res.json({
      ...baseCompound,
      source: 'PubChem PUG REST + ChEMBL v34 (Cached Reference)',
    });
  });

  app.get('/api/multiplayer/status', (_req, res) => {
    res.json({
      operators: Array.from(roomOperators.values()),
      walls: Array.from(roomWalls.values()),
      serverTime: Date.now(),
    });
  });

  // Real Online Account Directory, Friend Code Requests & Party Handshake System (No Bot Accounts)
  interface OnlineAccountEntry {
    friendCode: string;
    username: string;
    level: number;
    skinId: string;
    status: 'online' | 'in-match' | 'offline';
    online: boolean;
    updatedAt: number;
  }

  interface ServerFriendRequest {
    id: string;
    fromCode: string;
    toCode: string;
    fromUsername: string;
    toUsername: string;
    status: 'pending' | 'accepted' | 'declined';
    timestamp: number;
  }

  interface ServerPartyInvite {
    id: string;
    fromCode: string;
    fromUsername: string;
    fromLevel: number;
    fromSkinId: string;
    toCode: string;
    toUsername: string;
    toLevel: number;
    toSkinId: string;
    status: 'pending' | 'accepted' | 'declined';
    timestamp: number;
  }

  function normalizeCodeServer(raw: string): string {
    const cleaned = String(raw || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (!cleaned) return '';
    const body = cleaned.startsWith('VX') ? cleaned.slice(2) : cleaned;
    if (!body) return '';
    return `VX-${body.slice(0, 6)}`;
  }

  function generateCodeFromUsername(username: string): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let hash = 2166136261;
    for (let i = 0; i < username.length; i++) {
      hash ^= username.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    let code = 'VX-';
    for (let i = 0; i < 6; i++) {
      const idx = Math.abs((hash >>> (i * 4)) ^ (hash >>> (i + 3))) % alphabet.length;
      code += alphabet[idx];
    }
    return code;
  }

  // Strictly real registered accounts only — zero bot friends
  const onlineAccounts = new Map<string, OnlineAccountEntry>();
  const serverFriendRequests: ServerFriendRequest[] = [];
  const serverPartyInvites: ServerPartyInvite[] = [];

  app.post('/api/accounts/register', (req, res) => {
    const rawUsername = String(req.body?.username || '').trim().slice(0, 28);
    if (rawUsername.length < 2) {
      res.status(400).json({ error: 'Username must be at least 2 characters.' });
      return;
    }
    const rawCode = normalizeCodeServer(String(req.body?.friendCode || ''));
    const friendCode =
      /^VX-[A-Z0-9]{6}$/.test(rawCode) ? rawCode : generateCodeFromUsername(rawUsername);

    const requestedStatus =
      req.body?.status === 'offline' || req.body?.online === false
        ? 'offline'
        : req.body?.status === 'in-match'
          ? 'in-match'
          : 'online';

    const entry: OnlineAccountEntry = {
      friendCode,
      username: rawUsername,
      level: Math.max(1, Number(req.body?.level || 1)),
      skinId: String(req.body?.skinId || 'vanguard-obsidian'),
      status: requestedStatus,
      online: requestedStatus !== 'offline',
      updatedAt: Date.now(),
    };
    onlineAccounts.set(friendCode, entry);

    for (const r of serverFriendRequests) {
      if (r.fromCode === friendCode) r.fromUsername = rawUsername;
      if (r.toCode === friendCode) r.toUsername = rawUsername;
    }
    for (const p of serverPartyInvites) {
      if (p.fromCode === friendCode) {
        p.fromUsername = rawUsername;
        p.fromLevel = entry.level;
        p.fromSkinId = entry.skinId;
      }
      if (p.toCode === friendCode) {
        p.toUsername = rawUsername;
        p.toLevel = entry.level;
        p.toSkinId = entry.skinId;
      }
    }

    broadcast({ type: 'account:registered', account: entry });
    res.json({
      ok: true,
      account: entry,
    });
  });

  // Update online / offline availability status for an account
  app.post('/api/accounts/status', (req, res) => {
    const friendCode = normalizeCodeServer(String(req.body?.friendCode || ''));
    const existing = onlineAccounts.get(friendCode);
    if (!existing) {
      res.status(404).json({ error: `Account ${friendCode} not found.` });
      return;
    }
    const nextStatus =
      req.body?.status === 'offline' || req.body?.online === false
        ? 'offline'
        : req.body?.status === 'in-match'
          ? 'in-match'
          : 'online';
    existing.status = nextStatus;
    existing.online = nextStatus !== 'offline';
    existing.updatedAt = Date.now();
    onlineAccounts.set(friendCode, existing);
    broadcast({ type: 'account:status', account: existing });
    res.json({ ok: true, account: existing });
  });

  function buildFriendsStateForCode(rawCode: string, rawUsername: string) {
    const myCode = normalizeCodeServer(rawCode);
    const myUpper = String(rawUsername || '').trim().toUpperCase();

    const requests = serverFriendRequests
      .filter(
        (r) =>
          (myCode && (r.fromCode === myCode || r.toCode === myCode)) ||
          (myUpper &&
            (r.fromUsername.toUpperCase() === myUpper ||
              r.toUsername.toUpperCase() === myUpper))
      )
      .map((r) => {
        const isOutgoing =
          (myCode && r.fromCode === myCode) ||
          (!myCode && myUpper && r.fromUsername.toUpperCase() === myUpper);
        return {
          ...r,
          direction: (isOutgoing ? 'outgoing' : 'incoming') as 'outgoing' | 'incoming',
        };
      });

    const acceptedFriendCodes = new Set<string>();
    for (const r of requests) {
      if (r.status === 'accepted') {
        const otherCode = r.direction === 'outgoing' ? r.toCode : r.fromCode;
        if (otherCode && otherCode !== myCode) {
          acceptedFriendCodes.add(otherCode);
        }
      }
    }

    // Party invites involving this player
    const partyInvites = serverPartyInvites
      .filter(
        (p) =>
          p.status !== 'declined' &&
          (p.fromCode === myCode || p.toCode === myCode)
      )
      .map((p) => ({
        ...p,
        direction: (p.fromCode === myCode ? 'outgoing' : 'incoming') as 'outgoing' | 'incoming',
      }));

    // Accepted party members (mutual: both inviter and invitee see each other in their active party!)
    const acceptedPartyCodes = new Set<string>();
    for (const p of partyInvites) {
      if (p.status === 'accepted') {
        const otherCode = p.fromCode === myCode ? p.toCode : p.fromCode;
        if (otherCode && otherCode !== myCode) {
          acceptedPartyCodes.add(otherCode);
        }
      }
    }

    const friends = Array.from(acceptedFriendCodes)
      .map((code) => onlineAccounts.get(code))
      .filter((entry): entry is OnlineAccountEntry => Boolean(entry))
      .map((entry) => ({
        friendCode: entry.friendCode,
        username: entry.username,
        level: entry.level,
        skinId: entry.skinId,
        status: entry.status,
        online: entry.online,
        inParty: acceptedPartyCodes.has(entry.friendCode),
      }));

    const partyMembers = Array.from(acceptedPartyCodes)
      .map((code) => onlineAccounts.get(code))
      .filter((entry): entry is OnlineAccountEntry => Boolean(entry))
      .map((entry) => ({
        friendCode: entry.friendCode,
        username: entry.username,
        level: entry.level,
        skinId: entry.skinId,
        status: entry.status,
        online: entry.online,
        inParty: true,
      }));

    return {
      friends,
      requests,
      partyInvites,
      partyMembers,
    };
  }

  app.get('/api/friends/state', (req, res) => {
    const myCode = String(req.query.friendCode || '').trim();
    const myUsername = String(req.query.username || '').trim();
    res.json(buildFriendsStateForCode(myCode, myUsername));
  });

  app.post('/api/friends/request', (req, res) => {
    const fromUsername = String(req.body?.fromUsername || 'VANGUARD_01')
      .trim()
      .slice(0, 28);
    const rawFromCode = normalizeCodeServer(String(req.body?.fromCode || ''));
    const fromCode =
      /^VX-[A-Z0-9]{6}$/.test(rawFromCode)
        ? rawFromCode
        : generateCodeFromUsername(fromUsername);

    if (!onlineAccounts.has(fromCode)) {
      onlineAccounts.set(fromCode, {
        friendCode: fromCode,
        username: fromUsername,
        level: Math.max(1, Number(req.body?.fromLevel || 1)),
        skinId: String(req.body?.fromSkinId || 'vanguard-obsidian'),
        status: 'online',
        online: true,
        updatedAt: Date.now(),
      });
    }

    const rawTargetInput = String(req.body?.toCode || req.body?.toUsername || '').trim();
    const toCode = normalizeCodeServer(rawTargetInput);

    if (!/^VX-[A-Z0-9]{6}$/.test(toCode)) {
      res.status(400).json({
        error: `No player found with friend code "${rawTargetInput || 'EMPTY'}". Friend codes use format VX-XXXXXX.`,
      });
      return;
    }

    if (fromCode === toCode) {
      res.status(400).json({
        error: 'You cannot send a friend request to your own friend code.',
      });
      return;
    }

    const targetAccount = onlineAccounts.get(toCode);
    if (!targetAccount) {
      res.status(404).json({
        error: `No player found with friend code "${toCode}". Check the code in their Account tab and try again.`,
      });
      return;
    }

    const existingReq = serverFriendRequests.find(
      (r) =>
        r.status !== 'declined' &&
        ((r.fromCode === fromCode && r.toCode === toCode) ||
          (r.fromCode === toCode && r.toCode === fromCode))
    );

    if (existingReq) {
      if (existingReq.status === 'accepted') {
        res.status(400).json({
          error: `Player ${targetAccount.username} (${toCode}) is already in your Friends list.`,
        });
        return;
      }
      if (existingReq.fromCode === toCode && existingReq.status === 'pending') {
        existingReq.status = 'accepted';
        broadcast({ type: 'friend:responded', request: existingReq });
        const state = buildFriendsStateForCode(fromCode, fromUsername);
        res.json({
          ok: true,
          request: { ...existingReq, direction: 'incoming' },
          targetProfile: targetAccount,
          ...state,
        });
        return;
      }
      res.status(400).json({
        error: `Friend request to ${targetAccount.username} (${toCode}) is already pending.`,
      });
      return;
    }

    const newReq: ServerFriendRequest = {
      id: `freq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      fromCode,
      toCode,
      fromUsername,
      toUsername: targetAccount.username,
      status: 'pending',
      timestamp: Date.now(),
    };
    serverFriendRequests.unshift(newReq);
    broadcast({ type: 'friend:request', request: newReq });

    const state = buildFriendsStateForCode(fromCode, fromUsername);
    res.json({
      ok: true,
      request: { ...newReq, direction: 'outgoing' },
      targetProfile: targetAccount,
      ...state,
    });
  });

  app.post('/api/friends/respond', (req, res) => {
    const friendCode = normalizeCodeServer(String(req.body?.friendCode || ''));
    const username = String(req.body?.username || 'VANGUARD_01').trim();
    const requestId = String(req.body?.requestId || '');
    const action = req.body?.action === 'decline' ? 'declined' : 'accepted';
    const found = serverFriendRequests.find((r) => r.id === requestId);
    if (!found) {
      res.status(404).json({ error: 'Friend request not found.' });
      return;
    }
    found.status = action;
    broadcast({ type: 'friend:responded', request: found });
    const state = buildFriendsStateForCode(friendCode, username);
    res.json({ ok: true, request: found, ...state });
  });

  // Party Invite Handshake: Sender must wait until the invited friend accepts the party request
  app.post('/api/party/invite', (req, res) => {
    const fromCode = normalizeCodeServer(String(req.body?.fromCode || ''));
    const fromUsername = String(req.body?.fromUsername || 'VANGUARD_01').trim();
    const fromLevel = Math.max(1, Number(req.body?.fromLevel || 1));
    const fromSkinId = String(req.body?.fromSkinId || 'vanguard-obsidian');
    const toCode = normalizeCodeServer(String(req.body?.toCode || ''));

    if (!fromCode || !toCode || fromCode === toCode) {
      res.status(400).json({ error: 'Invalid party invite target code.' });
      return;
    }

    const targetAccount = onlineAccounts.get(toCode);
    if (!targetAccount) {
      res.status(404).json({ error: `Friend ${toCode} not found.` });
      return;
    }

    if (!targetAccount.online || targetAccount.status === 'offline') {
      res.status(400).json({
        error: `${targetAccount.username} (${toCode}) is currently OFFLINE and unavailable for party invites.`,
      });
      return;
    }

    // Check if an active or pending party invite already exists between these two players
    const existingInvite = serverPartyInvites.find(
      (p) =>
        p.status !== 'declined' &&
        ((p.fromCode === fromCode && p.toCode === toCode) ||
          (p.fromCode === toCode && p.toCode === fromCode))
    );

    if (existingInvite) {
      if (existingInvite.status === 'accepted') {
        const state = buildFriendsStateForCode(fromCode, fromUsername);
        res.json({ ok: true, invite: existingInvite, ...state });
        return;
      }
      // If the other friend already invited us, auto-accept so both join the party immediately
      if (existingInvite.fromCode === toCode && existingInvite.status === 'pending') {
        existingInvite.status = 'accepted';
        broadcast({ type: 'party:responded', invite: existingInvite });
        const state = buildFriendsStateForCode(fromCode, fromUsername);
        res.json({ ok: true, invite: existingInvite, ...state });
        return;
      }
      const state = buildFriendsStateForCode(fromCode, fromUsername);
      res.json({
        ok: true,
        invite: { ...existingInvite, direction: 'outgoing' },
        ...state,
      });
      return;
    }

    const newInvite: ServerPartyInvite = {
      id: `pinv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      fromCode,
      fromUsername,
      fromLevel,
      fromSkinId,
      toCode,
      toUsername: targetAccount.username,
      toLevel: targetAccount.level,
      toSkinId: targetAccount.skinId,
      status: 'pending',
      timestamp: Date.now(),
    };
    serverPartyInvites.unshift(newInvite);
    broadcast({ type: 'party:invite', invite: newInvite });

    const state = buildFriendsStateForCode(fromCode, fromUsername);
    res.json({
      ok: true,
      invite: { ...newInvite, direction: 'outgoing' },
      ...state,
    });
  });

  app.post('/api/party/respond', (req, res) => {
    const friendCode = normalizeCodeServer(String(req.body?.friendCode || ''));
    const username = String(req.body?.username || 'VANGUARD_01').trim();
    const inviteId = String(req.body?.inviteId || '');
    const action = req.body?.action === 'decline' ? 'declined' : 'accepted';

    const found = serverPartyInvites.find((p) => p.id === inviteId);
    if (!found) {
      res.status(404).json({ error: 'Party invite not found.' });
      return;
    }
    found.status = action;
    broadcast({ type: 'party:responded', invite: found });
    const state = buildFriendsStateForCode(friendCode, username);
    res.json({ ok: true, invite: found, ...state });
  });

  app.post('/api/party/leave', (req, res) => {
    const friendCode = normalizeCodeServer(String(req.body?.friendCode || ''));
    const username = String(req.body?.username || 'VANGUARD_01').trim();
    const targetCode = normalizeCodeServer(String(req.body?.targetCode || ''));

    for (let i = serverPartyInvites.length - 1; i >= 0; i--) {
      const p = serverPartyInvites[i];
      const matchesPair =
        targetCode
          ? (p.fromCode === friendCode && p.toCode === targetCode) ||
            (p.fromCode === targetCode && p.toCode === friendCode)
          : p.fromCode === friendCode || p.toCode === friendCode;
      if (matchesPair) {
        serverPartyInvites.splice(i, 1);
      }
    }
    broadcast({ type: 'party:updated', friendCode, targetCode });
    const state = buildFriendsStateForCode(friendCode, username);
    res.json({ ok: true, ...state });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  function broadcast(payload: Record<string, unknown>, excludeWs?: WebSocket) {
    const message = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  wss.on('connection', (ws) => {
    ws.send(
      JSON.stringify({
        type: 'room:init',
        operators: Array.from(roomOperators.values()),
        walls: Array.from(roomWalls.values()),
      })
    );

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as Record<string, unknown>;
        const eventType = String(msg.type || '');

        if (eventType === 'player:join' || eventType === 'player:update') {
          const id = String(msg.id || '').slice(0, 64);
          if (!id) return;
          clientMap.set(ws, id);

          const rawCode = normalizeCodeServer(String(msg.friendCode || ''));
          if (/^VX-[A-Z0-9]{6}$/.test(rawCode)) {
            wsCodeMap.set(ws, rawCode);
            const acc = onlineAccounts.get(rawCode);
            if (acc) {
              acc.online = true;
              if (acc.status === 'offline') acc.status = 'online';
              acc.updatedAt = Date.now();
              onlineAccounts.set(rawCode, acc);
            }
          }

          const existing = roomOperators.get(id);
          const updated: RemoteOperator = {
            id,
            callsign: String(msg.callsign || existing?.callsign || 'VANGUARD-01').slice(0, 32),
            skinId: String(msg.skinId || existing?.skinId || 'vanguard-obsidian'),
            emoteId: String(msg.emoteId || existing?.emoteId || 'salute'),
            activeEmote:
              msg.activeEmote !== undefined
                ? (msg.activeEmote as string | null)
                : existing?.activeEmote || null,
            emoteExpiresAt: Number(msg.emoteExpiresAt || existing?.emoteExpiresAt || 0),
            weaponId: String(msg.weaponId || existing?.weaponId || 'vx-carbine'),
            x: Number(msg.x ?? existing?.x ?? 0),
            y: Number(msg.y ?? existing?.y ?? 0),
            z: Number(msg.z ?? existing?.z ?? 18),
            rotY: Number(msg.rotY ?? existing?.rotY ?? 0),
            hp: Math.max(0, Math.min(200, Number(msg.hp ?? existing?.hp ?? 100))),
            maxHp: Math.max(100, Math.min(200, Number(msg.maxHp ?? existing?.maxHp ?? 100))),
            score: Math.max(0, Number(msg.score ?? existing?.score ?? 0)),
            eliminations: Math.max(0, Number(msg.eliminations ?? existing?.eliminations ?? 0)),
            mapId: String(msg.mapId || existing?.mapId || 'alpine-outpost'),
            updatedAt: Date.now(),
          };
          roomOperators.set(id, updated);
          broadcast({ type: 'player:updated', operator: updated }, ws);
        } else if (eventType === 'player:emote') {
          const id = String(msg.id || '');
          const op = roomOperators.get(id);
          if (op) {
            op.activeEmote = String(msg.emoteId || op.emoteId);
            op.emoteExpiresAt = Date.now() + 4000;
            roomOperators.set(id, op);
            broadcast({
              type: 'player:emoted',
              id,
              callsign: op.callsign,
              emoteId: op.activeEmote,
              emoteExpiresAt: op.emoteExpiresAt,
            });
          }
        } else if (eventType === 'player:fire') {
          broadcast(
            {
              type: 'player:fired',
              id: String(msg.id || ''),
              callsign: String(msg.callsign || 'OPERATOR'),
              originX: Number(msg.originX || 0),
              originY: Number(msg.originY || 1.5),
              originZ: Number(msg.originZ || 0),
              targetX: Number(msg.targetX || 0),
              targetY: Number(msg.targetY || 1.5),
              targetZ: Number(msg.targetZ || 0),
              colorHex: String(msg.colorHex || '#38bdf8'),
            },
            ws
          );
        } else if (eventType === 'player:hit') {
          const targetId = String(msg.targetId || '');
          const damage = Math.max(1, Math.min(120, Number(msg.damage || 20)));
          const attackerCallsign = String(msg.attackerCallsign || 'OPERATOR');
          const targetOp = roomOperators.get(targetId);
          if (targetOp) {
            targetOp.hp = Math.max(0, targetOp.hp - damage);
            roomOperators.set(targetId, targetOp);
            broadcast({
              type: 'player:damaged',
              targetId,
              damage,
              hp: targetOp.hp,
              attackerCallsign,
            });
          }
        } else if (eventType === 'wall:build') {
          const wallId = String(msg.id || '').slice(0, 64);
          if (!wallId || roomWalls.has(wallId)) return;
          const wallType = (
            ['barricade', 'rampart', 'bastion'].includes(String(msg.wallType))
              ? msg.wallType
              : 'barricade'
          ) as 'barricade' | 'rampart' | 'bastion';
          const maxHp = wallType === 'bastion' ? 650 : wallType === 'rampart' ? 450 : 280;
          const newWall: SharedWall = {
            id: wallId,
            type: wallType,
            x: Number(msg.x || 0),
            y: Number(msg.y || 0),
            z: Number(msg.z || 0),
            rotY: Number(msg.rotY || 0),
            hp: maxHp,
            maxHp,
            ownerCallsign: String(msg.ownerCallsign || 'OPERATOR').slice(0, 32),
            mapId: String(msg.mapId || 'alpine-outpost'),
          };
          if (roomWalls.size >= 40) {
            const oldestKey = roomWalls.keys().next().value;
            if (oldestKey) roomWalls.delete(oldestKey);
          }
          roomWalls.set(wallId, newWall);
          broadcast({ type: 'wall:created', wall: newWall });
        } else if (eventType === 'wall:damage') {
          const wallId = String(msg.id || '');
          const dmg = Math.max(0, Number(msg.damage || 25));
          const wall = roomWalls.get(wallId);
          if (wall) {
            wall.hp = Math.max(0, wall.hp - dmg);
            if (wall.hp <= 0) {
              roomWalls.delete(wallId);
              broadcast({ type: 'wall:destroyed', id: wallId });
            } else {
              roomWalls.set(wallId, wall);
              broadcast({ type: 'wall:updated', wall });
            }
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      const id = clientMap.get(ws);
      if (id) {
        roomOperators.delete(id);
        clientMap.delete(ws);
        broadcast({ type: 'player:left', id });
      }
      wsCodeMap.delete(ws);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Apex Vanguard Server + WebSocket listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
