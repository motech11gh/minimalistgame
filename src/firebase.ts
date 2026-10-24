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
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

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

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

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

export async function signInOperator(): Promise<User | null> {
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
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
  const path = `operators/${user.uid}`;
  try {
    const ref = doc(db, 'operators', user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return {
        uid: user.uid,
        callsign: sanitizeCallsign(String(data.callsign || user.displayName || defaults.callsign)),
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
        highestTrainingLevel: Math.max(1, Math.min(4, Number(data.highestTrainingLevel || 1))),
        totalEliminations: Number(data.totalEliminations || 0),
        wallsBuilt: Number(data.wallsBuilt || 0),
      };
    }

    const initialProfile: OperatorProfileData = {
      uid: user.uid,
      callsign: sanitizeCallsign(user.displayName || defaults.callsign),
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

    if (user.emailVerified) {
      await setDoc(ref, {
        ...initialProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return initialProfile;
  } catch (error) {
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
  if (!user.emailVerified) return;
  const path = `operators/${user.uid}`;
  try {
    const ref = doc(db, 'operators', user.uid);
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
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function sendFirestoreFriendRequest(
  user: User,
  fromUsername: string,
  toUsername: string
): Promise<void> {
  if (!user.emailVerified) return;
  const reqId = `freq_${user.uid.slice(0, 12)}_${Date.now()}`;
  const path = `friendRequests/${reqId}`;
  try {
    await setDoc(doc(db, 'friendRequests', reqId), {
      fromUid: user.uid,
      fromUsername: sanitizeCallsign(fromUsername),
      toUsername: sanitizeCallsign(toUsername),
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
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
  const nextXp = Math.min(100000000, currentProfile.xp + Math.max(50, match.xpEarned));
  const nextCredits = Math.min(
    100000000,
    currentProfile.credits + Math.max(10, match.creditsEarned)
  );
  const nextHighestLevel =
    match.outcome === 'victory'
      ? Math.min(4, Math.max(currentProfile.highestTrainingLevel, match.trainingLevel + 1))
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

  if (!user.emailVerified) return updatedProfile;

  const opPath = `operators/${user.uid}`;
  try {
    await updateDoc(doc(db, 'operators', user.uid), {
      xp: nextXp,
      credits: nextCredits,
      highestTrainingLevel: nextHighestLevel,
      totalEliminations: nextElims,
      wallsBuilt: nextWalls,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, opPath);
  }

  const matchId = `match_${user.uid.slice(0, 12)}_${Date.now()}`;
  const matchPath = `matches/${matchId}`;
  try {
    await setDoc(doc(db, 'matches', matchId), {
      uid: user.uid,
      callsign: sanitizeCallsign(currentProfile.callsign),
      mapId: match.mapId,
      trainingLevel: Math.max(1, Math.min(4, match.trainingLevel)),
      score: Math.max(0, Math.min(10000000, Math.round(match.score))),
      eliminations: Math.max(0, Math.min(100000, Math.round(match.eliminations))),
      wallsConstructed: Math.max(0, Math.min(100000, Math.round(match.wallsConstructed))),
      outcome: match.outcome,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, matchPath);
  }

  return updatedProfile;
}

export async function fetchOperatorMatchHistory(user: User) {
  const path = 'matches';
  try {
    const q = query(collection(db, 'matches'), where('uid', '==', user.uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
