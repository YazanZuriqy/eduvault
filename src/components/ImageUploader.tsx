"use client";

import { type DragEvent, useRef, useState } from "react";

interface ImageUploaderProps {
  onUploaded: (url: string) => void;
}

const MAX_WIDTH = 1000;
const JPEG_QUALITY = 0.8;

// يضغط الصورة ويصغّرها إلى عرض أقصى محدد قبل تحويلها إلى data URL، لتبقى مستندات
// Firestore (حد 1MiB) بحجم آمن دون الحاجة لتخزين خارجي (لا توجد خدمة تخزين على خطة Spark).
const compressImageFile = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("تعذر قراءة الملف."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("تعذر تحميل الصورة."));
      image.onload = () => {
        const scale = Math.min(1, MAX_WIDTH / image.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("تعذر معالجة الصورة."));
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      image.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

const ImageUploader = ({ onUploaded }: ImageUploaderProps) => {
  const [imageUrl, setImageUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastCommittedRef = useRef("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const commit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== lastCommittedRef.current) {
      lastCommittedRef.current = trimmed;
      onUploaded(trimmed);
    }
  };

  const handleFile = async (file: File) => {
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("يرجى اختيار ملف صورة صالح.");
      return;
    }

    try {
      const dataUrl = await compressImageFile(file);
      lastCommittedRef.current = dataUrl;
      onUploaded(dataUrl);
    } catch {
      setError("تعذر معالجة الصورة. حاول مرة أخرى.");
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  return (
    <div className="image-uploader">
      <div
        className={isDragging ? "image-drop-zone dragging" : "image-drop-zone"}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <p>اسحب صورة هنا وأفلتها، أو اضغط لاختيار ملف من جهازك</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
        />
      </div>

      {error && <p className="auth-error">{error}</p>}

      <label className="field">
        <span>أو الصق رابط صورة مباشر</span>
        <input
          type="url"
          value={imageUrl}
          onChange={(event) => setImageUrl(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onPaste={(event) => {
            const pastedUrl = event.clipboardData.getData("text");
            if (pastedUrl) {
              setImageUrl(pastedUrl);
              commit(pastedUrl);
            }
          }}
          placeholder="https://i.ibb.co/..."
          dir="ltr"
        />
      </label>
      <p className="image-uploader-hint">
        يتم ضغط الصور المرفوعة تلقائيًا وتضمينها مباشرة في الاختبار (لا توجد خدمة تخزين ملفات على الخطة
        المجانية)؛ للصور الكبيرة جدًا يُفضّل استخدام رابط مباشر من موقع مثل imgbb.com بدلاً من الرفع المباشر.
      </p>
    </div>
  );
};

export default ImageUploader;
