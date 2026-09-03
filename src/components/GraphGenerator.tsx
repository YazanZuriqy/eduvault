"use client";

import { useEffect, useRef, useState } from "react";
import type { MathfieldElement } from "mathlive";

interface GraphGeneratorProps {
  onInsert: (dataUrl: string) => void;
}

interface Piece {
  key: string;
  expression: string;
  domainMin: string;
  domainMax: string;
  minClosed: boolean;
  maxClosed: boolean;
}

const CANVAS_SIZE = 440;
const PADDING = 24;
const PIECE_COLORS = ["#fa765d", "#78c8d1", "#8ea2ff", "#d4ef58", "#c084fc", "#f472b6"];

const createPiece = (): Piece => ({
  key: crypto.randomUUID(),
  expression: "x",
  domainMin: "",
  domainMax: "",
  minClosed: true,
  maxClosed: true,
});

// مُقيّم تعابير رياضية آمن (بدون eval/Function) يدعم + - * / ^ ( ) والفاصلة للدوال متعددة الوسائط،
// الضرب الضمني (2x، 3sin(x))، و^ باتجاه يميني صحيح رياضيًا (2^3^2 = 2^(3^2))، إلى جانب مجموعة واسعة
// من الدوال والثوابت. يُحلّل التعبير إلى tokens ثم شجرة recursive-descent كلاسيكية.
type Token = { type: "num"; value: number } | { type: "op"; value: string } | { type: "id"; value: string };

const tokenize = (expression: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      let numberText = "";
      while (index < expression.length && /[0-9.]/.test(expression[index])) {
        numberText += expression[index];
        index += 1;
      }
      tokens.push({ type: "num", value: Number(numberText) });
      continue;
    }

    if (/[a-zA-Z]/.test(char)) {
      let identifier = "";
      while (index < expression.length && /[a-zA-Z]/.test(expression[index])) {
        identifier += expression[index];
        index += 1;
      }
      tokens.push({ type: "id", value: identifier });
      continue;
    }

    if ("+-*/^(),".includes(char)) {
      tokens.push({ type: "op", value: char });
      index += 1;
      continue;
    }

    throw new Error(`رمز غير مدعوم: ${char}`);
  }

  return tokens;
};

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  sign: Math.sign,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  exp: Math.exp,
  ln: Math.log,
  log: (...args) => (args.length > 1 ? Math.log(args[1]) / Math.log(args[0]) : Math.log10(args[0])),
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
  atan2: (...args) => Math.atan2(args[0], args[1]),
  fact: (...args) => {
    const n = Math.round(args[0]);
    if (!Number.isFinite(n) || n < 0 || n > 170) return NaN;
    let result = 1;
    for (let i = 2; i <= n; i += 1) result *= i;
    return result;
  },
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

class Parser {
  private tokens: Token[];
  private position = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private consume(): Token {
    const token = this.tokens[this.position];
    this.position += 1;
    return token;
  }

  parseExpression(x: number): number {
    let value = this.parseTerm(x);
    while (this.peek()?.type === "op" && (this.peek()?.value === "+" || this.peek()?.value === "-")) {
      const operator = this.consume() as { type: "op"; value: string };
      const right = this.parseTerm(x);
      value = operator.value === "+" ? value + right : value - right;
    }
    return value;
  }

  private parseTerm(x: number): number {
    let value = this.parseFactor(x);
    while (true) {
      const next = this.peek();
      if (next?.type === "op" && (next.value === "*" || next.value === "/")) {
        const operator = this.consume() as { type: "op"; value: string };
        const right = this.parseFactor(x);
        value = operator.value === "*" ? value * right : value / right;
        continue;
      }
      // ضرب ضمني: 2x، 3sin(x)، x(x+1) — رمز أو قوس مفتوح يلي عاملًا مباشرة بلا عملية صريحة بينهما.
      if (next && (next.type === "id" || (next.type === "op" && next.value === "("))) {
        value *= this.parseFactor(x);
        continue;
      }
      break;
    }
    return value;
  }

