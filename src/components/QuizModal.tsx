"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, limit, or, query, updateDoc, where } from "firebase/firestore";
import { getFirebaseDb } from "@/utils/firebase";
import MathText from "@/components/MathText";
import type { QuizDoc } from "@/types";

interface QuizModalProps {
  sessionId: string;
  onClose: () => void;
}

interface QuizResult {
  earnedPoints: number;
  totalPoints: number;
  scorePercent: number;
  passed: boolean;
}

const shuffle = <T,>(items: T[]): T[] => {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const QuizModal = ({ sessionId, onClose }: QuizModalProps) => {
  const [quiz, setQuiz] = useState<QuizDoc | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadQuiz = async () => {
      // يدعم كلا المخططين: الاختبارات القديمة (sessionId واحد) والجديدة (sessionIds لكل طالب) معًا،
      // كي تستمر الاختبارات المُنشأة قبل نظام "جلسة لكل طالب" بالعمل بلا أي ترحيل بيانات يدوي.
      const quizzesQuery = query(
        collection(getFirebaseDb(), "quizzes"),
        or(where("sessionId", "==", sessionId), where("sessionIds", "array-contains", sessionId)),
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

  // ترتيب عرض الأسئلة/الخيارات يُخلط مرة واحدة فقط عند تحميل الاختبار (وليس في كل إعادة رسم)، بينما
  // يبقى التصحيح مرتبطًا دومًا بالفهرس/القيمة الأصليين فلا يتأثر بالخلط إطلاقًا.
  const questionOrder = useMemo(() => {
    if (!quiz) return [];
    const order = quiz.questions.map((_, index) => index);
    return quiz.shuffleQuestions ? shuffle(order) : order;
  }, [quiz]);

  const shuffledOptionsByQuestion = useMemo(() => {
    if (!quiz) return [];
    return quiz.questions.map((question) => (quiz.shuffleOptions ? shuffle(question.options) : question.options));
  }, [quiz]);

  const handleSelect = (questionIndex: number, option: string) => {
    setAnswers((prev) => prev.map((value, index) => (index === questionIndex ? option : value)));
  };

  const handleSubmit = async () => {
    if (!quiz) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // لا وجود لدالة سحابية على خطة Spark: التصحيح يتم محليًا في المتصفح، بوزن كل سؤال (points)
      // مقابل نسبة النجاح المطلوبة (passThreshold) بدل اشتراط الإجابة الصحيحة على الكل حصرًا.
      const totalPoints = quiz.questions.reduce((sum, question) => sum + (question.points ?? 1), 0);
      const earnedPoints = quiz.questions.reduce(
        (sum, question, index) => sum + (answers[index] === question.correctAnswer ? question.points ?? 1 : 0),
        0,
      );
      const scorePercent = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
      const passed = scorePercent >= (quiz.passThreshold ?? 100);

      if (passed) {
        // قواعد Firestore تقصر تحديث الطالب على حقل quizPassed فقط.
        await updateDoc(doc(getFirebaseDb(), "sessions", sessionId), { quizPassed: true });
      }

      setResult({ earnedPoints, totalPoints, scorePercent, passed });
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
            {questionOrder.map((originalIndex, displayIndex) => {
              const question = quiz.questions[originalIndex];
              const displayOptions = shuffledOptionsByQuestion[originalIndex] ?? question.options;
              return (
                <fieldset key={originalIndex} className="quiz-question">
                  <legend>
                    <span className="quiz-question-number">{displayIndex + 1}.</span>
                    <MathText content={question.question} className="quiz-question-math" />
                    {(question.points ?? 1) !== 1 && <span className="quiz-question-points">{question.points} نقاط</span>}
                  </legend>
                  {(question.questionMedia ?? []).map((media, mediaIndex) => (
                    <img key={`${media.url}-${mediaIndex}`} src={media.url} alt="شكل توضيحي للسؤال" className="quiz-media" />
                  ))}
                  {displayOptions.map((option) => (
                    <label key={option} className="role-option">
                      <input
                        required
                        type="radio"
                        name={`question-${originalIndex}`}
                        value={option}
                        checked={answers[originalIndex] === option}
                        onChange={() => handleSelect(originalIndex, option)}
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
              );
            })}

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
              نتيجتك: {result.scorePercent}% ({result.earnedPoints} من {result.totalPoints} نقطة)
            </p>
            {result.passed ? (
              <p className="form-feedback">أحسنت! تم اجتياز الاختبار وفتح الجلسة التالية.</p>
            ) : (
              <>
                <p className="auth-error">لم تصل بعد إلى نسبة النجاح المطلوبة. حاول مجددًا.</p>
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
