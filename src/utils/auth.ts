import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb, getSecondaryAuth } from "@/utils/firebase";
import type { UserDoc, UserRole } from "@/types";

interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
  phone?: string;
  parentEmail?: string;
}

export const registerUser = async ({
  email,
  password,
  displayName,
  role,
  phone,
  parentEmail,
}: RegisterInput): Promise<UserDoc> => {
  const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  const userDoc: UserDoc = {
    uid: credential.user.uid,
    email,
    role,
    displayName,
    createdAt: Date.now(),
    ...(phone ? { phone } : {}),
    ...(parentEmail ? { parentEmail } : {}),
  };

  await setDoc(doc(getFirebaseDb(), "users", credential.user.uid), userDoc);

  return userDoc;
};

export const loginUser = async (email: string, password: string): Promise<UserDoc> => {
  const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  const userDoc = await fetchUserDoc(credential.user.uid);

  if (!userDoc) {
    throw new Error("لم يتم العثور على بيانات هذا الحساب.");
  }

  return userDoc;
};

export const logoutUser = async (): Promise<void> => {
  await signOut(getFirebaseAuth());
};

export const fetchUserDoc = async (uid: string): Promise<UserDoc | null> => {
  const snapshot = await getDoc(doc(getFirebaseDb(), "users", uid));
  return snapshot.exists() ? (snapshot.data() as UserDoc) : null;
};

const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

// كلمة مرور عشوائية يولّدها المعلّم للطالب (بدون أحرف/أرقام متشابهة الشكل مثل 0/O أو 1/l).
export const generateStudentPassword = (length = 10): string => {
  const cryptoObj = window.crypto;
  const randomValues = new Uint32Array(length);
  cryptoObj.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => PASSWORD_CHARS[value % PASSWORD_CHARS.length]).join("");
};

interface CreateStudentInput {
  email: string;
  password: string;
  displayName: string;
  phone: string;
  parentEmail?: string;
  gradeLevel?: string;
  driveFolderId?: string;
}

// يُنشئ حساب الطالب عبر مثيل Firebase ثانوي منعزل كي تبقى جلسة المعلّم الحالية سليمة.
export const createStudentAccount = async ({
  email,
  password,
  displayName,
  phone,
  parentEmail,
  gradeLevel,
  driveFolderId,
}: CreateStudentInput): Promise<UserDoc> => {
  const secondaryAuth = getSecondaryAuth();
  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const userDoc: UserDoc = {
      uid: credential.user.uid,
      email,
      role: "student",
      displayName,
      phone,
      createdAt: Date.now(),
      ...(parentEmail ? { parentEmail } : {}),
      ...(gradeLevel ? { gradeLevel } : {}),
      ...(driveFolderId ? { driveFolderId } : {}),
    };

    await setDoc(doc(getFirebaseDb(), "users", credential.user.uid), userDoc);
    return userDoc;
  } finally {
    await signOut(secondaryAuth);
  }
};

// حذف حساب طالب: يحذف مستند المستخدم وجلساته واختباراته المرتبطة. ملاحظة مهمّة: على خطة Spark
// (بدون Cloud Functions/Admin SDK) لا يمكن حذف بيانات اعتماد Firebase Auth الفعلية لحساب آخر؛
// حذف مستند المستخدم يمنع الطالب من الدخول عمليًا (loginUser يفشل حين لا يجد مستند المستخدم).
export const deleteStudentAccount = async (studentUid: string): Promise<void> => {
  const db = getFirebaseDb();

  const sessionsSnapshot = await getDocs(query(collection(db, "sessions"), where("studentId", "==", studentUid)));
  const sessionIds = sessionsSnapshot.docs.map((sessionDoc) => sessionDoc.id);

  const quizDeletions = await Promise.all(
    sessionIds.map(async (sessionId) => {
      const quizzesSnapshot = await getDocs(query(collection(db, "quizzes"), where("sessionId", "==", sessionId)));
      return Promise.all(quizzesSnapshot.docs.map((quizDoc) => deleteDoc(quizDoc.ref)));
    }),
  );
  void quizDeletions;

  await Promise.all(sessionsSnapshot.docs.map((sessionDoc) => deleteDoc(sessionDoc.ref)));
  await deleteDoc(doc(db, "users", studentUid));
};

export const translateFirebaseError = (code: string): string => {
  const map: Record<string, string> = {
    "auth/email-already-in-use": "هذا البريد الإلكتروني مستخدم بالفعل.",
    "auth/invalid-email": "صيغة البريد الإلكتروني غير صحيحة.",
    "auth/weak-password": "كلمة المرور ضعيفة جدًا (6 أحرف على الأقل).",
    "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    "auth/user-not-found": "لا يوجد حساب بهذا البريد الإلكتروني.",
    "auth/wrong-password": "كلمة المرور غير صحيحة.",
  };

  return map[code] ?? "تعذر إتمام العملية. حاول مرة أخرى.";
};
