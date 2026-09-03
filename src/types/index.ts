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
}

export interface NoteDoc {
  noteId: string;
  sessionId: string;
  studentId: string;
  label: string;
  timestampSeconds: number;
  createdAt: number;
}