  // اتجاه يميني صحيح رياضيًا: 2^3^2 = 2^(3^2) = 512 وليس (2^3)^2 = 64.
  private parseFactor(x: number): number {
    const base = this.parseUnary(x);
    if (this.peek()?.type === "op" && this.peek()?.value === "^") {
      this.consume();
      const exponent = this.parseFactor(x);
      return base ** exponent;
    }
    return base;
  }

  private parseUnary(x: number): number {
    if (this.peek()?.type === "op" && this.peek()?.value === "-") {
      this.consume();
      return -this.parseUnary(x);
    }
    return this.parsePrimary(x);
  }

  private parsePrimary(x: number): number {
    const token = this.peek();
    if (!token) throw new Error("تعبير غير مكتمل.");

    if (token.type === "num") {
      this.consume();
      return token.value;
    }

    if (token.type === "op" && token.value === "(") {
      this.consume();
      const value = this.parseExpression(x);
      if (this.peek()?.type === "op" && this.peek()?.value === ")") this.consume();
      return value;
    }

    if (token.type === "id") {
      this.consume();
      const name = token.value;

      if (this.peek()?.type === "op" && this.peek()?.value === "(") {
        this.consume();
        const args = [this.parseExpression(x)];
        while (this.peek()?.type === "op" && this.peek()?.value === ",") {
          this.consume();
          args.push(this.parseExpression(x));
        }
        if (this.peek()?.type === "op" && this.peek()?.value === ")") this.consume();
        const fn = FUNCTIONS[name];
        if (!fn) throw new Error(`دالة غير معروفة: ${name}`);
        return fn(...args);
      }

      if (name === "x") return x;
      if (name in CONSTANTS) return CONSTANTS[name];
      throw new Error(`رمز غير معروف: ${name}`);
    }

    throw new Error("تعبير غير صالح.");
  }
}

const evaluateExpression = (expression: string, x: number): number => {
  const parser = new Parser(tokenize(expression));
  return parser.parseExpression(x);
};

// يحوّل صياغة LaTeX الشائعة (القادمة من لوحة المفاتيح المتقدمة) إلى صياغة التعبير القابلة للتقييم
// أعلاه؛ تحويل عملي يغطي الحالات الشائعة (كسور، جذور، أسس، لوغاريتمات بقاعدة، دوال) وليس تحليل
// LaTeX كاملاً — يكفي عمليًا لأي اقتران رياضي عادي يُكتب عبر اللوحة.
const latexToExpression = (latex: string): string => {
  let expression = latex.replace(/\\left|\\right/g, "");

  const fracPattern = /\\frac\{([^{}]*)\}\{([^{}]*)\}/;
  while (fracPattern.test(expression)) {
    expression = expression.replace(fracPattern, "(($1)/($2))");
  }

  const nthRootPattern = /\\sqrt\[([^[\]]*)\]\{([^{}]*)\}/;
  while (nthRootPattern.test(expression)) {
    expression = expression.replace(nthRootPattern, "(($2)^(1/($1)))");
  }
  const sqrtPattern = /\\sqrt\{([^{}]*)\}/;
  while (sqrtPattern.test(expression)) {
    expression = expression.replace(sqrtPattern, "sqrt($1)");
  }

  expression = expression.replace(/\\log_\{([^{}]*)\}/g, "log($1,");
  expression = expression.replace(/\\log_(\w)/g, "log($1,");

  ["sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh", "ln", "log", "exp"].forEach((fn) => {
    expression = expression.replaceAll(`\\${fn}`, fn);
  });

  expression = expression.replaceAll("\\pi", "pi").replaceAll("\\cdot", "*").replaceAll("\\times", "*").replaceAll("\\div", "/");
  expression = expression.replace(/\^\{([^{}]*)\}/g, "^($1)");
  expression = expression.replaceAll("{", "(").replaceAll("}", ")");
  expression = expression.replace(/\\[a-zA-Z]+/g, "");

  return expression.replace(/\s+/g, "");
};

