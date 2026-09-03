import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from "firebase/auth";
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/utils/firebase";
import type { StudentCredentialDoc, StudentInviteDoc, TeacherInviteDoc, UserDoc, UserRole } from "@/types";

interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
  phone?: string;
  parentEmail?: string;
  teacherInviteCode?: string;
}

// تسجيل معلّم يمرّ إلزاميًا ببوابة مكافحة التسلل: كود دعوة صالح صادر عن المالك (isOwner) ومطابق
// للبريد المدخل، وإلا رفضت قواعد Firestore عملية إنشاء المستند أصلًا (التحقق هنا فقط لرسالة خطأ
// واضحة قبل إنشاء حساب Firebase Auth بلا داعٍ).
export const registerUser = async ({
  email,
  password,
  displayName,
  role,
  phone,
  parentEmail,
  teacherInviteCode,
}: RegisterInput): Promise<UserDoc> => {
  const db = getFirebaseDb();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedInviteCode = teacherInviteCode?.trim().toUpperCase();
  let invite: TeacherInviteDoc | undefined;

  if (role === "teacher") {
    if (!normalizedInviteCode) throw new Error("يلزم كود دعوة معلّم صالح لإتمام التسجيل.");

    const inviteSnapshot = await getDoc(doc(db, "teacherInvites", normalizedInviteCode));
    if (!inviteSnapshot.exists()) throw new Error("كود دعوة المعلّم غير صحيح.");

    invite = inviteSnapshot.data() as TeacherInviteDoc;
    if (invite.used) throw new Error("تم استخدام كود الدعوة هذا مسبقًا.");
    if (invite.email !== normalizedEmail) throw new Error("البريد الإلكتروني لا يطابق كود الدعوة المدخل.");
  }

  const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  const userDoc: UserDoc = {
    uid: credential.user.uid,
    email,
    role,
    displayName,
    createdAt: Date.now(),
    ...(phone ? { phone } : {}),
    ...(parentEmail ? { parentEmail } : {}),
    ...(role === "teacher" && normalizedInviteCode ? { teacherInviteCode: normalizedInviteCode } : {}),
    ...(invite?.stripeSubscriptionId ? { stripeSubscriptionId: invite.stripeSubscriptionId } : {}),
    ...(invite?.stripeCustomerId ? { stripeCustomerId: invite.stripeCustomerId } : {}),
  };

  await setDoc(doc(db, "users", credential.user.uid), userDoc);

  if (role === "teacher" && normalizedInviteCode) {
    await updateDoc(doc(db, "teacherInvites", normalizedInviteCode), { used: true });
  }

  return userDoc;
};

// إجراء المالك حصرًا: يولّد كود دعوة معلّم من 8 محارف ويربطه بالبريد المحدد، بانتظار أن يُكمل ذلك
// الشخص تسجيله بنفسه عبر تبويب «تسجيل معلّم» مستخدمًا هذا الكود.
export const createTeacherInvite = async (email: string): Promise<TeacherInviteDoc> => {
  const db = getFirebaseDb();
  let code = randomFromCharset(CODE_CHARS, 8);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await getDoc(doc(db, "teacherInvites", code));
    if (!existing.exists()) break;
    code = randomFromCharset(CODE_CHARS, 8);
  }

  const invite: TeacherInviteDoc = {
    code,
    email: email.trim().toLowerCase(),
    createdAt: Date.now(),
    used: false,
  };

  await setDoc(doc(db, "teacherInvites", code), invite);
  return invite;
};

