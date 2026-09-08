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

const CANVAS_SIZE = 480;
const PADDING = 36;          // wider padding so axis labels never clip
const PIECE_COLORS = ["#fa765d", "#78c8d1", "#8ea2ff", "#d4ef58", "#c084fc", "#f472b6"];

// ─── Grid tick helpers ────────────────────────────────────────────────────────

/**
 * Returns the single-unit integer step that produces between MIN_TICKS and
 * MAX_TICKS grid lines for a given axis range.  Steps are ALWAYS whole
 * integers ≥ 1 — multi-unit compression (2,4,6,8 style) is never used.
 *
 * Algorithm:
 *   1. Start at step = 1.
 *   2. While the resulting tick count exceeds MAX_TICKS, increment step by 1.
 *   3. Cap at a maximum step of 10 so the grid never goes completely blank.
 */
const MIN_TICKS = 4;
const MAX_TICKS = 40;

const computeTickStep = (min: number, max: number): number => {
  const span = max - min;
  let step = 1;
  while (Math.floor(span / step) > MAX_TICKS && step < 10) {
    step += 1;
  }
  // Ensure we always have at least MIN_TICKS lines
  while (Math.floor(span / step) < MIN_TICKS && step > 1) {
    step -= 1;
  }
  return step;
};

/**
 * Generates every integer tick value in [min, max] that is a multiple of step.
 * e.g. computeTicks(-10, 10, 1) → [-10,-9,-8,…,10]
 *      computeTicks(-5,  5, 2) → [-4,-2,0,2,4]
 */
