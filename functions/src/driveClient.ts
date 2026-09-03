import { google } from "googleapis";
import { defineSecret } from "firebase-functions/params";

export const googleClientId = defineSecret("GOOGLE_CLIENT_ID");
export const googleClientSecret = defineSecret("GOOGLE_CLIENT_SECRET");
export const googleRefreshToken = defineSecret("GOOGLE_REFRESH_TOKEN");

let cachedDrive: ReturnType<typeof google.drive> | null = null;

// Builds an OAuth2-authorized Drive v3 client from Secret Manager values; reused across invocations
// within the same warm function instance instead of rebuilding it on every call.
const getDriveClient = () => {
  if (cachedDrive) return cachedDrive;

  const oauth2Client = new google.auth.OAuth2(googleClientId.value(), googleClientSecret.value());
  oauth2Client.setCredentials({ refresh_token: googleRefreshToken.value() });

  cachedDrive = google.drive({ version: "v3", auth: oauth2Client });
  return cachedDrive;
};

export const createStudentFolder = async (studentName: string, gradeLevel?: string): Promise<string> => {
  const folder = await getDriveClient().files.create({
    requestBody: {
      name: gradeLevel ? `${studentName} - ${gradeLevel}` : studentName,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });

  if (!folder.data.id) throw new Error("Drive did not return a folder id.");
  return folder.data.id;
};

// Forwards the Range header to Drive as-is (so seeking works) and returns the raw response
// (status + headers + stream) for streamVideo to relay untouched.
export const getDriveFileStream = (fileId: string, range?: string) =>
  getDriveClient().files.get(
    { fileId, alt: "media" },
    { responseType: "stream", headers: range ? { Range: range } : undefined },
  );
