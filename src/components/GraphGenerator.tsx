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
const PADDING = 36;          // Wider padding so axis labels never clip
const PIECE_COLORS = ["#fa765d", "#78c8d1", "#8ea2ff", "#d4ef58", "#c084fc", "#f472b6"];

// ─── Grid tick helpers ────────────────────────────────────────────────────────

/**
 * دالة ذكية لحساب خطوط الشبكة بالآحاد الفردية والمتسلسلة دائماً
 * تم رفع الحد إلى 40 لضمان عدم حدوث ضغط للأرقام (مثل 2 4 6) في الأبعاد المشهورة
 */
const MIN_TICKS = 4;
const MAX_TICKS = 40; // تم التعديل هنا لقفل الشبكة على العد بالآحاد 1 2 3

const computeTickStep = (min: number, max: number): number => {
  const span = max - min;
  let step = 1;
  while (Math.floor(span / step) > MAX_TICKS && step < 10) {
    step += 1;
  }
  while (Math.floor(span / step) < MIN_TICKS && step > 1) {
    step -= 1;
  }
  return step;
};

const computeTicks = (min: number, max: number, step: number): number[] => {
  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max + 1e-9; v += step) {
    ticks.push(Math.round(v * 1e9) / 1e9);
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
      if (next && (next.type === "id" || (next.type === "op" && next.value === "("))) {
        value *= this.parseFactor(x);
        continue;
      }
      break;
    }
    return value;
  }

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