// يرسل رابط إعادة تعيين كلمة المرور عبر بريد Firebase الرسمي — يعمل لأي حساب (معلّم أو طالب) طالما
// بريده صحيح ومسجّل، بلا حاجة لأي خادم إضافي.
export const requestPasswordReset = async (email: string): Promise<void> => {
  await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
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

// رمز طالب قصير (6 محارف) يولّده المعلّم عند تسجيل الطالب، يُستخدم كمفتاح دعوة تسجيل (studentInvites)
// وكمعرّف سريع للطالب في لوحة المعلّم لاحقًا.
export const generateStudentCode = (): string => randomFromCharset(CODE_CHARS, 6);

interface CreateStudentInviteInput {
  email: string;
  displayName: string;
  phone: string;
  parentEmail?: string;
  gradeLevel?: string;
  driveFolderId?: string;
}

// يُنشئ المعلّم دعوة تسجيل بدل حساب جاهز: يولّد رمزًا فريدًا ويخزّن بيانات الطالب الأساسية في
// studentInvites بانتظار أن يُكمل الطالب تسجيله بنفسه (بكلمة مرور من اختياره) عبر صندوق "تسجيل طالب".
export const createStudentInvite = async (input: CreateStudentInviteInput): Promise<StudentInviteDoc> => {
  const db = getFirebaseDb();
  let code = generateStudentCode();

  // إعادة توليد نادرة عند تصادم في الرمز، كونه يُستخدم مباشرة كمعرّف مستند فريد.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await getDoc(doc(db, "studentInvites", code));
    if (!existing.exists()) break;
    code = generateStudentCode();
  }

  const invite: StudentInviteDoc = {
    code,
    email: input.email.trim().toLowerCase(),
    displayName: input.displayName,
    phone: input.phone,
    createdAt: Date.now(),
    used: false,
    ...(input.parentEmail ? { parentEmail: input.parentEmail } : {}),
    ...(input.gradeLevel ? { gradeLevel: input.gradeLevel } : {}),
    ...(input.driveFolderId ? { driveFolderId: input.driveFolderId } : {}),
  };

  await setDoc(doc(db, "studentInvites", code), invite);
  return invite;
};

interface RegisterStudentInput {
  code: string;
  email: string;
  password: string;
  displayName: string;
  phone: string;
  parentEmail?: string;
}

// يُكمل الطالب تسجيله بنفسه: يتحقق من الرمز المرتبط ببريده لدى المعلّم، ثم يُنشئ حساب Firebase Auth
// الفعلي بكلمة المرور التي يختارها هو حصرًا (المعلّم لا يعرفها إطلاقًا).
export const registerStudentWithInvite = async (input: RegisterStudentInput): Promise<UserDoc> => {
  const db = getFirebaseDb();
  const normalizedCode = input.code.trim().toUpperCase();
  const normalizedEmail = input.email.trim().toLowerCase();

  const inviteSnapshot = await getDoc(doc(db, "studentInvites", normalizedCode));
  if (!inviteSnapshot.exists()) throw new Error("رمز التسجيل غير صحيح.");

  const invite = inviteSnapshot.data() as StudentInviteDoc;
  if (invite.used) throw new Error("تم استخدام هذا الرمز مسبقًا. اطلب من المعلّم رمزًا جديدًا.");
  if (invite.email !== normalizedEmail) throw new Error("البريد الإلكتروني لا يطابق الرمز المدخل.");

  const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), invite.email, input.password);
  const parentEmail = input.parentEmail?.trim() || invite.parentEmail;
  const userDoc: UserDoc = {
    uid: credential.user.uid,
    email: invite.email,
    role: "student",
    displayName: input.displayName.trim() || invite.displayName,
    phone: input.phone.trim() || invite.phone,
    createdAt: Date.now(),
    studentCode: invite.code,
    biometricLocked: false,
    primaryDeviceId: null,
    secondaryDeviceId: null,
    ...(parentEmail ? { parentEmail } : {}),
    ...(invite.gradeLevel ? { gradeLevel: invite.gradeLevel } : {}),
    ...(invite.driveFolderId ? { driveFolderId: invite.driveFolderId } : {}),
    ...(invite.premiumExpiresAt ? { studentPremiumActive: true, studentPremiumExpiresAt: invite.premiumExpiresAt } : {}),
  };

  await setDoc(doc(db, "users", credential.user.uid), userDoc);
  await updateDoc(doc(db, "studentInvites", normalizedCode), { used: true });

  return userDoc;
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
