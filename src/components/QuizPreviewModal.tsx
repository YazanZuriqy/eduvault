"use client";

import MathText from "@/components/MathText";
import type { QuizQuestion } from "@/types";

interface QuizPreviewModalProps {
  title: string;
  questions: QuizQuestion[];
  onClose: () => void;
}

// معاينة داخلية للمعلّم فقط: تعرض الاختبار تمامًا كما سيظهر للطالب (نفس عرض MathText والوسائط)
// لكن بإبراز الإجابة الصحيحة بدل نموذج إجابة تفاعلي — لا إرسال ولا أي تأثير على بيانات حقيقية.
const QuizPreviewModal = ({ title, questions, onClose }: QuizPreviewModalProps) => (
  <div className="quiz-modal-backdrop" role="dialog" aria-modal="true">
    <div className="quiz-modal">
      <header className="quiz-modal-header">
        <h2>معاينة: {title || "اختبار بلا عنوان"}</h2>
        <button type="button" className="logout-button" onClick={onClose}>
          إغلاق المعاينة
        </button>
      </header>

      <div className="quiz-form">
        {questions.map((question, questionIndex) => (
          <fieldset key={questionIndex} className="quiz-question">
            <legend>
              <span className="quiz-question-number">{questionIndex + 1}.</span>
              <MathText content={question.question || "—"} className="quiz-question-math" />
              {(question.points ?? 1) !== 1 && <span className="quiz-question-points">{question.points} نقاط</span>}
            </legend>
            {(question.questionMedia ?? []).map((media, mediaIndex) => (
              <img key={`${media.url}-${mediaIndex}`} src={media.url} alt="شكل توضيحي للسؤال" className="quiz-media" />
            ))}
            {question.options.map((option, optionIndex) => {
              const isCorrect = Boolean(option) && option === question.correctAnswer;
              return (
                <label key={optionIndex} className={isCorrect ? "role-option preview-correct-option" : "role-option"}>
                  <input type="radio" checked={isCorrect} readOnly disabled />
                  <span className="quiz-option-content">
                    <MathText content={option || "—"} />
                    {(question.optionMedia?.[String(optionIndex)] ?? []).map((media, mediaIndex) => (
                      <img key={`${media.url}-${mediaIndex}`} src={media.url} alt="شكل توضيحي للخيار" className="quiz-option-media" />
                    ))}
                  </span>
                  {isCorrect && <span className="preview-correct-badge">✓ صحيحة</span>}
                </label>
              );
            })}
          </fieldset>
        ))}
        {questions.length === 0 && <p className="empty-state">لا توجد أسئلة لعرضها بعد.</p>}
      </div>
    </div>
  </div>
);

export default QuizPreviewModal;
