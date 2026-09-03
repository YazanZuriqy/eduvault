import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from "firebase/auth";
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb, getSecondaryAuth } from "@/utils/firebase";
import type { StudentCredentialDoc, UserDoc, UserRole } from "@/types";

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

  if (userDoc.role === "student") await authorizeStudentDevice(userDoc);
  return userDoc;
};

export const logoutUser = async (): Promise<void> => {
  await signOut(getFirebaseAuth());
};

export const fetchUserDoc = async (uid: string): Promise<UserDoc | null> => {
  const snapshot = await getDoc(doc(getFirebaseDb(), "users", uid));
  return snapshot.exists() ? (snapshot.data() as UserDoc) : null;
};

const getBrowserDeviceId = (): string => {
  const key = "eduvault-device-id";
  const stored = window.localStorage.getItem(key);
  if (stored) return stored;
  const deviceId = crypto.randomUUID();
  window.localStorage.setItem(key, deviceId);
  return deviceId;
};

// نظام بصمة جهاز بمستويين: primaryDeviceId هو الجهاز المعتمد أساسًا، secondaryDeviceId جهاز إضافي
// يُسمح به مرة واحدة عبر "نافذة سماح" يفتحها المعلّم. الحقول القديمة deviceId/deviceBoundAt (من نظام
// سابق بجهاز واحد فقط) تُقرأ كبديل احتياطي للحسابات المُنشأة قبل هذا التحديث فلا تنقطع عنها الخدمة.
const authorizeStudentDevice = async (userDoc: UserDoc): Promise<void> => {
  const deviceId = getBrowserDeviceId();
  const primaryDeviceId = userDoc.primaryDeviceId ?? userDoc.deviceId ?? null;

  if (!primaryDeviceId) {
    await updateDoc(doc(getFirebaseDb(), "users", userDoc.uid), {
      primaryDeviceId: deviceId,
      biometricLocked: true,
    });
    return;
  }

  if (primaryDeviceId === deviceId || userDoc.secondaryDeviceId === deviceId) return;

  if (userDoc.secondaryDeviceWindowOpen && !userDoc.secondaryDeviceId) {
    await updateDoc(doc(getFirebaseDb(), "users", userDoc.uid), {
      secondaryDeviceId: deviceId,
      secondaryDeviceWindowOpen: false,
    });
    return;
  }

  await signOut(getFirebaseAuth());
  throw new Error("هذا الحساب مرتبط بجهاز آخر. اطلب من المعلّم فكّ ارتباط الجهاز أو السماح بجهاز إضافي.");
};

// إجراء المعلّم: يزيل كل ربط أجهزة الطالب، فيُعتمد أول جهاز يسجّل الدخول تاليًا كجهاز أساسي جديد.
export const unbindStudentDevice = async (studentUid: string): Promise<void> => {
  await updateDoc(doc(getFirebaseDb(), "users", studentUid), {
    biometricLocked: false,
    primaryDeviceId: null,
    secondaryDeviceId: null,
    secondaryDeviceWindowOpen: false,
    deviceId: deleteField(),
    deviceBoundAt: deleteField(),
  });
};

// إجراء المعلّم: يفتح نافذة سماح لمرة واحدة، يلتقطها أول دخول تالٍ من جهاز مختلف عن الجهاز الأساسي.
export const allowAdditionalStudentDevice = async (studentUid: string): Promise<void> => {
  await updateDoc(doc(getFirebaseDb(), "users", studentUid), { secondaryDeviceWindowOpen: true });
};

export const completeStudentActivation = async (newPassword: string): Promise<void> => {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("انتهت جلسة الدخول. سجّل الدخول برمز التفعيل مجددًا.");
  await updatePassword(user, newPassword);
  await updateDoc(doc(getFirebaseDb(), "users", user.uid), { activationPending: false });
};

// يسمح للطالب بتغيير كلمة مروره الخاصة من إعدادات حسابه، عبر Firebase Auth مباشرة (بلا خادم).
export const changeOwnPassword = async (newPassword: string): Promise<void> => {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("يجب تسجيل الدخول أولاً.");
  await updatePassword(user, newPassword);
};

export const fetchStudentCredential = async (studentId: string): Promise<StudentCredentialDoc | null> => {
  const snapshot = await getDoc(doc(getFirebaseDb(), "studentCredentials", studentId));
  return snapshot.exists() ? (snapshot.data() as StudentCredentialDoc) : null;
};

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const randomFromCharset = (charset: string, length: number): string => {
  const randomValues = new Uint32Array(length);
  window.crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => charset[value % charset.length]).join("");
};

// كلمة مرور مؤقتة يولّدها المعلّم للطالب، بصيغة يسهل نسخها/إملاؤها (Tmp@1234)، يستبدلها الطالب بنفسه
// عند أول دخول عبر completeStudentActivation.
export const generateStudentPassword = (): string => `Tmp@${randomFromCharset("0123456789", 4)}`;

// رمز طالب قصير (6 محارف) يعرضه المعلّم في لوحته للتعرّف السريع على الطالب دون كشف بريده/كلمة مروره.
export const generateStudentCode = (): string => randomFromCharset(CODE_CHARS, 6);

interface CreateStudentInput {
  email: string;
  password: string;
  displayName: string;
  phone: string;
  parentEmail?: string;
  gradeLevel?: string;
  driveFolderId?: string;
}

// يُنشئ حساب الطالب عبر مثيل Firebase ثانوي منعزل كي تبقى جلسة المعلّم الحالية سليمة. يُهيّئ أيضًا
// حقول بصمة الجهاز الأساسية (biometricLocked/primaryDeviceId/secondaryDeviceId) صراحةً منذ الإنشاء.
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
    const studentCode = generateStudentCode();
    const userDoc: UserDoc = {
      uid: credential.user.uid,
      email,
      role: "student",
      displayName,
      phone,
      createdAt: Date.now(),
      activationPending: true,
      studentCode,
      biometricLocked: false,
      primaryDeviceId: null,
      secondaryDeviceId: null,
      ...(parentEmail ? { parentEmail } : {}),
      ...(gradeLevel ? { gradeLevel } : {}),
      ...(driveFolderId ? { driveFolderId } : {}),
    };

    await setDoc(doc(getFirebaseDb(), "users", credential.user.uid), userDoc);
    await setDoc(doc(getFirebaseDb(), "studentCredentials", credential.user.uid), {
      studentId: credential.user.uid,
      activationCode: password,
      createdAt: Date.now(),
    } satisfies StudentCredentialDoc);
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
    "auth/requires-recent-login": "لأسباب أمنية، سجّل الخروج ثم الدخول مجددًا قبل تغيير كلمة المرور.",
  };

  return map[code] ?? "تعذر إتمام العملية. حاول مرة أخرى.";
};
