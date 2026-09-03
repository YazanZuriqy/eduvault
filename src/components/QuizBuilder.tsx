"use client";

import { useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { getFirebaseDb } from "@/utils/firebase";
import MathInlineField from "@/components/MathInlineField";
import type { QuizDoc, QuizMedia, QuizQuestion, UserDoc } from "@/types";

interface QuizBuilderProps {
  sessions: { id: string; videoTitle: string }[];
  students: UserDoc[];
  assignedStudentId?: string;
}

interface QuestionDraft extends QuizQuestion {
  key: string;
}

const createEmptyQuestion = (): QuestionDraft => ({
  key: crypto.randomUUID(),
  question: "",
  options: ["", "", ""],
  correctAnswer: "",
});

// نموذج بناء اختبار واحد ومتدفّق رأسيًا: كل سؤال وكل خيار يظهر ضمن الصفحة نفسها بلا تبويبات
// مخفية، ولكل صندوق كتابة أدوات الرموز الرياضية والوسائط الخاصة به ملاصقة له مباشرة.
const QuizBuilder = ({ sessions, students, assignedStudentId }: QuizBuilderProps) => {
  const [sessionId, setSessionId] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([createEmptyQuestion()]);
  const [quizType, setQuizType] = useState<"daily" | "comprehensive">("daily");
  const [track, setTrack] = useState<"foundation" | "term">("term");
  const [term, setTerm] = useState("الفصل الأول");
  const [unit, setUnit] = useState("");
  const [lesson, setLesson] = useState("");
  const [title, setTitle] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(assignedStudentId ? [assignedStudentId] : []);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const activeStudentDriveFolderId =
    selectedStudentIds.length === 1
      ? students.find((student) => student.uid === selectedStudentIds[0])?.driveFolderId
      : undefined;

  const updateQuestion = (key: string, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const handleAddQuestion = () => {
    setQuestions((prev) => [...prev, createEmptyQuestion()]);
  };

  const handleRemoveQuestion = (key: string) => {
    setQuestions((prev) => prev.filter((item) => item.key !== key));
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

  const handleSave = async () => {
    setFeedback(null);

    if (!sessionId) {
      setFeedback("يرجى اختيار الجلسة المرتبطة بالاختبار.");
      return;
    }

    if (selectedStudentIds.length === 0) {
      setFeedback("حدّد طالبًا واحدًا على الأقل لتكليفهم بالاختبار.");
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

    setIsSaving(true);

    try {
      const quiz: Omit<QuizDoc, "quizId"> = {
        sessionId,
        title: title.trim() || undefined,
        studentIds: selectedStudentIds,
        type: quizType,
        curriculum: {
          track,
          ...(track === "term" ? { term } : {}),
          ...(unit.trim() ? { unit: unit.trim() } : {}),
          ...(lesson.trim() ? { lesson: lesson.trim() } : {}),
        },
        createdAt: Date.now(),
        questions: questions.map(({ question, options, correctAnswer, questionMedia, optionMedia }) => ({
          question,
          options,
          correctAnswer,
          questionMedia,
          optionMedia,
        })),
      };

      await addDoc(collection(getFirebaseDb(), "quizzes"), quiz);

      setQuestions([createEmptyQuestion()]);
      setTitle("");
      setSelectedStudentIds([]);
      setUnit("");
      setLesson("");
      setFeedback("تم حفظ الاختبار بنجاح.");
    } catch {
      setFeedback("تعذر حفظ الاختبار. حاول مرة أخرى.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="quiz-builder">
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

      <label className="field">
        <span>الجلسة المرتبطة</span>
        <select value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
          <option value="">اختر جلسة</option>
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.videoTitle}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="student-assignment">
        <legend>الطلاب المكلّفون بالاختبار</legend>
        {students.map((student) => (
          <label key={student.uid} className="checkbox-field">
            <input
              type="checkbox"
              checked={selectedStudentIds.includes(student.uid)}
              onChange={(event) =>
                setSelectedStudentIds((previous) =>
                  event.target.checked
                    ? [...previous, student.uid]
                    : previous.filter((studentId) => studentId !== student.uid),
                )
              }
            />
            <span>
              {student.displayName}
              {student.gradeLevel ? ` - ${student.gradeLevel}` : ""}
            </span>
          </label>
        ))}
        {students.length === 0 && <p className="empty-state">لا يوجد طلاب مسجّلون بعد.</p>}
      </fieldset>

      <div className="quiz-question-stream">
        {questions.map((question, questionIndex) => (
          <article key={question.key} className="quiz-question-card">
            <div className="quiz-question-card-header">
              <span className="quiz-question-number">سؤال {questionIndex + 1}</span>
              {questions.length > 1 && (
                <button type="button" className="logout-button" onClick={() => handleRemoveQuestion(question.key)}>
                  حذف السؤال
                </button>
              )}
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

      <button type="button" className="primary-button" onClick={() => void handleSave()} disabled={isSaving}>
        {isSaving ? "جارٍ الحفظ..." : "حفظ الاختبار"}
      </button>
    </div>
  );
};

export default QuizBuilder;

