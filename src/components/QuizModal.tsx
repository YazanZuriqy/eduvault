"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDocs, limit, query, updateDoc, where } from "firebase/firestore";
import { getFirebaseDb } from "@/utils/firebase";
import MathText from "@/components/MathText";
import type { QuizDoc } from "@/types";

interface QuizModalProps {
  sessionId: string;
  onClose: () => void;
}

interface QuizResult {
  correctCount: number;
  totalCount: number;
  passed: boolean;
}

const QuizModal = ({ sessionId, onClose }: QuizModalProps) => {
  const [quiz, setQuiz] = useState<QuizDoc | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadQuiz = async () => {
      const quizzesQuery = query(
        collection(getFirebaseDb(), "quizzes"),
        where("sessionId", "==", sessionId),
        limit(1),
      );
      const snapshot = await getDocs(quizzesQuery);

      if (snapshot.empty) {
        setErrorMessage("لا يوجد اختبار متاح لهذه الجلسة بعد.");
        return;
      }

      const quizData = snapshot.docs[0].data() as QuizDoc;
      setQuiz(quizData);
      setAnswers(new Array(quizData.questions.length).fill(""));
    };

    void loadQuiz();
  }, [sessionId]);

  const handleSelect = (questionIndex: number, option: string) => {
    setAnswers((prev) => prev.map((value, index) => (index === questionIndex ? option : value)));
  };

  const handleSubmit = async () => {
    if (!quiz) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // لا وجود لدالة سحابية على خطة Spark: التصحيح يتم محليًا في المتصفح مقابل correctAnswer.
      const totalCount = quiz.questions.length;
      const correctCount = quiz.questions.reduce(
        (count, question, index) => (answers[index] === question.correctAnswer ? count + 1 : count),
        0,
      );
      const passed = totalCount > 0 && correctCount === totalCount;

      if (passed) {
        // قواعد Firestore تقصر تحديث الطالب على حقل quizPassed فقط.
        await updateDoc(doc(getFirebaseDb(), "sessions", sessionId), { quizPassed: true });
      }

      setResult({ correctCount, totalCount, passed });
    } catch {
      setErrorMessage("تعذر إرسال الاختبار. حاول مرة أخرى.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetry = () => {
    setResult(null);
    setAnswers(quiz ? new Array(quiz.questions.length).fill("") : []);
  };

  return (
    <div className="quiz-modal-backdrop" role="dialog" aria-modal="true">
      <div className="quiz-modal">
        <header className="quiz-modal-header">
          <h2>اختبار الجلسة</h2>
          <button type="button" className="logout-button" onClick={onClose}>
            إغلاق
          </button>
        </header>

        {errorMessage && <p className="auth-error">{errorMessage}</p>}
        {!quiz && !errorMessage && <p>جارٍ تحميل الاختبار...</p>}

        {quiz && !result && (
          <form
            className="quiz-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            {quiz.questions.map((question, questionIndex) => (
              <fieldset key={question.question} className="quiz-question">
                <legend>
                  <span className="quiz-question-number">{questionIndex + 1}.</span>
                  <MathText content={question.question} className="quiz-question-math" />
                </legend>
                {(question.questionMedia ?? []).map((media, mediaIndex) => (
                  <img key={`${media.url}-${mediaIndex}`} src={media.url} alt="شكل توضيحي للسؤال" className="quiz-media" />
                ))}
                {question.options.map((option) => (
                  <label key={option} className="role-option">
                    <input
                      required
                      type="radio"
                      name={`question-${questionIndex}`}
                      value={option}
                      checked={answers[questionIndex] === option}
                      onChange={() => handleSelect(questionIndex, option)}
                    />
                    <span className="quiz-option-content">
                      <MathText content={option} />
                      {(question.optionMedia?.[String(question.options.indexOf(option))] ?? []).map((media, mediaIndex) => (
                        <img key={`${media.url}-${mediaIndex}`} src={media.url} alt="شكل توضيحي للخيار" className="quiz-option-media" />
                      ))}
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}

            <button
              type="submit"
              className="primary-button"
              disabled={isSubmitting || answers.some((value) => !value)}
            >
              {isSubmitting ? "جارٍ الإرسال..." : "إرسال الإجابات"}
            </button>
          </form>
        )}

        {result && (
          <div className="quiz-result">
            <p>
              نتيجتك: {result.correctCount} من {result.totalCount}
            </p>
            {result.passed ? (
              <p className="form-feedback">أحسنت! تم اجتياز الاختبار وفتح الجلسة التالية.</p>
            ) : (
              <>
                <p className="auth-error">يجب الإجابة الصحيحة على جميع الأسئلة لاجتياز الاختبار.</p>
                <button type="button" className="primary-button" onClick={handleRetry}>
                  إعادة المحاولة
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default QuizModal;
