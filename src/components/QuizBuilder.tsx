"use client";

import { useEffect, useRef, useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { getFirebaseDb } from "@/utils/firebase";
import ImageUploader from "@/components/ImageUploader";
import GraphGenerator from "@/components/GraphGenerator";
import MathText from "@/components/MathText";
import { requestGoogleDriveToken, uploadDriveImage } from "@/utils/googleDrive";
import type { MathfieldElement } from "mathlive";
import type { QuizDoc, QuizMedia, QuizQuestion, UserDoc } from "@/types";

interface QuizBuilderProps {
  sessions: { id: string; videoTitle: string }[];
  students: UserDoc[];
}

interface QuestionDraft extends QuizQuestion {
  key: string;
}

interface ToolGroup {
  label: string;
  tools: { label: string; latex?: string; generate?: () => string | null }[];
}

// يبني مصفوفة LaTeX بأي عدد صفوف/أعمدة يطلبه المعلّم (بلا حد أقصى)، باستخدام \placeholder{}
// بدل #0-#9 التي تقتصر على عشرة مواضع فقط.
const generateMatrixLatex = (): string | null => {
  const rowsInput = window.prompt("عدد الصفوف؟", "2");
  if (!rowsInput) return null;
  const colsInput = window.prompt("عدد الأعمدة؟", "2");
  if (!colsInput) return null;
  const envInput = window.prompt("نوع الأقواس: pmatrix (قوسان) / bmatrix (مربّعة) / vmatrix (خطّان)", "pmatrix");

  const rows = Math.max(1, Math.round(Number(rowsInput)) || 0);
  const cols = Math.max(1, Math.round(Number(colsInput)) || 0);
  const env = envInput && ["pmatrix", "bmatrix", "vmatrix"].includes(envInput.trim()) ? envInput.trim() : "pmatrix";

  const rowLatex = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => "\\placeholder{}").join(" & "),
  ).join(" \\\\ ");

  return `\\begin{${env}}${rowLatex}\\end{${env}}`;
};

