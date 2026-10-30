import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  setLogLevel,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
// Suppress internal @firebase/firestore error logs when offline or when a cached Auth token fails refresh
try {
  setLogLevel('silent');
} catch {
  // Ignore if unsupported in environment
}

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

const LOCAL_PROFILE_STORAGE_KEY = 'apex_vanguard_operator_profile_v1';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? '');
}

export function isTokenServiceError(error: unknown): boolean {
  const msg = getErrorMessage(error);
  return (
    msg.includes('token-service-api-has-not-been-used') ||
    msg.includes('securetoken.googleapis.com') ||
    msg.includes('Fetching auth token failed') ||
    msg.includes('auth/network-request-failed') ||
    msg.includes('auth/internal-error')
  );
}

export function isTransientOrOfflineError(error: unknown): boolean {
  const msg = getErrorMessage(error);
  return (
    isTokenServiceError(error) ||
    msg.includes('the client is offline') ||
    msg.includes('Failed to get document because the client is offline') ||
    msg.includes('Could not reach Cloud Firestore backend') ||
    msg.includes('unavailable') ||
    msg.includes('offline')
  );
}

export async function ensureValidAuthUser(user: User | null): Promise<User | null> {
  if (!user) return null;
  try {
    await user.getIdToken();
    return user;
  } catch (error) {
    if (isTokenServiceError(error) || getErrorMessage(error).includes('auth/')) {
      try {
        await signOut(auth);
      } catch {
        // Ignore signOut failure
      }
      return null;
    }
    return user;
  }
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot after verifying any cached Auth session
async function testConnection() {
  try {
    if (typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
    if (auth.currentUser) {
      const validUser = await ensureValidAuthUser(auth.currentUser);
      if (!validUser) return;
    }
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (isTokenServiceError(error)) {
      await signOut(auth).catch(() => {});
    }
    // Operate seamlessly in local/Express mode when Firestore is offline
  }
}
void testConnection();

export interface OperatorProfileData {
  uid: string;
  callsign: string;
  skinId: string;
  emoteId: string;
  primaryWeaponId: string;
  opticId: string;
  barrelId: string;
  underbarrelId: string;
  magId: string;
  stimCompoundCid: number;
  xp: number;
  credits: number;
  highestTrainingLevel: number;
  totalEliminations: number;
  wallsBuilt: number;
}

const CALLSIGN_MIN = 2;
const CALLSIGN_MAX = 32;

function sanitizeCallsign(raw: string): string {
  const cleaned = raw.trim().slice(0, CALLSIGN_MAX);
  return cleaned.length >= CALLSIGN_MIN ? cleaned : 'VANGUARD-OP';
}

function readLocalFallbackProfile(
  uid: string,
  displayName: string | null | undefined,
  defaults: Omit<OperatorProfileData, 'uid'>
): OperatorProfileData {
  let saved: Partial<OperatorProfileData> = {};
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
      if (raw) {
        saved = JSON.parse(raw) as Partial<OperatorProfileData>;
      }
    } catch {
      // Ignore storage parse error
    }
  }
  const profile: OperatorProfileData = {
    uid,
    callsign: sanitizeCallsign(
      String(saved.callsign || displayName || defaults.callsign)
    ),
    skinId: String(saved.skinId || defaults.skinId),
    emoteId: String(saved.emoteId || defaults.emoteId),
    primaryWeaponId: String(saved.primaryWeaponId || defaults.primaryWeaponId),
    opticId: String(saved.opticId || defaults.opticId),
    barrelId: String(saved.barrelId || defaults.barrelId),
    underbarrelId: String(saved.underbarrelId || defaults.underbarrelId),
    magId: String(saved.magId || defaults.magId),
    stimCompoundCid: Number(saved.stimCompoundCid || defaults.stimCompoundCid),
    xp: Math.max(defaults.xp, Number(saved.xp || 0)),
    credits: Math.max(defaults.credits, Number(saved.credits ?? 600)),
    highestTrainingLevel: Math.max(
      1,
      Math.min(
        4,
        Number(saved.highestTrainingLevel || defaults.highestTrainingLevel || 1)
      )
    ),
    totalEliminations: Number(
      saved.totalEliminations || defaults.totalEliminations || 0
    ),
    wallsBuilt: Number(saved.wallsBuilt || defaults.wallsBuilt || 0),
  };
  writeLocalFallbackProfile(profile);
  return profile;
}

function writeLocalFallbackProfile(profile: Partial<OperatorProfileData>): void {
  if (typeof window === 'undefined') return;
  try {
    const existingRaw = localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
    const existing = existingRaw ? JSON.parse(existingRaw) : {};
    localStorage.setItem(
      LOCAL_PROFILE_STORAGE_KEY,
      JSON.stringify({ ...existing, ...profile })
    );
  } catch {
    // Ignore storage quota error
  }
}

