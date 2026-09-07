"use client";

import { useEffect, useRef } from "react";

interface MathTextProps {
  content: string;
  className?: string;
}

interface MathSpanInlineProps {
  latex: string;
}

const IMAGE_REGEX = /!\[[^\]]*\]\(([^)]+)\)/;
// مقاطع رياضية محاطة بـ $...$ فقط تُرسل إلى محرّك MathLive؛ كل ما عداها نص عربي عادي لا يُمس إطلاقًا.
const MATH_SEGMENT_REGEX = /\$([^$]+)\$/g;
// نمط الحساب القديم (قبل اعتماد $...$): نص لا يحوي أي $ لكنه يحوي أوامر LaTeX (\frac، \sin...)
// يُعامل كاملاً كمعادلة واحدة للحفاظ على عرض الأسئلة القديمة المخزّنة قبل هذا التحديث بلا كسر.
const LEGACY_LATEX_COMMAND_REGEX = /\\[a-zA-Z]/;

// عنصر math-span حقيقي واحد لكل مقطع رياضي فقط — لا يلمس النص العربي المحيط، فيبقى بتشكيله واتجاهه
// الطبيعيّين (كانت المشكلة السابقة أن النص كاملاً يُمرَّر لمحرّك LaTeX فيتحوّل كل حرف عربي إلى رمز
// رياضي منفصل بتباعد معادلات لا تباعد كلمات، فيظهر النص متلاصقًا وغير مفهوم).
const MathSpanInline = ({ latex }: MathSpanInlineProps) => {
  const containerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const setup = async () => {
      await import("mathlive");
      if (isCancelled || !containerRef.current) return;

      const element = document.createElement("math-span");
      element.textContent = latex || " ";

      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(element);
    };

    void setup();

    return () => {
      isCancelled = true;
    };
  }, [latex]);

  return <span ref={containerRef} className="math-text-inline-math" />;
};

const splitSegments = (text: string): { type: "text" | "math"; value: string }[] => {
  if (!text) return [{ type: "text", value: "" }];

  const hasDollarSegments = MATH_SEGMENT_REGEX.test(text);
  MATH_SEGMENT_REGEX.lastIndex = 0;

  if (!hasDollarSegments) {
    // توافق مع الأسئلة المخزّنة قبل اعتماد $...$: إن كان النص كاملاً أوامر LaTeX بلا أي نص عربي
    // ظاهر بينها، عاملها كمعادلة واحدة كما كانت تُعرض سابقًا؛ غير ذلك اعرضها كنص عادي فقط.
    return LEGACY_LATEX_COMMAND_REGEX.test(text) ? [{ type: "math", value: text }] : [{ type: "text", value: text }];
  }

  const segments: { type: "text" | "math"; value: string }[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(MATH_SEGMENT_REGEX)) {
    const index = match.index ?? 0;
    if (index > lastIndex) segments.push({ type: "text", value: text.slice(lastIndex, index) });
    segments.push({ type: "math", value: match[1] });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ type: "text", value: text.slice(lastIndex) });

  return segments;
};

// يعرض نص الأسئلة/الخيارات كمزيج طبيعي من نص عربي عادي ومقاطع رياضية بينها (محاطة بـ $...$)، بدل
// إرسال النص كاملاً إلى محرّك LaTeX الذي يكسر تشكيل الحروف العربية وتباعد الكلمات.
const MathText = ({ content, className }: MathTextProps) => {
  const imageMatch = content.match(IMAGE_REGEX);
  const imageUrl = imageMatch?.[1];
  const textContent = (imageUrl ? content.replace(imageMatch[0], "") : content).trim();
  const segments = splitSegments(textContent);

  return (
    <span className={className}>
            <span className="math-text-render">
        {segments.map((segment, index) =>
          segment.type === "math" ? (
            <MathSpanInline key={index} latex={segment.value} />
          ) : (
            // dir="rtl" + style preserve Arabic word-spacing and prevent fused glyph runs
            <span
              key={index}
              dir="rtl"
              lang="ar"
              style={{
                direction: "rtl",
                whiteSpace: "pre-wrap",
                wordSpacing: "0.1rem",
                unicodeBidi: "plaintext",
              }}
            >
              {segment.value}
            </span>
          ),
        )}
      </span>
      {imageUrl && <img src={imageUrl} alt="" className="math-text-image" />}
    </span>
  );
};

export default MathText;