// يبني اقترانًا متشعّبًا بأي عدد حالات يطلبه المعلّم.
const generatePiecewiseLatex = (): string | null => {
  const casesInput = window.prompt("عدد الحالات (cases)؟", "2");
  if (!casesInput) return null;

  const cases = Math.max(1, Math.round(Number(casesInput)) || 0);
  const rowLatex = Array.from({ length: cases }, () => "\\placeholder{} & \\placeholder{}").join(" \\\\ ");

  return `\\begin{cases} ${rowLatex} \\end{cases}`;
};
// أدوات موسعّة لمواد رياضية متقدمة، مجمّعة في تبويبات كأدوات المعادلات في Word.
const TOOL_GROUPS: ToolGroup[] = [
  {
    label: "الأساسيات",
    tools: [
      { label: "كسر a⁄b", latex: "\\frac{#0}{#1}" },
      { label: "أُس xⁿ", latex: "#0^{#1}" },
      { label: "دليل سفلي", latex: "#0_{#1}" },
      { label: "جذر تربيعي", latex: "\\sqrt{#0}" },
      { label: "جذر من الرتبة n", latex: "\\sqrt[#0]{#1}" },
      { label: "قيمة مطلقة", latex: "\\left|#0\\right|" },
    ],
  },
  {
    label: "دوال متقدمة",
    tools: [
      { label: "اقتران متشعّب (أي عدد حالات)", generate: generatePiecewiseLatex },
      { label: "دالة عامة f(x)", latex: "f(#0)" },
      { label: "أسي طبيعي eˣ", latex: "e^{#0}" },
      { label: "لوغاريتم طبيعي ln", latex: "\\ln(#0)" },
      { label: "لوغاريتم بأساس", latex: "\\log_{#0}(#1)" },
      { label: "نهاية", latex: "\\lim_{#0 \\to #1} #2" },
    ],
  },
  {
    label: "التفاضل والتكامل",
    tools: [
      { label: "تكامل", latex: "\\int #0\\,d#1" },
      { label: "تكامل محدد", latex: "\\int_{#0}^{#1} #2\\,d#3" },
      { label: "تكامل مضاعف", latex: "\\iint #0\\,dA" },
      { label: "مشتقة", latex: "\\frac{d#0}{d#1}" },
      { label: "مشتقة جزئية", latex: "\\frac{\\partial #0}{\\partial #1}" },
      { label: "مجموع Σ", latex: "\\sum_{#0}^{#1} #2" },
      { label: "جداء Π", latex: "\\prod_{#0}^{#1} #2" },
    ],
  },
  {
    label: "المصفوفات والمتجهات",
    tools: [
      { label: "مصفوفة (أي عدد صفوف/أعمدة)", generate: generateMatrixLatex },
      { label: "محدّد", latex: "\\begin{vmatrix}#0&#1\\\\#2&#3\\end{vmatrix}" },
      { label: "متجه", latex: "\\vec{#0}" },
    ],
  },
  {
    label: "المثلثات",
    tools: [
      { label: "جا sin", latex: "\\sin(#0)" },
      { label: "جتا cos", latex: "\\cos(#0)" },
      { label: "ظا tan", latex: "\\tan(#0)" },
      { label: "قتا csc", latex: "\\csc(#0)" },
      { label: "قا sec", latex: "\\sec(#0)" },
      { label: "ظتا cot", latex: "\\cot(#0)" },
      { label: "sin⁻¹", latex: "\\sin^{-1}(#0)" },
    ],
  },
  {
    label: "رموز ومقارنات",
    tools: [
      { label: "≤", latex: "\\leq" },
      { label: "≥", latex: "\\geq" },
      { label: "<", latex: "<" },
      { label: ">", latex: ">" },
      { label: "≠", latex: "\\neq" },
      { label: "≈", latex: "\\approx" },
      { label: "±", latex: "\\pm" },
      { label: "∞", latex: "\\infty" },
      { label: "∈", latex: "\\in" },
      { label: "∀", latex: "\\forall" },
      { label: "∃", latex: "\\exists" },
    ],
  },
  {
    label: "الحروف اليونانية",
    tools: [
      { label: "α", latex: "\\alpha" },
      { label: "β", latex: "\\beta" },
      { label: "θ", latex: "\\theta" },
      { label: "π", latex: "\\pi" },
      { label: "λ", latex: "\\lambda" },
      { label: "μ", latex: "\\mu" },
      { label: "σ", latex: "\\sigma" },
      { label: "Δ", latex: "\\Delta" },
      { label: "Ω", latex: "\\Omega" },
    ],
  },
  {
    label: "نص ثنائي اللغة",
    tools: [{ label: "نص / Text", latex: "\\text{#0}" }],
  },
];

type MathTarget = { kind: "question" } | { kind: "option"; index: number };

const createEmptyQuestion = (): QuestionDraft => ({
  key: crypto.randomUUID(),
  question: "",
  options: ["", "", ""],
  correctAnswer: "",
});

