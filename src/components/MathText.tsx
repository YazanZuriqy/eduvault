"use client";

import { useEffect, useRef } from "react";

interface MathTextProps {
  content: string;
  className?: string;
}

const IMAGE_REGEX = /!\[[^\]]*\]\(([^)]+)\)/;

// يعرض نص الأسئلة/الخيارات كمعادلة مصاغة رياضيًا (وليس LaTeX خامًا)، مع فصل صورة الشرح إن وُجدت.
// نفس درس MathLive السابق: تُستورد ديناميكيًا داخل المتصفح فقط لتفادي كسر التصدير الثابت.
const MathText = ({ content, className }: MathTextProps) => {
  const containerRef = useRef<HTMLSpanElement | null>(null);

  const imageMatch = content.match(IMAGE_REGEX);
  const imageUrl = imageMatch?.[1];
  const mathContent = (imageUrl ? content.replace(imageMatch[0], "") : content).trim();

  useEffect(() => {
    let isCancelled = false;

    const setup = async () => {
      await import("mathlive");
      if (isCancelled || !containerRef.current) return;

      const element = document.createElement("math-span");
      element.textContent = mathContent || " ";

      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(element);
    };

    void setup();

    return () => {
      isCancelled = true;
    };
  }, [mathContent]);

  return (
    <span className={className}>
      <span ref={containerRef} className="math-text-render">
        {mathContent}
      </span>
      {imageUrl && <img src={imageUrl} alt="" className="math-text-image" />}
    </span>
  );
};

export default MathText;
