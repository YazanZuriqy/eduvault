"use client";

import { useRef, useState } from "react";

interface GraphGeneratorProps {
  onInsert: (markdown: string) => void;
}

interface Piece {
  key: string;
  expression: string;
  domainMin: string;
  domainMax: string;
  minClosed: boolean;
  maxClosed: boolean;
}

const CANVAS_SIZE = 400;
const PADDING = 24;

const createPiece = (): Piece => ({
  key: crypto.randomUUID(),
  expression: "x",
  domainMin: "",
  domainMax: "",
  minClosed: true,
  maxClosed: true,
});

// مُقيّم تعابير رياضية آمن (بدون eval/Function) يدعم + - * / ^ ( ) والدوال الشائعة والثوابت.
// يُحلّل التعبير إلى tokens ثم شجرة recursive-descent كلاسيكية (أساسيات مترجم حاسبة).
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

    if ("+-*/^()".includes(char)) {
      tokens.push({ type: "op", value: char });
      index += 1;
      continue;
    }

    throw new Error(`رمز غير مدعوم: ${char}`);
  }

  return tokens;
};

const FUNCTIONS: Record<string, (value: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  log: Math.log10,
  ln: Math.log,
  exp: Math.exp,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

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
    while (this.peek()?.type === "op" && (this.peek()?.value === "*" || this.peek()?.value === "/")) {
      const operator = this.consume() as { type: "op"; value: string };
      const right = this.parseFactor(x);
      value = operator.value === "*" ? value * right : value / right;
    }
    return value;
  }

  private parseFactor(x: number): number {
    let value = this.parseUnary(x);
    while (this.peek()?.type === "op" && this.peek()?.value === "^") {
      this.consume();
      const right = this.parseUnary(x);
      value = value ** right;
    }
    return value;
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
        const argument = this.parseExpression(x);
        if (this.peek()?.type === "op" && this.peek()?.value === ")") this.consume();
        const fn = FUNCTIONS[name];
        if (!fn) throw new Error(`دالة غير معروفة: ${name}`);
        return fn(argument);
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

const GraphGenerator = ({ onInsert }: GraphGeneratorProps) => {
  const [pieces, setPieces] = useState<Piece[]>([createPiece()]);
  const [xMin, setXMin] = useState("-10");
  const [xMax, setXMax] = useState("10");
  const [yMin, setYMin] = useState("-10");
  const [yMax, setYMax] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const updatePiece = (key: string, patch: Partial<Piece>) => {
    setPieces((prev) => prev.map((piece) => (piece.key === key ? { ...piece, ...patch } : piece)));
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

    context.strokeStyle = "#fa765d";
    context.lineWidth = 2.5;

    try {
      pieces.forEach((piece) => {
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
          context.fillStyle = closed ? "#fa765d" : "#ffffff";
          context.fill();
          context.stroke();
        });
      });
    } catch {
      setError("تعذر تفسير أحد التعابير الرياضية. تحقق من الصياغة.");
      return;
    }

    const dataUrl = canvas.toDataURL("image/png");
    onInsert(`![quiz-graph](${dataUrl})`);
  };

  return (
    <div className="graph-generator">
      <p className="quiz-hint">
        أنشئ رسمًا بيانيًا لدالة (أو دالة متعددة التعريف) وأدرجه كصورة في السؤال أو أحد الخيارات. التعابير
        المدعومة: + - * / ^ ( )‏، والدوال sin cos tan sqrt abs log ln exp، والثوابت pi e، والمتغيّر x.
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

      {pieces.map((piece, index) => (
        <div key={piece.key} className="graph-piece">
          <label className="field">
            <span>{pieces.length > 1 ? `تعبير الحالة ${index + 1}` : "تعبير الدالة f(x)"}</span>
            <input
              type="text"
              value={piece.expression}
              onChange={(event) => updatePiece(piece.key, { expression: event.target.value })}
              placeholder="مثال: x^2 + 2*x - 1"
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
        + إضافة حالة أخرى (دالة متعددة التعريف)
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
