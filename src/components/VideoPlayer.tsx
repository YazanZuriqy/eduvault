"use client";

import { useEffect, useState } from "react";

interface VideoPlayerProps {
  driveFileId: string;
  studentEmail: string;
  studentPhone: string;
}

interface WatermarkPosition {
  top: number;
  left: number;
}

// المعلّم أحيانًا يلصق رابط Drive الكامل بدل المعرّف وحده؛ هذه الدالة تستخرج المعرّف من كلتا الصيغتين.
const extractDriveFileId = (value: string): string => {
  const trimmed = value.trim();
  const patterns = [/\/d\/([a-zA-Z0-9_-]+)/, /[?&]id=([a-zA-Z0-9_-]+)/];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }

  return trimmed;
};

// لا توجد دالة سحابية لبث ملف Drive على خطة Spark، فيُعرض مباشرة عبر رابط معاينة Drive الرسمي
// (بديل الأنبوب الآمن السابق). ضبط مشاركة الملف كـ"عارض فقط" مع منع النسخ يتم يدويًا من Google Drive.
const VideoPlayer = ({ driveFileId, studentEmail, studentPhone }: VideoPlayerProps) => {
  const [watermark, setWatermark] = useState<WatermarkPosition>({ top: 12, left: 12 });
  const fileId = extractDriveFileId(driveFileId);

  // Deters phone-camera recording by relocating the watermark every 75–90 seconds.
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const reposition = () => {
      setWatermark({ top: 8 + Math.random() * 74, left: 8 + Math.random() * 74 });
      timeoutId = setTimeout(reposition, 75_000 + Math.random() * 15_000);
    };

    reposition();
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <div className="video-player-shell" onContextMenu={(event) => event.preventDefault()}>
      <iframe
        className="video-player-frame"
        src={`https://drive.google.com/file/d/${fileId}/preview`}
        title="جلسة الفيديو"
        allow="autoplay; fullscreen"
        allowFullScreen
      />

      <span
        className="video-watermark"
        style={{ top: `${watermark.top}%`, left: `${watermark.left}%` }}
        aria-hidden="true"
      >
        {studentEmail} · {studentPhone}
      </span>
    </div>
  );
};

export default VideoPlayer;