const GRAPH_TOKEN_GROUPS: { label: string; tokens: { label: string; token: string }[] }[] = [
  {
    label: "أساسي",
    tokens: [
      { label: "+", token: "+" },
      { label: "−", token: "-" },
      { label: "×", token: "*" },
      { label: "÷", token: "/" },
      { label: "^", token: "^" },
      { label: "(", token: "(" },
      { label: ")", token: ")" },
      { label: "x", token: "x" },
      { label: ",", token: "," },
    ],
  },
  {
    label: "مثلثات",
    tokens: [
      { label: "sin", token: "sin(" },
      { label: "cos", token: "cos(" },
      { label: "tan", token: "tan(" },
      { label: "sin⁻¹", token: "asin(" },
      { label: "cos⁻¹", token: "acos(" },
      { label: "tan⁻¹", token: "atan(" },
    ],
  },
  {
    label: "زائدية",
    tokens: [
      { label: "sinh", token: "sinh(" },
      { label: "cosh", token: "cosh(" },
      { label: "tanh", token: "tanh(" },
    ],
  },
  {
    label: "جذور وأسس",
    tokens: [
      { label: "√", token: "sqrt(" },
      { label: "∛", token: "cbrt(" },
      { label: "eˣ", token: "exp(" },
      { label: "|x|", token: "abs(" },
    ],
  },
  {
    label: "لوغاريتمات",
    tokens: [
      { label: "log", token: "log(" },
      { label: "ln", token: "ln(" },
      { label: "logₐ(a,x)", token: "log(" },
    ],
  },
  {
    label: "أخرى",
    tokens: [
      { label: "π", token: "pi" },
      { label: "e", token: "e" },
      { label: "min", token: "min(" },
      { label: "max", token: "max(" },
      { label: "n!", token: "fact(" },
      { label: "⌊x⌋", token: "floor(" },
      { label: "⌈x⌉", token: "ceil(" },
      { label: "round", token: "round(" },
    ],
  },
];

