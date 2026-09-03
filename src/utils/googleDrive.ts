"use client";

interface GoogleTokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}

interface GoogleAccounts {
  oauth2: {
    initTokenClient: (config: {
      client_id: string;
      scope: string;
      callback: (response: { access_token?: string; error?: string }) => void;
    }) => GoogleTokenClient;
  };
}

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts };
  }
}

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GIS_SRC = "https://accounts.google.com/gsi/client";

const loadGoogleIdentity = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (window.google?.accounts.oauth2) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("تعذر تحميل خدمة Google.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("تعذر تحميل خدمة Google."));
    document.head.appendChild(script);
  });

export const isGoogleDriveConfigured = (): boolean => Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

export const requestGoogleDriveToken = async (): Promise<string> => {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("لم يتم إعداد Google Client ID بعد.");

  await loadGoogleIdentity();
  return new Promise((resolve, reject) => {
    const client = window.google?.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.access_token) resolve(response.access_token);
        else reject(new Error(response.error ?? "تعذر ربط Google Drive."));
      },
    });
    if (!client) {
      reject(new Error("تعذر تهيئة ربط Google Drive."));
      return;
    }
    client.requestAccessToken({ prompt: "consent" });
  });
};

const driveRequest = async <T>(token: string, url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error("تعذر تنفيذ العملية في Google Drive.");
  return response.json() as Promise<T>;
};

export const createStudentDriveFolder = async (token: string, studentName: string, gradeLevel: string): Promise<string> => {
  const folder = await driveRequest<{ id: string }>(token, "https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: gradeLevel ? `${studentName} - ${gradeLevel}` : studentName,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  return folder.id;
};

export const uploadDriveImage = async (token: string, folderId: string, dataUrl: string, fileName: string): Promise<string> => {
  const [metadataPrefix, base64] = dataUrl.split(",");
  if (!base64) throw new Error("صيغة الصورة غير صالحة.");
  const mimeType = metadataPrefix.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
  const metadata = new Blob([JSON.stringify({ name: fileName, parents: [folderId] })], { type: "application/json" });
  const imageBytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  const body = new FormData();
  body.append("metadata", metadata);
  body.append("file", new Blob([imageBytes], { type: mimeType }), fileName);

  const file = await driveRequest<{ id: string }>(
    token,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    { method: "POST", body },
  );
  await driveRequest(token, `https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  return `https://drive.google.com/uc?export=view&id=${file.id}`;
};

export interface DriveFileEntry {
  id: string;
  name: string;
  mimeType: string;
}

// يسرد الملفات/المجلدات الفرعية مباشرة داخل مجلد Drive معيّن، تُستخدم لبناء شجرة استكشاف تفاعلية.
export const listDriveFolderChildren = async (token: string, folderId: string): Promise<DriveFileEntry[]> => {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const response = await driveRequest<{ files: DriveFileEntry[] }>(
    token,
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType)&orderBy=folder,name`,
  );
  return response.files;
};