export type UserRole = "teacher" | "student";

export interface UserDoc {
  uid: string;
  email: string;
  role: UserRole;
  displayName: string;
  gradeLevel?: string;
  driveFolderId?: string;
  activationPending?: boolean;
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
