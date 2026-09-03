"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { getFirebaseDb } from "@/utils/firebase";
import MathInlineField from "@/components/MathInlineField";
import QuizPreviewModal from "@/components/QuizPreviewModal";
import type { QuizDoc, QuizMedia, QuizQuestion, UserDoc } from "@/types";

interface QuizBuilderProps {
  sessions: { id: string; videoTitle: string; studentId: string }[];
  students: UserDoc[];
  assignedStudentId?: string;
}

interface QuestionDraft extends QuizQuestion {
  key: string;
}

type DraftWithId = QuizDoc & { id: string };

const createEmptyQuestion = (): QuestionDraft => ({
  key: crypto.randomUUID(),
  question: "",
  options: ["", "", ""],
  correctAnswer: "",
});

// نموذج بناء اختبار واحد ومتدفّق رأسيًا: كل سؤال وكل خيار يظهر ضمن الصفحة نفسها بلا تبويبات
// مخفية، ولكل صندوق كتابة أدوات الرموز الرياضية والوسائط الخاصة به ملاصقة له مباشرة.
const QuizBuilder = ({ sessions, students, assignedStudentId }: QuizBuilderProps) => {
  const [questions, setQuestions] = useState<QuestionDraft[]>([createEmptyQuestion()]);
  const [quizType, setQuizType] = useState<"daily" | "comprehensive">("daily");
  const [track, setTrack] = useState<"foundation" | "term">("term");
  const [term, setTerm] = useState("الفصل الأول");
  const [unit, setUnit] = useState("");
  const [lesson, setLesson] = useState("");
  const [title, setTitle] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(assignedStudentId ? [assignedStudentId] : []);
  // خريطة (studentId -> sessionId): كل طالب مكلّف يختار جلسته الخاصة بدل جلسة مشتركة واحدة قد لا تخصه.
  const [studentSessionMap, setStudentSessionMap] = useState<Record<string, string>>({});
  const [passThreshold, setPassThreshold] = useState(100);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftWithId[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const activeStudentDriveFolderId =
    selectedStudentIds.length === 1
      ? students.find((student) => student.uid === selectedStudentIds[0])?.driveFolderId
      : undefined;

  useEffect(() => {
    const draftsQuery = query(collection(getFirebaseDb(), "quizzes"), where("status", "==", "draft"));
    const unsubscribe = onSnapshot(draftsQuery, (snapshot) => {
      setDrafts(snapshot.docs.map((entry) => ({ ...(entry.data() as QuizDoc), id: entry.id })));
    });
    return unsubscribe;
  }, []);

  const updateQuestion = (key: string, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const handleAddQuestion = () => {
    setQuestions((prev) => [...prev, createEmptyQuestion()]);
  };

  const handleRemoveQuestion = (key: string) => {
    setQuestions((prev) => prev.filter((item) => item.key !== key));
  };

  const handleDuplicateQuestion = (key: string) => {
    setQuestions((prev) => {
      const index = prev.findIndex((item) => item.key === key);
      if (index === -1) return prev;
      const clone: QuestionDraft = { ...prev[index], key: crypto.randomUUID() };
      return [...prev.slice(0, index + 1), clone, ...prev.slice(index + 1)];
    });
  };

  const handleMoveQuestion = (index: number, direction: -1 | 1) => {
    setQuestions((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const handleAddOption = (key: string) => {
    const current = questions.find((item) => item.key === key);
    if (current) updateQuestion(key, { options: [...current.options, ""] });
  };

  const handleRemoveOption = (key: string, optionIndex: number) => {
    const current = questions.find((item) => item.key === key);
    if (!current) return;
    const removedOption = current.options[optionIndex];
    const nextOptions = current.options.filter((_, index) => index !== optionIndex);
    const nextOptionMedia = { ...(current.optionMedia ?? {}) };
    delete nextOptionMedia[String(optionIndex)];

    updateQuestion(key, {
      options: nextOptions,
      correctAnswer: current.correctAnswer === removedOption ? "" : current.correctAnswer,
      optionMedia: nextOptionMedia,
    });
  };

  const toggleStudent = (studentId: string, checked: boolean) => {
    setSelectedStudentIds((previous) => (checked ? [...previous, studentId] : previous.filter((id) => id !== studentId)));
    if (!checked) {
      setStudentSessionMap((previous) => {
        const next = { ...previous };
        delete next[studentId];
        return next;
      });
    }
  };

  const resetForm = () => {
    setQuestions([createEmptyQuestion()]);
    setTitle("");
    setSelectedStudentIds([]);
    setStudentSessionMap({});
    setUnit("");
    setLesson("");
    setPassThreshold(100);
    setShuffleOptions(false);
    setShuffleQuestions(false);
    setEditingQuizId(null);
  };

  const handleLoadDraft = (draft: DraftWithId) => {
    setEditingQuizId(draft.id);
    setTitle(draft.title ?? "");
    setQuizType(draft.type ?? "daily");
    setTrack(draft.curriculum?.track ?? "term");
    setTerm(draft.curriculum?.term ?? "الفصل الأول");
    setUnit(draft.curriculum?.unit ?? "");
    setLesson(draft.curriculum?.lesson ?? "");
    setSelectedStudentIds(draft.studentIds ?? []);

    const map: Record<string, string> = {};
    (draft.studentIds ?? []).forEach((studentId, index) => {
      const sessionId = draft.sessionIds?.[index];
      if (sessionId) map[studentId] = sessionId;
    });
    setStudentSessionMap(map);

    setPassThreshold(draft.passThreshold ?? 100);
    setShuffleOptions(draft.shuffleOptions ?? false);
    setShuffleQuestions(draft.shuffleQuestions ?? false);
    setQuestions(
      draft.questions.length > 0
        ? draft.questions.map((item) => ({ ...item, key: crypto.randomUUID() }))
        : [createEmptyQuestion()],
    );
    setFeedback("تم تحميل المسودة — عدّل ما تشاء ثم احفظ أو انشر.");
  };

  const handleDeleteDraft = async (draftId: string) => {
    if (!window.confirm("حذف هذه المسودة نهائيًا؟")) return;
    await deleteDoc(doc(getFirebaseDb(), "quizzes", draftId));
    if (editingQuizId === draftId) resetForm();
  };

  const handleSave = async (status: "draft" | "published") => {
    setFeedback(null);

    if (status === "published") {
      if (selectedStudentIds.length === 0) {
        setFeedback("حدّد طالبًا واحدًا على الأقل لتكليفهم بالاختبار.");
        return;
      }

      if (selectedStudentIds.some((studentId) => !studentSessionMap[studentId])) {
        setFeedback("يرجى اختيار جلسة كل طالب محدد قبل النشر.");
        return;
      }

      const hasInvalidQuestion = questions.some(
        (item) =>
          !item.question.trim() ||
          item.options.some((option) => !option.trim()) ||
          !item.correctAnswer.trim() ||
          !item.options.includes(item.correctAnswer),
      );

      if (hasInvalidQuestion) {
        setFeedback("يرجى تعبئة كل الأسئلة والخيارات وتحديد إجابة صحيحة لكل سؤال.");
        return;
      }
    }

    setIsSaving(true);

    try {
      const sessionIds = selectedStudentIds.map((studentId) => studentSessionMap[studentId]).filter(Boolean);
      const quiz: Omit<QuizDoc, "quizId"> = {
        sessionIds,
        title: title.trim() || undefined,
        studentIds: selectedStudentIds,
        type: quizType,
        status,
        curriculum: {
          track,
          ...(track === "term" ? { term } : {}),
          ...(unit.trim() ? { unit: unit.trim() } : {}),
          ...(lesson.trim() ? { lesson: lesson.trim() } : {}),
        },
        createdAt: Date.now(),
        passThreshold,
        shuffleOptions,
        shuffleQuestions,
        questions: questions.map(({ question, options, correctAnswer, questionMedia, optionMedia, points }) => ({
          question,
          options,
          correctAnswer,
          questionMedia,
          optionMedia,
          points,
        })),
      };

      if (editingQuizId) {
        await updateDoc(doc(getFirebaseDb(), "quizzes", editingQuizId), quiz);
      } else {
        const reference = await addDoc(collection(getFirebaseDb(), "quizzes"), quiz);
        if (status === "draft") setEditingQuizId(reference.id);
      }

      if (status === "published") {
        resetForm();
        setFeedback("تم نشر الاختبار بنجاح.");
      } else {
        setFeedback("تم حفظ المسودة بنجاح. يمكنك متابعتها لاحقًا من قائمة المسودات أدناه.");
      }
    } catch {
      setFeedback("تعذر حفظ الاختبار. حاول مرة أخرى.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="quiz-builder">
      {drafts.length > 0 && (
        <div className="pending-invites quiz-drafts-list">
          <h3>مسودات محفوظة ({drafts.length})</h3>
          <ul className="student-list">
            {drafts.map((draft) => (
              <li key={draft.id} className="list-row">
                <div className="list-row-info">
                  <span className="student-name">{draft.title || "اختبار بلا عنوان"}</span>
                  <span className="student-email">{draft.questions.length} سؤال</span>
                </div>
                <div className="list-row-actions">
                  <button type="button" className="logout-button" onClick={() => handleLoadDraft(draft)}>متابعة التحرير</button>
                  <button type="button" className="logout-button" onClick={() => void handleDeleteDraft(draft.id)}>حذف</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="quiz-type-tabs" aria-label="نوع الاختبار">
        <button type="button" className={quizType === "daily" ? "quiz-tab active" : "quiz-tab"} onClick={() => setQuizType("daily")}>
          اختبار يومي
        </button>
        <button
          type="button"
          className={quizType === "comprehensive" ? "quiz-tab active" : "quiz-tab"}
          onClick={() => setQuizType("comprehensive")}
        >
          اختبار شامل
        </button>
      </div>

      <label className="field">
        <span>{quizType === "comprehensive" ? "اسم الاختبار الشامل" : "اسم الاختبار اليومي"}</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مثال: اختبار الدوال" />
      </label>

      <div className="curriculum-grid">
        <label className="field">
          <span>المسار</span>
          <select value={track} onChange={(event) => setTrack(event.target.value as "foundation" | "term")}>
            <option value="foundation">التأسيس</option>
            <option value="term">الفصول الدراسية</option>
          </select>
        </label>
        {track === "term" && (
          <label className="field">
            <span>الفصل</span>
            <input value={term} onChange={(event) => setTerm(event.target.value)} />
          </label>
        )}
        <label className="field">
          <span>الوحدة</span>
          <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="الوحدة الأولى" />
        </label>
        <label className="field">
          <span>الدرس</span>
          <input value={lesson} onChange={(event) => setLesson(event.target.value)} placeholder="اسم الدرس" />
        </label>
      </div>

      <div className="quiz-settings-grid">
        <label className="field">
          <span>نسبة النجاح المطلوبة %</span>
          <input
            type="number"
            min={1}
            max={100}
            value={passThreshold}
            onChange={(event) => setPassThreshold(Math.min(100, Math.max(1, Number(event.target.value) || 100)))}
          />
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={shuffleQuestions} onChange={(event) => setShuffleQuestions(event.target.checked)} />
          <span>ترتيب عشوائي للأسئلة لكل طالب</span>
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={shuffleOptions} onChange={(event) => setShuffleOptions(event.target.checked)} />
          <span>ترتيب عشوائي للخيارات لكل طالب</span>
        </label>
      </div>

      <fieldset className="student-assignment student-assignment-sessions">
        <legend>الطلاب المكلّفون، وجلسة كل طالب</legend>
        <p className="quiz-hint">
          حدّد أولًا الطلاب المكلّفين بهذا الاختبار، ثم اختر لكل طالب الجلسة الخاصة به التي سيظهر
          الاختبار مرتبطًا بها — كل طالب يرى جلساته فقط، فلا يحدث خلط بين طالب وجلسة طالب آخر.
        </p>
        {students.map((student) => {
          const studentSessions = sessions.filter((session) => session.studentId === student.uid);
          const isSelected = selectedStudentIds.includes(student.uid);

          return (
            <div key={student.uid} className="student-assignment-row">
              <label className="checkbox-field">
                <input type="checkbox" checked={isSelected} onChange={(event) => toggleStudent(student.uid, event.target.checked)} />
                <span>
                  {student.displayName}
                  {student.gradeLevel ? ` - ${student.gradeLevel}` : ""}
                </span>
              </label>
              {isSelected && studentSessions.length > 0 && (
                <select
                  value={studentSessionMap[student.uid] ?? ""}
                  onChange={(event) => setStudentSessionMap((previous) => ({ ...previous, [student.uid]: event.target.value }))}
                >
                  <option value="">اختر جلسة هذا الطالب</option>
                  {studentSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.videoTitle}
                    </option>
                  ))}
                </select>
              )}
              {isSelected && studentSessions.length === 0 && <span className="quiz-hint">لا توجد جلسات لهذا الطالب بعد.</span>}
            </div>
          );
        })}
        {students.length === 0 && <p className="empty-state">لا يوجد طلاب مسجّلون بعد.</p>}
      </fieldset>

      <div className="quiz-question-stream">
        {questions.map((question, questionIndex) => (
          <article key={question.key} className="quiz-question-card">
            <div className="quiz-question-card-header">
              <span className="quiz-question-number">سؤال {questionIndex + 1}</span>
              <div className="quiz-question-card-tools">
                <label className="quiz-points-field">
                  <span>الدرجة</span>
                  <input
                    type="number"
                    min={1}
                    value={question.points ?? 1}
                    onChange={(event) => updateQuestion(question.key, { points: Math.max(1, Number(event.target.value) || 1) })}
                  />
                </label>
                <button type="button" className="logout-button" disabled={questionIndex === 0} onClick={() => handleMoveQuestion(questionIndex, -1)} title="نقل لأعلى">
                  ▲
                </button>
                <button type="button" className="logout-button" disabled={questionIndex === questions.length - 1} onClick={() => handleMoveQuestion(questionIndex, 1)} title="نقل لأسفل">
                  ▼
                </button>
                <button type="button" className="logout-button" onClick={() => handleDuplicateQuestion(question.key)}>
                  نسخ السؤال
                </button>
                {questions.length > 1 && (
                  <button type="button" className="logout-button" onClick={() => handleRemoveQuestion(question.key)}>
                    حذف السؤال
                  </button>
                )}
              </div>
            </div>

            <MathInlineField
              label="نص السؤال"
              value={question.question}
              onChange={(value) => updateQuestion(question.key, { question: value })}
              media={question.questionMedia ?? []}
              onAddMedia={(media) =>
                updateQuestion(question.key, { questionMedia: [...(question.questionMedia ?? []), media] })
              }
              onRemoveMedia={(index) =>
                updateQuestion(question.key, {
                  questionMedia: (question.questionMedia ?? []).filter((_, itemIndex) => itemIndex !== index),
                })
              }
              placeholder="اكتب نص السؤال، أو استخدم أيقونة Σ لإدراج رموز رياضية"
              driveFolderId={activeStudentDriveFolderId}
            />

            <div className="quiz-options">
              {question.options.map((option, optionIndex) => (
                <div key={optionIndex} className="quiz-option-row">
                  <MathInlineField
                    label={`خيار ${optionIndex + 1}`}
                    value={option}
                    onChange={(value) => {
                      const nextOptions = [...question.options];
                      nextOptions[optionIndex] = value;
                      updateQuestion(question.key, { options: nextOptions });
                    }}
                    media={question.optionMedia?.[String(optionIndex)] ?? []}
                    onAddMedia={(media) => {
                      const optionMedia = { ...(question.optionMedia ?? {}) };
                      optionMedia[String(optionIndex)] = [...(optionMedia[String(optionIndex)] ?? []), media];
                      updateQuestion(question.key, { optionMedia });
                    }}
                    onRemoveMedia={(index) => {
                      const optionMedia = { ...(question.optionMedia ?? {}) };
                      optionMedia[String(optionIndex)] = (optionMedia[String(optionIndex)] ?? []).filter(
                        (_, itemIndex) => itemIndex !== index,
                      );
                      updateQuestion(question.key, { optionMedia });
                    }}
                    placeholder="اكتب نص الخيار"
                    driveFolderId={activeStudentDriveFolderId}
                  />
                  <label className="role-option quiz-option-correct">
                    <input
                      type="radio"
                      name={`correct-${question.key}`}
                      checked={Boolean(option.trim()) && question.correctAnswer === option}
                      disabled={!option.trim()}
                      onChange={() => updateQuestion(question.key, { correctAnswer: option })}
                    />
                    <span>إجابة صحيحة</span>
                  </label>
                  {question.options.length > 1 && (
                    <button
                      type="button"
                      className="logout-button"
                      onClick={() => handleRemoveOption(question.key, optionIndex)}
                    >
                      حذف الخيار
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="logout-button" onClick={() => handleAddOption(question.key)}>
                + خيار إضافي
              </button>
            </div>
          </article>
        ))}
      </div>

      <button type="button" className="quiz-tab quiz-tab-add" onClick={handleAddQuestion}>
        + سؤال جديد
      </button>

      {feedback && <p className="form-feedback">{feedback}</p>}

      <div className="quiz-builder-actions">
        <button type="button" className="logout-button" onClick={() => setIsPreviewOpen(true)}>
          معاينة الاختبار
        </button>
        <button type="button" className="logout-button" onClick={() => void handleSave("draft")} disabled={isSaving}>
          {isSaving ? "جارٍ الحفظ..." : "حفظ كمسودة"}
        </button>
        <button type="button" className="primary-button" onClick={() => void handleSave("published")} disabled={isSaving}>
          {isSaving ? "جارٍ النشر..." : "نشر الاختبار للطلاب"}
        </button>
      </div>

      {isPreviewOpen && (
        <QuizPreviewModal title={title} questions={questions} onClose={() => setIsPreviewOpen(false)} />
      )}
    </div>
  );
};

export default QuizBuilder;

