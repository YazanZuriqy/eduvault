export type UserRole = "teacher" | "student";

export interface UserDoc {
  uid: string;
  email: string;
  role: UserRole;
  displayName: string;
  gradeLevel?: string;
  driveFolderId?: string;
  studentCode?: string;
  activationPending?: boolean;
  // مالك الحساب الأول فقط يحمل هذا الحقل، يُفعّل يدويًا من وحدة تحكم Firebase مباشرةً
  // (لا يوجد دوال سحابية لضبطه تلقائيًا على خطة Spark)، وهو من يولّد أكواد المعلّمين الجدد.
  isOwner?: boolean;
  // كود دعوة المعلّم الذي استُخدم لإكمال التسجيل (يُحفظ كسجلّ تاريخي، لا يُعاد استخدامه لاحقًا).
  teacherInviteCode?: string;
  // بصمة الجهاز: primaryDeviceId هو الجهاز المعتمد، secondaryDeviceId جهاز إضافي مسموح به.
  biometricLocked?: boolean;
  primaryDeviceId?: string | null;
  secondaryDeviceId?: string | null;
  secondaryDeviceWindowOpen?: boolean;
  // حقول قديمة (قبل نظام primary/secondary) — تُقرأ كبديل احتياطي فقط، لا تُكتب من جديد.
  deviceId?: string;
  deviceBoundAt?: number;
  phone?: string;
  parentEmail?: string;
  createdAt: number;
}

export interface StudentCredentialDoc {
  studentId: string;
  activationCode: string;
  createdAt: number;
}

// دعوة انضمام معلّم جديد: ينشئها المالك (isOwner) برمز (code = معرّف المستند)، ويمنع هذا
// التسجيل الذاتي المفتوح لأي شخص كمعلّم من التحول إلى بوابة خلفية للتطفّل.
export interface TeacherInviteDoc {
  code: string;
  email: string;
  createdAt: number;
  used: boolean;
}

// دعوة تسجيل طالب: ينشئها المعلّم برمز (code = معرّف المستند)، ويُكملها الطالب بنفسه عبر
// صندوق "تسجيل طالب" بكلمة مرور من اختياره هو.
export interface StudentInviteDoc {
  code: string;
  email: string;
  displayName: string;
  phone: string;
  parentEmail?: string;
  gradeLevel?: string;
  driveFolderId?: string;
  createdAt: number;
  used: boolean;
}

export interface SessionDoc {
  sessionId: string;
  studentId: string;
  gradeLevel?: string;
  videoTitle: string;
  driveFileId: string;
  quizPassed: boolean;
  watchedAt?: number;
  curriculum?: {
    track: "foundation" | "term";
    term?: string;
    unit?: string;
    lesson?: string;
  };
  createdAt: number;
}

export interface QuizMedia {
  url: string;
  kind: "image" | "graph";
  label?: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  questionMedia?: QuizMedia[];
  optionMedia?: Record<string, QuizMedia[]>;
  points?: number;
}

export interface QuizDoc {
  quizId: string;
  sessionId: string;
  studentIds?: string[];
  title?: string;
  type?: "daily" | "comprehensive";
  curriculum?: {
    track: "foundation" | "term";
    term?: string;
    unit?: string;
    lesson?: string;
  };
  createdAt?: number;
  questions: QuizQuestion[];
  // نسبة النجاح المطلوبة من مجموع النقاط (افتراضيًا 100%، أي إجابة كاملة صحيحة).
  passThreshold?: number;
  shuffleOptions?: boolean;
  shuffleQuestions?: boolean;
}

export interface NoteDoc {
  noteId: string;
  sessionId: string;
  studentId: string;
  label: string;
  timestampSeconds: number;
  createdAt: number;
}