export async function signInOperator(): Promise<User | null> {
  const cred = await signInWithPopup(auth, googleProvider);
  const validUser = await ensureValidAuthUser(cred.user);
  if (!validUser) {
    throw new Error(
      'Cloud Token Service API is currently offline for this project; using Local Online Account.'
    );
  }
  return validUser;
}

export async function signOutOperator(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged };
export type { User };

export async function loadOrCreateOperatorProfile(
  user: User,
  defaults: Omit<OperatorProfileData, 'uid'>
): Promise<OperatorProfileData> {
  const fallback = readLocalFallbackProfile(user.uid, user.displayName, defaults);
  const validUser = await ensureValidAuthUser(user);
  if (!validUser) {
    return fallback;
  }

  const path = `operators/${validUser.uid}`;
  try {
    const ref = doc(db, 'operators', validUser.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const loaded: OperatorProfileData = {
        uid: validUser.uid,
        callsign: sanitizeCallsign(
          String(data.callsign || validUser.displayName || defaults.callsign)
        ),
        skinId: String(data.skinId || defaults.skinId),
        emoteId: String(data.emoteId || defaults.emoteId),
        primaryWeaponId: String(data.primaryWeaponId || defaults.primaryWeaponId),
        opticId: String(data.opticId || defaults.opticId),
        barrelId: String(data.barrelId || defaults.barrelId),
        underbarrelId: String(data.underbarrelId || defaults.underbarrelId),
        magId: String(data.magId || defaults.magId),
        stimCompoundCid: Number(data.stimCompoundCid || defaults.stimCompoundCid),
        xp: Number(data.xp || 0),
        credits: Number(data.credits ?? defaults.credits ?? 600),
        highestTrainingLevel: Math.max(
          1,
          Math.min(4, Number(data.highestTrainingLevel || 1))
        ),
        totalEliminations: Number(data.totalEliminations || 0),
        wallsBuilt: Number(data.wallsBuilt || 0),
      };
      writeLocalFallbackProfile(loaded);
      return loaded;
    }

    const initialProfile: OperatorProfileData = {
      uid: validUser.uid,
      callsign: sanitizeCallsign(validUser.displayName || defaults.callsign),
      skinId: defaults.skinId,
      emoteId: defaults.emoteId,
      primaryWeaponId: defaults.primaryWeaponId,
      opticId: defaults.opticId,
      barrelId: defaults.barrelId,
      underbarrelId: defaults.underbarrelId,
      magId: defaults.magId,
      stimCompoundCid: defaults.stimCompoundCid,
      xp: defaults.xp,
      credits: defaults.credits,
      highestTrainingLevel: defaults.highestTrainingLevel,
      totalEliminations: defaults.totalEliminations,
      wallsBuilt: defaults.wallsBuilt,
    };

    writeLocalFallbackProfile(initialProfile);

    if (validUser.emailVerified) {
      await setDoc(ref, {
        ...initialProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return initialProfile;
  } catch (error) {
    if (isTokenServiceError(error)) {
      await signOut(auth).catch(() => {});
    }
    if (isTransientOrOfflineError(error)) {
      return fallback;
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveOperatorCustomization(
  user: User,
  customization: Pick<
    OperatorProfileData,
    | 'callsign'
    | 'skinId'
    | 'emoteId'
    | 'primaryWeaponId'
    | 'opticId'
    | 'barrelId'
    | 'underbarrelId'
    | 'magId'
    | 'stimCompoundCid'
    | 'credits'
  >
): Promise<void> {
  writeLocalFallbackProfile({
    callsign: sanitizeCallsign(customization.callsign),
    skinId: customization.skinId,
    emoteId: customization.emoteId,
    primaryWeaponId: customization.primaryWeaponId,
    opticId: customization.opticId,
    barrelId: customization.barrelId,
    underbarrelId: customization.underbarrelId,
    magId: customization.magId,
    stimCompoundCid: customization.stimCompoundCid,
    credits: Math.max(0, Math.min(100000000, Math.round(customization.credits))),
  });

  if (!user.emailVerified) return;
  const validUser = await ensureValidAuthUser(user);
  if (!validUser) return;

  const path = `operators/${validUser.uid}`;
  try {
    const ref = doc(db, 'operators', validUser.uid);
    await updateDoc(ref, {
      callsign: sanitizeCallsign(customization.callsign),
      skinId: customization.skinId,
      emoteId: customization.emoteId,
      primaryWeaponId: customization.primaryWeaponId,
      opticId: customization.opticId,
      barrelId: customization.barrelId,
      underbarrelId: customization.underbarrelId,
      magId: customization.magId,
      stimCompoundCid: customization.stimCompoundCid,
      credits: Math.max(0, Math.min(100000000, Math.round(customization.credits))),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isTokenServiceError(error)) {
      await signOut(auth).catch(() => {});
    }
    if (isTransientOrOfflineError(error)) {
      return;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function sendFirestoreFriendRequest(
  user: User,
  fromUsername: string,
  toUsername: string
): Promise<void> {
  if (!user.emailVerified) return;
  const validUser = await ensureValidAuthUser(user);
  if (!validUser) return;

  const reqId = `freq_${validUser.uid.slice(0, 12)}_${Date.now()}`;
  const path = `friendRequests/${reqId}`;
  try {
    await setDoc(doc(db, 'friendRequests', reqId), {
      fromUid: validUser.uid,
      fromUsername: sanitizeCallsign(fromUsername),
      toUsername: sanitizeCallsign(toUsername),
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isTokenServiceError(error)) {
      await signOut(auth).catch(() => {});
    }
    if (isTransientOrOfflineError(error)) {
      return;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function recordMatchAndProgression(
  user: User,
  currentProfile: OperatorProfileData,
  match: {
    mapId: string;
    trainingLevel: number;
    score: number;
    xpEarned: number;
    creditsEarned: number;
    eliminations: number;
    wallsConstructed: number;
    outcome: 'victory' | 'defeat';
  }
): Promise<OperatorProfileData> {
  const nextXp = Math.min(
    100000000,
    currentProfile.xp + Math.max(50, match.xpEarned)
  );
  const nextCredits = Math.min(
    100000000,
    currentProfile.credits + Math.max(10, match.creditsEarned)
  );
  const nextHighestLevel =
    match.outcome === 'victory'
      ? Math.min(
          4,
          Math.max(currentProfile.highestTrainingLevel, match.trainingLevel + 1)
        )
      : currentProfile.highestTrainingLevel;
  const nextElims = Math.min(
    10000000,
    currentProfile.totalEliminations + Math.max(0, match.eliminations)
  );
  const nextWalls = Math.min(
    10000000,
    currentProfile.wallsBuilt + Math.max(0, match.wallsConstructed)
  );

  const updatedProfile: OperatorProfileData = {
    ...currentProfile,
    xp: nextXp,
    credits: nextCredits,
    highestTrainingLevel: nextHighestLevel,
    totalEliminations: nextElims,
    wallsBuilt: nextWalls,
  };

  writeLocalFallbackProfile(updatedProfile);

  if (!user.emailVerified) return updatedProfile;
  const validUser = await ensureValidAuthUser(user);
  if (!validUser) return updatedProfile;

  const opPath = `operators/${validUser.uid}`;
  try {
    await updateDoc(doc(db, 'operators', validUser.uid), {
      xp: nextXp,
      credits: nextCredits,
      highestTrainingLevel: nextHighestLevel,
      totalEliminations: nextElims,
      wallsBuilt: nextWalls,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isTokenServiceError(error)) {
      await signOut(auth).catch(() => {});
    }
    if (isTransientOrOfflineError(error)) {
      return updatedProfile;
    }
    handleFirestoreError(error, OperationType.UPDATE, opPath);
  }

  const matchId = `match_${validUser.uid.slice(0, 12)}_${Date.now()}`;
  const matchPath = `matches/${matchId}`;
  try {
    await setDoc(doc(db, 'matches', matchId), {
      uid: validUser.uid,
      callsign: sanitizeCallsign(currentProfile.callsign),
      mapId: match.mapId,
      trainingLevel: Math.max(1, Math.min(4, match.trainingLevel)),
      score: Math.max(0, Math.min(10000000, Math.round(match.score))),
      eliminations: Math.max(0, Math.min(100000, Math.round(match.eliminations))),
      wallsConstructed: Math.max(
        0,
        Math.min(100000, Math.round(match.wallsConstructed))
      ),
      outcome: match.outcome,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    if (isTokenServiceError(error)) {
      await signOut(auth).catch(() => {});
    }
    if (isTransientOrOfflineError(error)) {
      return updatedProfile;
    }
    handleFirestoreError(error, OperationType.CREATE, matchPath);
  }

  return updatedProfile;
}

export async function fetchOperatorMatchHistory(user: User) {
  const validUser = await ensureValidAuthUser(user);
  if (!validUser) return [];
  const path = 'matches';
  try {
    const q = query(collection(db, 'matches'), where('uid', '==', validUser.uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    if (isTokenServiceError(error)) {
      await signOut(auth).catch(() => {});
    }
    if (isTransientOrOfflineError(error)) {
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

