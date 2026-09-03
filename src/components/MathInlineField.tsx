"use client";

import { useEffect, useRef, useState } from "react";
import ImageUploader from "@/components/ImageUploader";
import GraphGenerator from "@/components/GraphGenerator";
import MathText from "@/components/MathText";
import { requestGoogleDriveToken, uploadDriveImage } from "@/utils/googleDrive";
import type { MathfieldElement } from "mathlive";
import type { QuizMedia } from "@/types";

interface MathToolGroup {
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

// سبع مجموعات رموز ثابتة حسب الطلب: التفاضل والتكامل، المثلثات، الحروف اليونانية، المصفوفات،
// الكسور والقوى، النهايات (وتضم أيضًا رموز المقارنة)، والمتجهات.
const MATH_TOOL_GROUPS: MathToolGroup[] = [
  {
    label: "التفاضل والتكامل",
    tools: [
      { label: "تكامل", latex: "\\int #0\\,d#1" },
      { label: "تكامل محدد", latex: "\\int_{#0}^{#1} #2\\,d#3" },
      { label: "مشتقة", latex: "\\frac{d#0}{d#1}" },
      { label: "مشتقة جزئية", latex: "\\frac{\\partial #0}{\\partial #1}" },
      { label: "مجموع Σ", latex: "\\sum_{#0}^{#1} #2" },
      { label: "جداء Π", latex: "\\prod_{#0}^{#1} #2" },
      { label: "دالة عامة f(x)", latex: "f(#0)" },
      { label: "أسي eˣ", latex: "e^{#0}" },
      { label: "لوغاريتم ln", latex: "\\ln(#0)" },
      { label: "لوغاريتم بأساس", latex: "\\log_{#0}(#1)" },
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
    label: "المصفوفات",
    tools: [
      { label: "مصفوفة (أي عدد صفوف/أعمدة)", generate: generateMatrixLatex },
      { label: "محدّد", latex: "\\begin{vmatrix}#0&#1\\\\#2&#3\\end{vmatrix}" },
    ],
  },
  {
    label: "الكسور والقوى",
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
    label: "النهايات",
    tools: [
      { label: "نهاية", latex: "\\lim_{#0 \\to #1} #2" },
      { label: "اقتران متشعّب", generate: generatePiecewiseLatex },
      { label: "≤", latex: "\\leq" },
      { label: "≥", latex: "\\geq" },
      { label: "<", latex: "<" },
      { label: ">", latex: ">" },
      { label: "≠", latex: "\\neq" },
      { label: "≈", latex: "\\approx" },
      { label: "∞", latex: "\\infty" },
    ],
  },
  {
    label: "المتجهات",
    tools: [
      { label: "متجه", latex: "\\vec{#0}" },
      { label: "±", latex: "\\pm" },
      { label: "∈", latex: "\\in" },
      { label: "نص / Text", latex: "\\text{#0}" },
    ],
  },
];

interface MathInlineFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  media: QuizMedia[];
  onAddMedia: (media: QuizMedia) => void;
  onRemoveMedia: (index: number) => void;
  placeholder?: string;
  driveFolderId?: string;
}

// حقل نصي موحّد يجمع الكتابة المباشرة + لوحة رموز رياضية + درج وسائط (صور/رسوم بيانية)، كلاهما
// يظهر فورًا ملاصقًا لنفس الصندوق الذي يعمل عليه المعلّم (سؤال أو خيار)، بلا تنقّل بين تبويبات منفصلة.
const MathInlineField = ({ label, value, onChange, media, onAddMedia, onRemoveMedia, placeholder, driveFolderId }: MathInlineFieldProps) => {
  const [isMathOpen, setIsMathOpen] = useState(false);
  const [isMediaOpen, setIsMediaOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState(MATH_TOOL_GROUPS[0].label);
  const [driveId, setDriveId] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const mathContainerRef = useRef<HTMLDivElement | null>(null);
  const mathFieldRef = useRef<MathfieldElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);

  // MathLive تقرأ document عند الاستيراد، لذا تُستورد ديناميكيًا داخل المتصفح فقط عند فتح اللوحة
  // كي لا يكسر تصدير Next.js الثابت، ولإبقاء عدد الحقول النشطة في آنٍ واحد صغيرًا.
  useEffect(() => {
    if (!isMathOpen) return;
    let isCancelled = false;

    const setup = async () => {
      const { MathfieldElement: MathfieldElementCtor } = await import("mathlive");
      if (isCancelled || !mathContainerRef.current) return;

      const field = new MathfieldElementCtor();
      field.setAttribute("math-virtual-keyboard-policy", "manual");
      field.style.width = "100%";
      field.style.direction = "ltr";
      field.style.minHeight = "48px";
      field.value = value;

      field.addEventListener("input", () => onChange(field.value));

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMathOpen]);

  // إغلاق لوحة الرموز عند النقر خارج هذا الصندوق تحديدًا (لا يؤثر على الصناديق الأخرى المفتوحة).
  useEffect(() => {
    if (!isMathOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(event.target as Node)) {
        window.mathVirtualKeyboard?.hide();
        setIsMathOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isMathOpen]);

  const handleToolClick = (tool: { latex?: string; generate?: () => string | null }) => {
    const latex = tool.generate ? tool.generate() : tool.latex;
    if (!latex) return;
    mathFieldRef.current?.insert(latex, { focus: true });
  };

  const handleMediaFromUploader = async (url: string, kind: QuizMedia["kind"]) => {
    if (driveFolderId && url.startsWith("data:")) {
      setIsUploading(true);
      try {
        const token = await requestGoogleDriveToken();
        const uploadedUrl = await uploadDriveImage(token, driveFolderId, url, `${kind}-${Date.now()}.png`);
        onAddMedia({ url: uploadedUrl, kind });
        return;
      } catch {
        // فشل الرفع إلى Drive لا يمنع إدراج الوسيط محليًا داخل الاختبار كخطة بديلة.
      } finally {
        setIsUploading(false);
      }
    }
    onAddMedia({ url, kind });
  };

  const handleInsertDriveLink = () => {
    const trimmed = driveId.trim();
    if (!trimmed) return;

    // يقبل معرّف Drive مجرّدًا أو رابط مشاركة كاملًا أو رابطًا مباشرًا لصورة خارجية.
    const idMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/) ?? trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const url = idMatch
      ? `https://drive.google.com/uc?export=view&id=${idMatch[1]}`
      : /^[a-zA-Z0-9_-]{10,}$/.test(trimmed)
        ? `https://drive.google.com/uc?export=view&id=${trimmed}`
        : trimmed;

    onAddMedia({ url, kind: "image" });
    setDriveId("");
  };

  const activeTools = MATH_TOOL_GROUPS.find((group) => group.label === activeGroup)?.tools ?? [];

  return (
    <div className="math-inline-field" ref={rowRef}>
      <span className="math-inline-label">{label}</span>

      <div className="math-inline-row">
        <input
          type="text"
          className="math-inline-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
        <div className="math-inline-actions">
          <button
            type="button"
            className={isMathOpen ? "math-inline-icon active" : "math-inline-icon"}
            title="لوحة الرموز الرياضية"
            aria-label="لوحة الرموز الرياضية"
            onClick={() => {
              setIsMediaOpen(false);
              setIsMathOpen((previous) => !previous);
            }}
          >
            Σ
          </button>
          <button
            type="button"
            className={isMediaOpen ? "math-inline-icon active" : "math-inline-icon"}
            title="إدراج صورة أو رسم بياني"
            aria-label="إدراج صورة أو رسم بياني"
            onClick={() => {
              setIsMathOpen(false);
              setIsMediaOpen((previous) => !previous);
            }}
          >
            🖼
          </button>
        </div>
      </div>

      {value.trim() && <MathText content={value} className="option-preview" />}

      {media.length > 0 && (
        <div className="media-thumb-strip">
          {media.map((item, index) => (
            <div key={`${item.url}-${index}`} className="media-thumb">
              <img src={item.url} alt="وسيط مرفق" />
              <button type="button" onClick={() => onRemoveMedia(index)} aria-label="حذف الوسيط">✕</button>
            </div>
          ))}
        </div>
      )}

      {isMathOpen && (
        <div className="math-popover">
          <div className="math-popover-groups">
            {MATH_TOOL_GROUPS.map((group) => (
              <button
                key={group.label}
                type="button"
                className={group.label === activeGroup ? "math-toolbar-tab active" : "math-toolbar-tab"}
                onClick={() => setActiveGroup(group.label)}
              >
                {group.label}
              </button>
            ))}
          </div>
          <div className="math-toolbar-buttons">
            {activeTools.map((tool) => (
              <button key={tool.label} type="button" className="math-tool-button" onClick={() => handleToolClick(tool)}>
                {tool.label}
              </button>
            ))}
          </div>
          <div className="math-field-shell" ref={mathContainerRef} />
          <button type="button" className="logout-button" onClick={() => window.mathVirtualKeyboard?.hide()}>
            إخفاء لوحة المفاتيح
          </button>
        </div>
      )}

      {isMediaOpen && (
        <div className="media-drawer">
          <div className="drive-quick-link">
            <label className="field">
              <span>معرّف ملف Google Drive أو رابط مباشر</span>
              <input value={driveId} onChange={(event) => setDriveId(event.target.value)} dir="ltr" placeholder="Drive File ID أو رابط" />
            </label>
            <button type="button" className="logout-button" onClick={handleInsertDriveLink}>إدراج</button>
          </div>
          <ImageUploader onUploaded={(url) => void handleMediaFromUploader(url, "image")} />
          <GraphGenerator onInsert={(url) => void handleMediaFromUploader(url, "graph")} />
          {isUploading && <p className="quiz-hint">جارٍ الرفع إلى Drive...</p>}
        </div>
      )}
    </div>
  );
};

export default MathInlineField;
