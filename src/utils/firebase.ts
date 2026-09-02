import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";
import { type Firestore, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Static export + client-only SDK usage requires a guarded singleton to avoid re-init on hot reload.
const app: FirebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let secondaryAuthInstance: Auth | null = null;

// Auth/Firestore are constructed lazily so `next build` (static export prerender) never
// evaluates them on the server, where Firebase env vars are intentionally absent.
export const getFirebaseAuth = (): Auth => {
  if (!authInstance) authInstance = getAuth(app);
  return authInstance;
};

export const getFirebaseDb = (): Firestore => {
  if (!dbInstance) dbInstance = getFirestore(app);
  return dbInstance;
};

// مثيل Firebase منفصل تمامًا يُستخدم فقط لإنشاء حساب طالب دون تسجيل خروج المعلّم الحالي —
// createUserWithEmailAndPassword يسجّل الدخول تلقائيًا كالمستخدم الجديد، لذا يجب عزله عن جلسة المعلّم.
export const getSecondaryAuth = (): Auth => {
  if (!secondaryAuthInstance) {
    const existingSecondaryApp = getApps().find((candidate) => candidate.name === "student-manager");
    const secondaryApp = existingSecondaryApp ?? initializeApp(firebaseConfig, "student-manager");
    secondaryAuthInstance = getAuth(secondaryApp);
  }
  return secondaryAuthInstance;
};

export default app;
