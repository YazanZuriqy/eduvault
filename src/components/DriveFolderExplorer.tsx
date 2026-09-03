"use client";

import { useState } from "react";
import { isGoogleDriveConfigured, listDriveFolderChildren, requestGoogleDriveToken, type DriveFileEntry } from "@/utils/googleDrive";

interface DriveFolderExplorerProps {
  rootFolderId: string;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

const fileIcon = (mimeType: string): string => {
  if (mimeType === FOLDER_MIME) return "📁";
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.startsWith("video/")) return "🎬";
  return "📄";
};

interface DriveNodeProps {
  entry: DriveFileEntry;
  token: string;
  depth: number;
}

// عقدة واحدة في شجرة الاستكشاف: تجلب أبناءها من Drive API عند أول توسيع فقط (تحميل كسول).
const DriveNode = ({ entry, token, depth }: DriveNodeProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<DriveFileEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isFolder = entry.mimeType === FOLDER_MIME;

  const handleToggle = async () => {
    if (!isFolder) {
      window.open(`https://drive.google.com/file/d/${entry.id}/view`, "_blank", "noopener,noreferrer");
      return;
    }

    setIsExpanded((previous) => !previous);
    if (children !== null) return;

    setIsLoading(true);
    try {
      const fetched = await listDriveFolderChildren(token, entry.id);
      setChildren(fetched);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="drive-node" style={{ paddingInlineStart: depth * 18 }}>
      <button type="button" className="drive-node-row" onClick={() => void handleToggle()}>
        <span className="drive-node-icon">{fileIcon(entry.mimeType)}</span>
        <span className="drive-node-name">{entry.name}</span>
        {isFolder && <span className="drive-node-chevron">{isExpanded ? "▾" : "◂"}</span>}
      </button>

      {isFolder && isExpanded && (
        <div className="drive-node-children">
          {isLoading && <p className="quiz-hint">جارٍ التحميل...</p>}
          {!isLoading && children?.length === 0 && <p className="empty-state">مجلد فارغ.</p>}
          {!isLoading && children?.map((child) => <DriveNode key={child.id} entry={child} token={token} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
};

// مستكشف شجري لمجلد الطالب على Google Drive داخل ملفه في لوحة المعلّم، بتحميل كسول لكل مستوى.
const DriveFolderExplorer = ({ rootFolderId }: DriveFolderExplorerProps) => {
  const [token, setToken] = useState<string | null>(null);
  const [rootEntries, setRootEntries] = useState<DriveFileEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const accessToken = await requestGoogleDriveToken();
      const entries = await listDriveFolderChildren(accessToken, rootFolderId);
      setToken(accessToken);
      setRootEntries(entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر الاتصال بـ Google Drive.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isGoogleDriveConfigured()) {
    return <p className="quiz-hint">أضف Google Client ID لتفعيل استكشاف ملفات Drive الخاصة بالطالب.</p>;
  }

  return (
    <div className="drive-explorer">
      {!token && (
        <button type="button" className="logout-button" onClick={() => void handleConnect()} disabled={isLoading}>
          {isLoading ? "جارٍ الاتصال..." : "ربط Google Drive لعرض ملفات الطالب"}
        </button>
      )}

      {error && <p className="auth-error">{error}</p>}

      {token && rootEntries && (
        <div className="drive-tree">
          {rootEntries.length === 0 && <p className="empty-state">لا توجد ملفات في مجلد هذا الطالب بعد.</p>}
          {rootEntries.map((entry) => (
            <DriveNode key={entry.id} entry={entry} token={token} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
};

export default DriveFolderExplorer;
