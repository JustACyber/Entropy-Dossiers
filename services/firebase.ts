import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot,
  Firestore
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged, 
  User,
  Auth
} from 'firebase/auth';
import { Character } from '../types';

// Replace with your actual Firebase config or use environment variables
const firebaseConfig = {
  apiKey: "AIzaSyB1gqid0rb9K-z0lKNTpyKiFpOKUl7ffrM",
  authDomain: "ordo-continuum-dossiers.firebaseapp.com",
  projectId: "ordo-continuum-dossiers",
  storageBucket: "ordo-continuum-dossiers.firebasestorage.app",
  messagingSenderId: "1017277527969",
  appId: "1:1017277527969:web:1ab73e9a064c76015c3de0",
  measurementId: "G-7CGN7MPC4G"
};

const app = initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

const APP_ID = 'ordo-continuum-legacy-v1';
const LOCAL_STORAGE_KEY = 'ordo_local_storage_db';

// --- MOCK / OFFLINE MODE IMPLEMENTATION ---
let isOfflineMode = false;
const listeners: Set<() => void> = new Set();

const getLocalDB = (): Record<string, Character> => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
};

const setLocalDB = (data: Record<string, Character>) => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  listeners.forEach(l => l());
};

export const OrdoService = {
  auth,
  db,
  
  init: (): Promise<User | { uid: string }> => {
    return new Promise((resolve) => {
      // 1. Try to listen for auth state
      const unsub = onAuthStateChanged(auth, 
        (user) => {
          if (user) {
            unsub();
            resolve(user);
          } else {
            // 2. If no user, try to sign in
            signInAnonymously(auth)
              .then((uc) => {
                unsub();
                resolve(uc.user);
              })
              .catch((err) => {
                // 3. If sign in fails (e.g. referer blocked or bad key), switch to offline
                console.warn("Firebase connection failed. Switching to Offline Mode (LocalStorage).", err);
                isOfflineMode = true;
                unsub();
                resolve({ uid: 'offline-user' });
              });
          }
        },
        (error) => {
           // Auth state change error (rare but possible)
           console.warn("Firebase Auth Error. Switching to Offline Mode.", error);
           isOfflineMode = true;
           resolve({ uid: 'offline-user' });
        }
      );
    });
  },

  subscribeAll: (callback: (data: Record<string, Character>) => void) => {
    if (isOfflineMode) {
      const handler = () => callback(getLocalDB());
      listeners.add(handler);
      handler(); // Immediate call
      return () => { listeners.delete(handler); };
    }

    const collRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'protocols');
    return onSnapshot(collRef, (snapshot) => {
      const data: Record<string, Character> = {};
      snapshot.forEach((docSnap) => {
        data[docSnap.id] = docSnap.data() as Character;
      });
      callback(data);
    }, (err) => {
        console.error("Firebase Snapshot Error (All)", err);
        // Optional: could fallback here too, but init usually catches it
    });
  },

  subscribeOne: (id: string, callback: (data: Character | null) => void) => {
    if (isOfflineMode) {
      const handler = () => {
        const db = getLocalDB();
        callback(db[id] || null);
      };
      listeners.add(handler);
      handler();
      return () => { listeners.delete(handler); };
    }

    const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'protocols', id);
    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data() as Character);
      } else {
        callback(null);
      }
    }, (err) => {
        console.error("Firebase Snapshot Error (One)", err);
    });
  },

  create: async (name: string): Promise<string> => {
    const id = name.toLowerCase().replace(/\s+/g, '_') + "_" + Math.floor(Math.random() * 10000);
    
    const newChar: Character = {
        id: id,
        meta: {
            name: name, rank: "Рекрут", image: "",
            class: "", archetype: "", race: "", background: "", level: 1,
            origin: "", age: "", job: "", clearance: "", comm: ""
        },
        stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, hp_curr: 0, hp_max: 0, hp_temp: 0, ac: 10, speed_mod: 0, shield_curr: 0, shield_max: 0 },
        saves: { prof_str: false, prof_dex: false, prof_con: false, prof_int: false, prof_wis: false, prof_cha: false },
        skills: { 
            athletics: 0, acrobatics: 0, sleight: 0, stealth: 0,
            history: 0, void: 0, nature: 0, investigation: 0, programming: 0, tech: 0, fund_science: 0, weapons: 0, religion: 0,
            perception: 0, survival: 0, medicine: 0, insight: 0, animal: 0,
            performance: 0, intimidation: 0, deception: 0, persuasion: 0,
            bonuses: {} 
        },
        combat: { weapons: [], inventory: [] },
        abilities: [], traits: [], features: [],
        profs: { langs: [], tools: [], armory: [] },
        money: { u: 0, k: 0, m: 0, g: 0 },
        psych: { size: "Средний", age: "", height: "", weight: "", trait: "", ideal: "", bond: "", flaw: "", analysis: "" },
        psionics: { base_attr: "int", caster_type: "1", class_lvl: 1, type: "learned", mod_points: 0, points_curr: 0, spells: [] },
        universalis: { save_base: 8, save_attr: "int", custom_table: [], counters: [] },
        locks: { identity: false, biometrics: false, skills: false, equipment: false, psych: false, psionics: false, universalis: false }
    };

    if (isOfflineMode) {
      const db = getLocalDB();
      db[id] = newChar;
      setLocalDB(db);
      return id;
    }

    await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'protocols', id), newChar);
    return id;
  },

  update: async (id: string, data: Partial<Character>) => {
    const cleanData = JSON.parse(JSON.stringify(data));
    
    if (isOfflineMode) {
      const db = getLocalDB();
      if (db[id]) {
        // App sends full object on update, so spread is safe
        db[id] = { ...db[id], ...cleanData };
        setLocalDB(db);
      }
      return;
    }

    await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'protocols', id), cleanData, { merge: true });
  },

  delete: async (id: string) => {
    if (isOfflineMode) {
      const db = getLocalDB();
      delete db[id];
      setLocalDB(db);
      return;
    }

    await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'protocols', id));
  }
};
