"use client";

import type { SessionDoc, UserDoc } from "@/types";

type SessionWithId = SessionDoc & { id: string };

interface SessionManagerProps {
  sessions: SessionWithId[];
  students: UserDoc[];
  onEdit: (session: SessionWithId) => void;
  onCopy: (session: SessionWithId) => void;
  onDelete: (sessionId: string) => void;
}

const curriculumLabel = (session: SessionWithId): string => {
  const curriculum = session.curriculum;
  if (!curriculum) return "غير مصنّف";
  if (curriculum.track === "foundation") {
    return `التأسيس${curriculum.unit ? ` / ${curriculum.unit}` : ""}${curriculum.lesson ? ` / ${curriculum.lesson}` : ""}`;
  }
  return `${curriculum.term ?? "غير مصنّف"}${curriculum.unit ? ` / ${curriculum.unit}` : ""}${curriculum.lesson ? ` / ${curriculum.lesson}` : ""}`;
};

// يعرض الجلسات مُصنّفة أولاً حسب المرحلة الدراسية، ثم حسب الفصل/الوحدة/الدرس داخل كل مرحلة،
// بدل قائمة مسطّحة واحدة تتراكم فيها كل الجلسات بلا تنظيم.
const SessionManager = ({ sessions, students, onEdit, onCopy, onDelete }: SessionManagerProps) => {
  const gradeGroups = sessions.reduce<Record<string, SessionWithId[]>>((result, session) => {
    const grade = session.gradeLevel ?? "بلا مرحلة محدّدة";
    (result[grade] ??= []).push(session);
    return result;
  }, {});

  return (
    <div className="session-manager">
      {Object.entries(gradeGroups).map(([grade, gradeSessions]) => {
        const lessonGroups = gradeSessions.reduce<Record<string, SessionWithId[]>>((result, session) => {
          const label = curriculumLabel(session);
          (result[label] ??= []).push(session);
          return result;
        }, {});

        return (
          <section key={grade} className="session-grade-group">
            <h3 className="session-grade-title">{grade}</h3>
            {Object.entries(lessonGroups).map(([label, lessonSessions]) => (
              <div key={label} className="session-lesson-group">
                <p className="session-lesson-title">{label}</p>
                <ul className="session-list">
                  {lessonSessions.map((session) => {
                    const student = students.find((entry) => entry.uid === session.studentId);
                    return (
                      <li key={session.id} className="list-row">
                        <div className="list-row-info">
                          <span className="session-title">{session.videoTitle}</span>
                          <span className="session-student">{student?.displayName ?? "طالب محذوف"}</span>
                          <span className={session.quizPassed ? "badge badge-pass" : "badge badge-pending"}>
                            {session.quizPassed ? "اجتاز الاختبار" : "بانتظار الاختبار"}
                          </span>
                        </div>
                        <div className="list-row-actions">
                          <button type="button" className="logout-button" onClick={() => onEdit(session)}>
                            تعديل
                          </button>
                          <button type="button" className="logout-button" onClick={() => onCopy(session)}>
                            نسخ
                          </button>
                          <button type="button" className="logout-button" onClick={() => onDelete(session.id)}>
                            حذف
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
      {sessions.length === 0 && <p className="empty-state">لم يتم ربط أي جلسات بعد.</p>}
    </div>
  );
};

export default SessionManager;