const QuizBuilder = ({ sessions, students }: QuizBuilderProps) => {
  const [sessionId, setSessionId] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([createEmptyQuestion()]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeTarget, setActiveTarget] = useState<MathTarget>({ kind: "question" });
  const [activeToolGroup, setActiveToolGroup] = useState(TOOL_GROUPS[0].label);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<"content" | "media" | "review">("content");
  const [title, setTitle] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const mathContainerRef = useRef<HTMLDivElement | null>(null);
  const mathFieldRef = useRef<MathfieldElement | null>(null);
  const activeIndexRef = useRef(0);
  const activeTargetRef = useRef<MathTarget>({ kind: "question" });
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    activeTargetRef.current = activeTarget;
  }, [activeTarget]);

  // MathLive تقرأ document عند الاستيراد، لذا تُستورد ديناميكيًا داخل المتصفح فقط
  // كي لا يكسر تصدير Next.js الثابت (نفس الدرس المطبّق سابقًا على Plyr).
  useEffect(() => {
    let isCancelled = false;

    const setup = async () => {
      const { MathfieldElement: MathfieldElementCtor } = await import("mathlive");
      if (isCancelled || !mathContainerRef.current) return;

      const field = new MathfieldElementCtor();
      field.setAttribute("math-virtual-keyboard-policy", "manual");
      field.style.width = "100%";
      field.style.direction = "ltr";
      field.style.minHeight = "56px";

      field.addEventListener("input", () => {
        const index = activeIndexRef.current;
        const target = activeTargetRef.current;

        setQuestions((prev) =>
          prev.map((item, itemIndex) => {
            if (itemIndex !== index) return item;
            if (target.kind === "question") return { ...item, question: field.value };

            const nextOptions = [...item.options];
            nextOptions[target.index] = field.value;
            return { ...item, options: nextOptions };
          }),
        );
      });

      mathContainerRef.current.innerHTML = "";
      mathContainerRef.current.appendChild(field);
      mathFieldRef.current = field;
    };

    void setup();

    return () => {
      isCancelled = true;
      window.mathVirtualKeyboard?.hide();
      mathFieldRef.current?.remove();
      mathFieldRef.current = null;
    };
  }, []);

  // إخفاء لوحة المفاتيح الافتراضية عند النقر خارج منطقة تحرير الاختبار (تبقى ظاهرة أحيانًا بلا سبب).
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(event.target as Node)) {
        window.mathVirtualKeyboard?.hide();
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // يزامن حقل المعادلة مع نص الهدف النَشِط (السؤال أو أحد الخيارات) عند تبديل السؤال/الهدف/تعديل مباشر.
  useEffect(() => {
    const field = mathFieldRef.current;
    if (!field) return;

    const current = questions[activeIndex];
    const text =
      activeTarget.kind === "question" ? current?.question ?? "" : current?.options[activeTarget.index] ?? "";

    if (field.value !== text) field.value = text;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, activeTarget, questions]);

  const updateActiveQuestion = (patch: Partial<QuestionDraft>) => {
    setQuestions((prev) =>
      prev.map((item, index) => (index === activeIndex ? { ...item, ...patch } : item)),
    );
  };

  const handleToolClick = (tool: { latex?: string; generate?: () => string | null }) => {
    const latex = tool.generate ? tool.generate() : tool.latex;
    if (!latex) return;
    mathFieldRef.current?.insert(latex, { focus: true });
  };

  const handleMediaUploaded = async (url: string, kind: QuizMedia["kind"]) => {
    const target = activeTarget;
    const current = questions[activeIndex];
    if (!current) return;

    let storedUrl = url;
    const activeStudent = selectedStudentIds.length === 1
      ? students.find((student) => student.uid === selectedStudentIds[0])
      : undefined;

    if (activeStudent?.driveFolderId && url.startsWith("data:")) {
      try {
        const token = await requestGoogleDriveToken();
        storedUrl = await uploadDriveImage(token, activeStudent.driveFolderId, url, `${kind}-${Date.now()}.png`);
      } catch {
        setFeedback("تعذر رفع الوسيط إلى Drive، فتم الاحتفاظ به داخل الاختبار.");
      }
    }

    const media: QuizMedia = { url: storedUrl, kind };

    if (target.kind === "question") {
      updateActiveQuestion({ questionMedia: [...(current.questionMedia ?? []), media] });
    } else {
      const optionMedia = { ...(current.optionMedia ?? {}) };
      optionMedia[String(target.index)] = [...(optionMedia[String(target.index)] ?? []), media];
      updateActiveQuestion({ optionMedia });
    }
  };

  const handleAddQuestion = () => {
    setQuestions((prev) => [...prev, createEmptyQuestion()]);
    setActiveIndex(questions.length);
    setActiveTarget({ kind: "question" });
  };

  const handleSelectQuestion = (index: number) => {
    setActiveIndex(index);
    setActiveTarget({ kind: "question" });
  };

  const handleRemoveQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setActiveIndex((prev) => Math.max(0, prev >= index ? prev - 1 : prev));
    setActiveTarget({ kind: "question" });
  };

  const handleAddOption = () => {
    const current = questions[activeIndex];
    updateActiveQuestion({ options: [...(current?.options ?? []), ""] });
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
      setActiveIndex(0);
      setActiveTarget({ kind: "question" });
      setTitle("");
      setSelectedStudentIds([]);
      setFeedback("تم حفظ الاختبار بنجاح.");
    } catch {
      setFeedback("تعذر حفظ الاختبار. حاول مرة أخرى.");
    } finally {
      setIsSaving(false);
    }
  };

  const activeQuestion = questions[activeIndex];
  const activeToolTools = TOOL_GROUPS.find((group) => group.label === activeToolGroup)?.tools ?? [];

  return (
    <div className="quiz-builder">
      <label className="field">
        <span>اسم الاختبار</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مثال: اختبار الدوال" />
      </label>
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

      <div className="quiz-question-tabs">
        {questions.map((question, index) => (
          <button
            key={question.key}
            type="button"
            className={index === activeIndex ? "quiz-tab active" : "quiz-tab"}
            onClick={() => handleSelectQuestion(index)}
          >
            سؤال {index + 1}
          </button>
        ))}
        <button type="button" className="quiz-tab quiz-tab-add" onClick={handleAddQuestion}>
          + سؤال جديد
        </button>
      </div>

      <div className="quiz-workspace-tabs" role="tablist" aria-label="مساحة بناء الاختبار">
        <button type="button" className={activeWorkspaceTab === "content" ? "quiz-tab active" : "quiz-tab"} onClick={() => setActiveWorkspaceTab("content")}>المحتوى والرموز</button>
        <button type="button" className={activeWorkspaceTab === "media" ? "quiz-tab active" : "quiz-tab"} onClick={() => setActiveWorkspaceTab("media")}>الصور والرسم</button>
        <button type="button" className={activeWorkspaceTab === "review" ? "quiz-tab active" : "quiz-tab"} onClick={() => setActiveWorkspaceTab("review")}>التكليف والمراجعة</button>
      </div>

      <div className="quiz-builder-editor" ref={editorRef}>
        <p className="quiz-hint">
          اختر أولاً الحقل الذي تريد تحريره (نص السؤال أو أحد الخيارات) من الأسفل، ثم استخدم تبويبات
          الرموز لإدراج قوالب رياضية جاهزة، وتنقّل بالأسهم لتعبئة الفراغات.
        </p>

        <div className="math-target-tabs">
          <button
            type="button"
            className={activeTarget.kind === "question" ? "quiz-tab active" : "quiz-tab"}
            onClick={() => setActiveTarget({ kind: "question" })}
          >
            نص السؤال
          </button>
          {activeQuestion?.options.map((_, optionIndex) => (
            <button
              key={optionIndex}
              type="button"
              className={
                activeTarget.kind === "option" && activeTarget.index === optionIndex ? "quiz-tab active" : "quiz-tab"
              }
              onClick={() => setActiveTarget({ kind: "option", index: optionIndex })}
            >
              خيار {optionIndex + 1}
            </button>
          ))}
        </div>

        <div className="quiz-tab-panel" hidden={activeWorkspaceTab !== "content"}>
        <div className="math-toolbar">
          <div className="math-toolbar-tabs">
            {TOOL_GROUPS.map((group) => (
              <button
                key={group.label}
                type="button"
                className={group.label === activeToolGroup ? "math-toolbar-tab active" : "math-toolbar-tab"}
                onClick={() => setActiveToolGroup(group.label)}
              >
                {group.label}
              </button>
            ))}
          </div>
          <div className="math-toolbar-buttons">
            {activeToolTools.map((tool) => (
              <button
                key={tool.label}
                type="button"
                className="math-tool-button"
                onClick={() => handleToolClick(tool)}
              >
                {tool.label}
              </button>
            ))}
          </div>
        </div>

        <div className="math-field-shell" ref={mathContainerRef} />
        <button
          type="button"
          className="logout-button"
          onClick={() => window.mathVirtualKeyboard?.hide()}
        >
          إخفاء لوحة المفاتيح
        </button>
        </div>

        <div className="quiz-tab-panel" hidden={activeWorkspaceTab !== "media"}>
          <ImageUploader onUploaded={(url) => void handleMediaUploaded(url, "image")} />
          <GraphGenerator onInsert={(url) => void handleMediaUploaded(url, "graph")} />
          <div className="media-preview-list">
            {(activeTarget.kind === "question"
              ? activeQuestion?.questionMedia ?? []
              : activeQuestion?.optionMedia?.[String(activeTarget.index)] ?? []).map((media, index) => (
              <img key={`${media.url}-${index}`} src={media.url} alt="معاينة الوسيط" className="media-preview" />
            ))}
          </div>
        </div>

        <div className="quiz-tab-panel" hidden={activeWorkspaceTab !== "review"}>
        <fieldset className="student-assignment">
          <legend>الطلاب المكلّفون بالاختبار</legend>
          {students.map((student) => (
            <label key={student.uid} className="checkbox-field">
              <input
                type="checkbox"
                checked={selectedStudentIds.includes(student.uid)}
                onChange={(event) => setSelectedStudentIds((previous) => (
                  event.target.checked
                    ? [...previous, student.uid]
                    : previous.filter((studentId) => studentId !== student.uid)
                ))}
              />
              <span>{student.displayName}{student.gradeLevel ? ` - ${student.gradeLevel}` : ""}</span>
            </label>
          ))}
        </fieldset>
        <div className="quiz-options">
          {activeQuestion?.options.map((option, optionIndex) => (
            <label key={optionIndex} className="field">
              <span>خيار {optionIndex + 1}</span>
              <input
                type="text"
                value={option}
                onChange={(event) => {
                  const nextOptions = [...activeQuestion.options];
                  nextOptions[optionIndex] = event.target.value;
                  updateActiveQuestion({ options: nextOptions });
                }}
                placeholder="اكتب نص الخيار، أو اختر تبويب هذا الخيار أعلاه لإدراج رموز رياضية"
              />
              {option.trim() && <MathText content={option} className="option-preview" />}
              {(activeQuestion.optionMedia?.[String(optionIndex)] ?? []).map((media, mediaIndex) => (
                <img key={`${media.url}-${mediaIndex}`} src={media.url} alt="وسيط الخيار" className="option-media-preview" />
              ))}
            </label>
          ))}
          <button type="button" className="logout-button" onClick={handleAddOption}>
            + خيار إضافي
          </button>
        </div>

        <fieldset className="role-select">
          <legend>الإجابة الصحيحة</legend>
          {activeQuestion?.options
            .filter((option) => option.trim())
            .map((option, optionIndex) => (
              <label key={optionIndex} className="role-option">
                <input
                  type="radio"
                  name="correct-answer"
                  checked={activeQuestion.correctAnswer === option}
                  onChange={() => updateActiveQuestion({ correctAnswer: option })}
                />
                <MathText content={option} />
              </label>
            ))}
        </fieldset>

        {questions.length > 1 && (
          <button type="button" className="logout-button" onClick={() => handleRemoveQuestion(activeIndex)}>
            حذف هذا السؤال
          </button>
        )}
        </div>
      </div>

      {feedback && <p className="form-feedback">{feedback}</p>}

      <button type="button" className="primary-button" onClick={() => void handleSave()} disabled={isSaving}>
        {isSaving ? "جارٍ الحفظ..." : "حفظ الاختبار"}
      </button>
    </div>
  );
};

export default QuizBuilder;
