import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import {
  googleClientId,
  googleClientSecret,
  googleRefreshToken,
  createStudentFolder,
  getDriveFileStream,
} from "./driveClient";
import { gmailAppPassword, gmailSenderEmail, sendStudentInviteEmail } from "./mailer";

export { createCheckoutSession, handleStripeWebhook, cancelSubscription } from "./stripeWebhook";

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const DRIVE_SECRETS = [googleClientId, googleClientSecret, googleRefreshToken];

// Fires when a teacher creates a student doc (StudentManager.tsx -> createStudentAccount). If the
// client didn't already attach a driveFolderId, this creates it server-side and patches it back on
// via the Admin SDK (bypasses Firestore rules, which is fine — this is trusted server code).
export const onStudentAccountCreated = onDocumentCreated(
  { document: "users/{uid}", secrets: DRIVE_SECRETS },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const student = snapshot.data();
    if (student.role !== "student" || student.driveFolderId) return;

    try {
      const folderId = await createStudentFolder(student.displayName ?? student.email, student.gradeLevel);
      await snapshot.ref.update({ driveFolderId: folderId });
    } catch (error) {
      console.error(`Failed to auto-create Drive folder for student ${event.params.uid}`, error);
    }
  },
);

// Fires when a teacher creates a studentInvites/{code} doc (StudentManager.tsx -> createStudentInvite).
// Sends the registration code straight to the student's email — the client-side mailto link keeps
// working as an immediate fallback regardless of whether this is deployed.
export const onStudentInviteCreated = onDocumentCreated(
  { document: "studentInvites/{code}", secrets: [gmailSenderEmail, gmailAppPassword] },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const invite = snapshot.data();
    try {
      await sendStudentInviteEmail(invite.email, invite.displayName, invite.code);
    } catch (error) {
      console.error(`Failed to email invite code ${event.params.code}`, error);
    }
  },
);

// The only origin allowed to call the streaming proxy (the app's static GitHub Pages origin).
const ALLOWED_ORIGIN = "https://yazanzuriqy.github.io";

// Secure streaming proxy: the client only ever sees this function's URL, never the underlying
// Drive file id or Drive's own playback endpoints. Relays the Range header both ways so seeking
// works normally in a native <video> element.
export const streamVideo = onRequest(
  { secrets: DRIVE_SECRETS, cors: [ALLOWED_ORIGIN] },
  async (request, response) => {
    const fileId = request.query.fileId;
    if (typeof fileId !== "string" || !fileId) {
      response.status(400).send("Missing fileId.");
      return;
    }

    try {
      const driveResponse = await getDriveFileStream(fileId, request.headers.range);

      response.status(driveResponse.status);
      for (const [key, value] of Object.entries(driveResponse.headers)) {
        if (typeof value === "string") response.setHeader(key, value);
      }

      driveResponse.data
        .on("error", (streamError: Error) => {
          console.error("Drive stream error", streamError);
          response.end();
        })
        .pipe(response);
    } catch (error) {
      console.error("streamVideo failed", error);
      response.status(500).send("Unable to stream this file.");
    }
  },
);