const computeTicks = (min: number, max: number, step: number): number[] => {
  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max + 1e-9; v += step) {
    ticks.push(Math.round(v * 1e9) / 1e9); // eliminate floating-point drift
  }
  return ticks;
};

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

    if (
      [parsedXMin, parsedXMax, parsedYMin, parsedYMax].some((v) => Number.isNaN(v)) ||
      parsedXMin >= parsedXMax ||
      parsedYMin >= parsedYMax
    ) {
      setError("يرجى إدخال حدود صحيحة للمحاور (الحد الأدنى أقل من الأعلى).");
      return;
    }

    // ── Canvas reset ──
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.beginPath();
    context.restore();

    // Crisp white background
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Plot area boundaries in pixel space
    const plotLeft   = PADDING;
    const plotRight  = CANVAS_SIZE - PADDING;
    const plotTop    = PADDING;
    const plotBottom = CANVAS_SIZE - PADDING;

    // ── Compute single-unit integer tick steps ──
    const xStep   = computeTickStep(parsedXMin, parsedXMax);
    const yStep   = computeTickStep(parsedYMin, parsedYMax);
    const xTicks  = computeTicks(parsedXMin, parsedXMax, xStep);
    const yTicks  = computeTicks(parsedYMin, parsedYMax, yStep);

    // Pixel positions of the origin axes (clamped to plot area if 0 is out of range)
    const zeroPixelX = toPixel(0, parsedXMin, parsedXMax, CANVAS_SIZE);
    const zeroPixelY = toPixel(0, parsedYMin, parsedYMax, CANVAS_SIZE, true);
    const hasXAxis   = parsedYMin <= 0 && parsedYMax >= 0;
    const hasYAxis   = parsedXMin <= 0 && parsedXMax >= 0;

    // Label anchor: use axis if visible, otherwise use the plot edge
    const labelBaseY = hasXAxis ? zeroPixelY : plotBottom;
    const labelBaseX = hasYAxis ? zeroPixelX : plotLeft;

    // ── 1. Subtle background grid squares (à la graph paper) ──
    // One very light fill rect per cell to visually anchor each coordinate block.
    context.save();
    context.fillStyle = "rgba(226, 232, 220, 0.18)"; // slate-200/18
    for (let xi = 0; xi < xTicks.length - 1; xi += 1) {
      for (let yi = 0; yi < yTicks.length - 1; yi += 1) {
        // Alternate cells for a subtle graph-paper checker
        if ((xi + yi) % 2 === 0) {
          const cx0 = toPixel(xTicks[xi],     parsedXMin, parsedXMax, CANVAS_SIZE);
          const cx1 = toPixel(xTicks[xi + 1], parsedXMin, parsedXMax, CANVAS_SIZE);
          const cy0 = toPixel(yTicks[yi + 1], parsedYMin, parsedYMax, CANVAS_SIZE, true);
          const cy1 = toPixel(yTicks[yi],     parsedYMin, parsedYMax, CANVAS_SIZE, true);
          context.fillRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
        }
      }
    }
    context.restore();

    // ── 2. Vertical grid lines (one per integer x tick) ──
    context.save();
    context.strokeStyle = "rgba(203, 213, 202, 0.55)"; // slate-300/55
    context.lineWidth = 0.8;
    context.setLineDash([3, 3]);
    for (const xv of xTicks) {
      const px = toPixel(xv, parsedXMin, parsedXMax, CANVAS_SIZE);
      context.beginPath();
      context.moveTo(px, plotTop);
      context.lineTo(px, plotBottom);
      context.stroke();
    }
    context.restore();

    // ── 3. Horizontal grid lines (one per integer y tick) ──
    context.save();
    context.strokeStyle = "rgba(203, 213, 202, 0.55)";
    context.lineWidth = 0.8;
    context.setLineDash([3, 3]);
    for (const yv of yTicks) {
      const py = toPixel(yv, parsedYMin, parsedYMax, CANVAS_SIZE, true);
      context.beginPath();
      context.moveTo(plotLeft, py);
      context.lineTo(plotRight, py);
      context.stroke();
    }
    context.restore();

    // ── 4. Crosshair dots at every grid intersection ──
    context.save();
    context.fillStyle = "rgba(134, 160, 146, 0.35)"; // muted sage dot
    for (const xv of xTicks) {
      for (const yv of yTicks) {
        const px = toPixel(xv, parsedXMin, parsedXMax, CANVAS_SIZE);
        const py = toPixel(yv, parsedYMin, parsedYMax, CANVAS_SIZE, true);
        context.beginPath();
        context.arc(px, py, 1.4, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();

    // ── 5. X-axis tick labels ──
    context.save();
    context.fillStyle = "#557069";
    context.font = "bold 10px \"Space Grotesk\", ui-monospace, monospace";
    context.textAlign = "center";
    context.textBaseline = "top";
    for (const xv of xTicks) {
      if (xv === 0) continue; // origin labelled with Y-axis
      const px = toPixel(xv, parsedXMin, parsedXMax, CANVAS_SIZE);
      // Tick mark
      context.strokeStyle = "#8ea29a";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(px, labelBaseY - 3);
      context.lineTo(px, labelBaseY + 3);
      context.stroke();
      // Label (integers render without decimal point)
      const label = Number.isInteger(xv) ? String(xv) : xv.toFixed(1);
      context.fillText(label, px, labelBaseY + 5);
    }
    context.restore();

    // ── 6. Y-axis tick labels ──
    context.save();
    context.fillStyle = "#557069";
    context.font = "bold 10px \"Space Grotesk\", ui-monospace, monospace";
    context.textAlign = "right";
    context.textBaseline = "middle";
    for (const yv of yTicks) {
      if (yv === 0) continue;
      const py = toPixel(yv, parsedYMin, parsedYMax, CANVAS_SIZE, true);
      // Tick mark
      context.strokeStyle = "#8ea29a";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(labelBaseX - 3, py);
      context.lineTo(labelBaseX + 3, py);
      context.stroke();
      const label = Number.isInteger(yv) ? String(yv) : yv.toFixed(1);
      context.fillText(label, labelBaseX - 5, py);
    }
    context.restore();

    // Origin label
    if (hasXAxis && hasYAxis) {
      context.save();
      context.fillStyle = "#557069";
      context.font = "bold 10px \"Space Grotesk\", ui-monospace, monospace";
      context.textAlign = "right";
      context.textBaseline = "top";
      context.fillText("0", zeroPixelX - 4, zeroPixelY + 4);
      context.restore();
    }

    // ── 7. Principal axes (bold solid lines) ──
    context.save();
    context.strokeStyle = "#10231f";
    context.lineWidth = 1.8;
    context.setLineDash([]);

    // Y-axis (vertical)
    if (hasYAxis) {
      context.beginPath();
      context.moveTo(zeroPixelX, plotTop);
      context.lineTo(zeroPixelX, plotBottom);
      context.stroke();
      // Arrow tip
      context.beginPath();
      context.moveTo(zeroPixelX - 4, plotTop + 8);
      context.lineTo(zeroPixelX,     plotTop);
      context.lineTo(zeroPixelX + 4, plotTop + 8);
      context.stroke();
    }

    // X-axis (horizontal)
    if (hasXAxis) {
      context.beginPath();
      context.moveTo(plotLeft, zeroPixelY);
      context.lineTo(plotRight, zeroPixelY);
      context.stroke();
      // Arrow tip
      context.beginPath();
      context.moveTo(plotRight - 8, zeroPixelY - 4);
      context.lineTo(plotRight,     zeroPixelY);
      context.lineTo(plotRight - 8, zeroPixelY + 4);
      context.stroke();
    }

    // Axis labels (x, y)
    context.fillStyle = "#10231f";
    context.font = "italic bold 12px serif";
    if (hasXAxis) {
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillText("x", plotRight + 4, zeroPixelY);
    }
    if (hasYAxis) {
      context.textAlign = "center";
      context.textBaseline = "alphabetic";
      context.fillText("y", zeroPixelX, plotTop - 4);
    }
    context.restore();

    try {
      pieces.forEach((piece, pieceIndex) => {
        const pieceColor = PIECE_COLORS[pieceIndex % PIECE_COLORS.length];
        context.strokeStyle = pieceColor;
        context.lineWidth = 2.5;
        context.beginPath();
        
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

      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="graph-canvas"
        aria-label="لوحة الرسم البياني"
      />

      <button type="button" className="primary-button" onClick={handleGenerate}>
        رسم وإدراج الرسم البياني
      </button>
    </div>
  );
};

export default GraphGenerator;