const GraphGenerator = ({ onInsert }: GraphGeneratorProps) => {
  const [pieces, setPieces] = useState<Piece[]>([createPiece()]);
  const [xMin, setXMin] = useState("-10");
  const [xMax, setXMax] = useState("10");
  const [yMin, setYMin] = useState("-10");
  const [yMax, setYMax] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [activePieceKey, setActivePieceKey] = useState<string | null>(null);
  const [activeTokenGroup, setActiveTokenGroup] = useState(GRAPH_TOKEN_GROUPS[0].label);
  const [isAdvancedKeyboardOpen, setIsAdvancedKeyboardOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mathContainerRef = useRef<HTMLDivElement | null>(null);
  const mathFieldRef = useRef<MathfieldElement | null>(null);

  const updatePiece = (key: string, patch: Partial<Piece>) => {
    setPieces((prev) => prev.map((piece) => (piece.key === key ? { ...piece, ...patch } : piece)));
  };

  const insertGraphToken = (token: string) => {
    const key = activePieceKey ?? pieces[0]?.key;
    if (!key) return;
    const current = pieces.find((piece) => piece.key === key);
    if (current) updatePiece(key, { expression: `${current.expression}${token}` });
  };

  // نفس نمط MathInlineField: استيراد MathLive ديناميكيًا داخل المتصفح فقط عند فتح اللوحة، حتى لا
  // يكسر تصدير Next.js الثابت، ويُوقف/يُزال الحقل عند الإغلاق.
  useEffect(() => {
    if (!isAdvancedKeyboardOpen) return;
    let isCancelled = false;

    const setup = async () => {
      const { MathfieldElement: MathfieldElementCtor } = await import("mathlive");
      if (isCancelled || !mathContainerRef.current) return;

      const field = new MathfieldElementCtor();
      field.setAttribute("math-virtual-keyboard-policy", "manual");
      field.style.width = "100%";
      field.style.direction = "ltr";
      field.style.minHeight = "48px";

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
  }, [isAdvancedKeyboardOpen]);

  const handleInsertFromKeyboard = () => {
    const latex = mathFieldRef.current?.value;
    if (!latex) return;
    insertGraphToken(latexToExpression(latex));
    mathFieldRef.current!.value = "";
  };

  const toPixel = (value: number, min: number, max: number, size: number, invert = false) => {
    const ratio = (value - min) / (max - min);
    return invert ? size - PADDING - ratio * (size - 2 * PADDING) : PADDING + ratio * (size - 2 * PADDING);
  };


  const handleGenerate = () => {
    setError(null);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const parsedXMin = Number(xMin);
    const parsedXMax = Number(xMax);
    const parsedYMin = Number(yMin);
    const parsedYMax = Number(yMax);

    if ([parsedXMin, parsedXMax, parsedYMin, parsedYMax].some((value) => Number.isNaN(value)) || parsedXMin >= parsedXMax || parsedYMin >= parsedYMax) {
      setError("يرجى إدخال حدود صحيحة للمحاور (الحد الأدنى أقل من الأعلى).");
      return;
    }

    context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // خطوط الشبكة والمحاور
    context.strokeStyle = "#e2e8dc";
    context.lineWidth = 1;
    const gridStepX = (parsedXMax - parsedXMin) / 10;
    const gridStepY = (parsedYMax - parsedYMin) / 10;
    const zeroAxisX = toPixel(0, parsedXMin, parsedXMax, CANVAS_SIZE);
    const zeroAxisY = toPixel(0, parsedYMin, parsedYMax, CANVAS_SIZE, true);

    context.fillStyle = "#557069";
    context.font = "10px sans-serif";

    for (let i = 0; i <= 10; i += 1) {
      const xValue = parsedXMin + i * gridStepX;
      const pixelX = toPixel(xValue, parsedXMin, parsedXMax, CANVAS_SIZE);
      context.beginPath();
      context.moveTo(pixelX, PADDING);
      context.lineTo(pixelX, CANVAS_SIZE - PADDING);
      context.stroke();
      if (parsedYMin <= 0 && parsedYMax >= 0) context.fillText(xValue.toFixed(1), pixelX - 8, zeroAxisY - 5);

      const yValue = parsedYMin + i * gridStepY;
      const pixelY = toPixel(yValue, parsedYMin, parsedYMax, CANVAS_SIZE, true);
      context.beginPath();
      context.moveTo(PADDING, pixelY);
      context.lineTo(CANVAS_SIZE - PADDING, pixelY);
      context.stroke();
      if (parsedXMin <= 0 && parsedXMax >= 0) context.fillText(yValue.toFixed(1), zeroAxisX + 5, pixelY + 3);
    }

    context.strokeStyle = "#10231f";
    context.lineWidth = 1.5;
    if (parsedXMin <= 0 && parsedXMax >= 0) {
      const pixelX = toPixel(0, parsedXMin, parsedXMax, CANVAS_SIZE);
      context.beginPath();
      context.moveTo(pixelX, PADDING);
      context.lineTo(pixelX, CANVAS_SIZE - PADDING);
      context.stroke();
    }
    if (parsedYMin <= 0 && parsedYMax >= 0) {
      const pixelY = toPixel(0, parsedYMin, parsedYMax, CANVAS_SIZE, true);
      context.beginPath();
      context.moveTo(PADDING, pixelY);
      context.lineTo(CANVAS_SIZE - PADDING, pixelY);
      context.stroke();
    }

    try {
      pieces.forEach((piece, pieceIndex) => {
        const pieceColor = PIECE_COLORS[pieceIndex % PIECE_COLORS.length];
        context.strokeStyle = pieceColor;
        context.lineWidth = 2.5;

        const domainMin = piece.domainMin.trim() ? Number(piece.domainMin) : parsedXMin;
        const domainMax = piece.domainMax.trim() ? Number(piece.domainMax) : parsedXMax;
        if (Number.isNaN(domainMin) || Number.isNaN(domainMax) || domainMin >= domainMax) return;

        const sampleCount = 400;
        let isDrawing = false;

        for (let sample = 0; sample <= sampleCount; sample += 1) {
          const x = domainMin + (sample / sampleCount) * (domainMax - domainMin);
          const y = evaluateExpression(piece.expression, x);

          if (!Number.isFinite(y) || y < parsedYMin - (parsedYMax - parsedYMin) || y > parsedYMax + (parsedYMax - parsedYMin)) {
            isDrawing = false;
            continue;
          }

          const pixelX = toPixel(x, parsedXMin, parsedXMax, CANVAS_SIZE);
          const pixelY = toPixel(y, parsedYMin, parsedYMax, CANVAS_SIZE, true);

          if (!isDrawing) {
            context.beginPath();
            context.moveTo(pixelX, pixelY);
            isDrawing = true;
          } else {
            context.lineTo(pixelX, pixelY);
          }
        }
        context.stroke();

        // دوائر النهايات (مفرغة للمفتوحة، ممتلئة للمغلقة)
        [
          { x: domainMin, closed: piece.minClosed },
          { x: domainMax, closed: piece.maxClosed },
        ].forEach(({ x, closed }) => {
          const y = evaluateExpression(piece.expression, x);
          if (!Number.isFinite(y)) return;

          const pixelX = toPixel(x, parsedXMin, parsedXMax, CANVAS_SIZE);
          const pixelY = toPixel(y, parsedYMin, parsedYMax, CANVAS_SIZE, true);

          context.beginPath();
          context.arc(pixelX, pixelY, 4, 0, Math.PI * 2);
          context.fillStyle = closed ? pieceColor : "#ffffff";
          context.fill();
          context.stroke();
        });
      });
    } catch {
      setError("تعذر تفسير أحد التعابير الرياضية. تحقق من الصياغة.");
      return;
    }

    const dataUrl = canvas.toDataURL("image/png");
    onInsert(dataUrl);
  };

  return (
    <div className="graph-generator">
      <p className="quiz-hint">
        أنشئ رسمًا بيانيًا لاقتران واحد أو أكثر (كل حالة بلونها الخاص) وأدرجه كصورة في السؤال أو أحد
        الخيارات. الضرب الضمني مدعوم (اكتب 2x بدل 2*x)، وكذلك الدوال متعددة الوسائط (مثل max(x,2))
        والأسس المتتابعة بترتيبها الرياضي الصحيح. استخدم أزرار الرموز المصنّفة أدناه أو لوحة المفاتيح
        المتقدمة لإدراج أي صيغة رياضية دون كتابتها يدويًا حرفًا بحرف.
      </p>

      <div className="graph-bounds">
        <label className="field">
          <span>x من</span>
          <input type="text" value={xMin} onChange={(event) => setXMin(event.target.value)} dir="ltr" />
        </label>
        <label className="field">
          <span>x إلى</span>
          <input type="text" value={xMax} onChange={(event) => setXMax(event.target.value)} dir="ltr" />
        </label>
        <label className="field">
          <span>y من</span>
          <input type="text" value={yMin} onChange={(event) => setYMin(event.target.value)} dir="ltr" />
        </label>
        <label className="field">
          <span>y إلى</span>
          <input type="text" value={yMax} onChange={(event) => setYMax(event.target.value)} dir="ltr" />
        </label>
      </div>

      <div className="math-popover-groups" aria-label="فئات رموز الاقتران">
        {GRAPH_TOKEN_GROUPS.map((group) => (
          <button
            key={group.label}
            type="button"
            className={activeTokenGroup === group.label ? "math-toolbar-tab active" : "math-toolbar-tab"}
            onClick={() => setActiveTokenGroup(group.label)}
          >
            {group.label}
          </button>
        ))}
      </div>
      <div className="graph-symbols" aria-label="رموز الاقتران">
        {GRAPH_TOKEN_GROUPS.find((group) => group.label === activeTokenGroup)?.tokens.map(({ label, token }) => (
          <button type="button" key={label} onClick={() => insertGraphToken(token)}>{label}</button>
        ))}
        <button type="button" className={isAdvancedKeyboardOpen ? "graph-keyboard-toggle active" : "graph-keyboard-toggle"} onClick={() => setIsAdvancedKeyboardOpen((previous) => !previous)}>
          ⌨ لوحة المفاتيح المتقدمة
        </button>
      </div>

      {isAdvancedKeyboardOpen && (
        <div className="math-popover graph-advanced-keyboard">
          <div className="math-field-shell" ref={mathContainerRef} />
          <div className="inline-editor-actions">
            <button type="button" className="primary-button" onClick={handleInsertFromKeyboard}>
              إدراج في التعبير النشط
            </button>
          </div>
          <p className="quiz-hint">اكتب الصيغة بصريًا هنا (كسور، جذور، أسس...)، ثم اضغط «إدراج» لتحويلها وإضافتها للتعبير النشط.</p>
        </div>
      )}

      {pieces.map((piece, index) => (
        <div key={piece.key} className="graph-piece">
          <label className="field">
            <span>
              <span className="graph-piece-swatch" style={{ background: PIECE_COLORS[index % PIECE_COLORS.length] }} aria-hidden="true" />
              {pieces.length > 1 ? `تعبير الحالة ${index + 1}` : "تعبير الدالة f(x)"}
            </span>
            <input
              type="text"
              value={piece.expression}
              onChange={(event) => updatePiece(piece.key, { expression: event.target.value })}
              onFocus={() => setActivePieceKey(piece.key)}
              placeholder="مثال: 2x^2 + sin(x) - 1"
              dir="ltr"
            />
          </label>

          <div className="graph-domain-row">
            <label className="field">
              <span>من (اختياري)</span>
              <input
                type="text"
                value={piece.domainMin}
                onChange={(event) => updatePiece(piece.key, { domainMin: event.target.value })}
                dir="ltr"
              />
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={piece.minClosed}
                onChange={(event) => updatePiece(piece.key, { minClosed: event.target.checked })}
              />
              <span>نقطة مغلقة</span>
            </label>

            <label className="field">
              <span>إلى (اختياري)</span>
              <input
                type="text"
                value={piece.domainMax}
                onChange={(event) => updatePiece(piece.key, { domainMax: event.target.value })}
                dir="ltr"
              />
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={piece.maxClosed}
                onChange={(event) => updatePiece(piece.key, { maxClosed: event.target.checked })}
              />
              <span>نقطة مغلقة</span>
            </label>
          </div>

          {pieces.length > 1 && (
            <button
              type="button"
              className="logout-button"
              onClick={() => setPieces((prev) => prev.filter((entry) => entry.key !== piece.key))}
            >
              حذف هذه الحالة
            </button>
          )}
        </div>
      ))}

      <button type="button" className="logout-button" onClick={() => setPieces((prev) => [...prev, createPiece()])}>
        + إضافة حالة أخرى (دالة متعددة التعريف، أو اقتران مستقل آخر يُرسم بلون مختلف فوق نفس المحاور)
      </button>

      {error && <p className="auth-error">{error}</p>}

      <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="graph-canvas" />

      <button type="button" className="primary-button" onClick={handleGenerate}>
        رسم وإدراج الرسم البياني
      </button>
    </div>
  );
};

export default GraphGenerator;
