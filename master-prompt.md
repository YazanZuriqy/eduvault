# Role & Project Overview
You are an expert Full-Stack Developer specializing in Serverless Architecture and secure EdTech systems. Your task is to initialize, structure, and build "EduVault" — a highly secure, cost-optimized, and automated Private Educational Platform.

The platform allows Teachers to manage students, automate Google Drive video sharing, and link specific sessions to individual student profiles. Students can log in to view their personalized video sessions, take required quizzes, and track their progress through a highly secure interface.

# Tech Stack & Architecture
- Frontend Staging: Next.js 15+ (Static Export / SSG Layout), React 19+, TypeScript 5.x, Tailwind CSS v4.0.
- Deployment Host: GitHub Pages (Requires static generation with `output: 'export'` and `images: { unoptimized: true }` in `next.config.js`).
- Backend & DB: Firebase Suite (Auth, Firestore, Hosting, and Cloud Functions v2 in Node.js).
- Video Infrastructure: Google Drive API (Handled strictly via Firebase Cloud Functions).
- Video Playback: Custom video player wrapper using Plyr or Video.js (No raw Google Drive iFrames).

# Comprehensive Architecture & Requirements

## 1. Authentication & Dual-Role RBAC (Firebase Auth)
- Implement email/password and Google Sign-In authentication.
- Utilize Firebase Custom Claims to enforce two strict roles: `teacher` and `student`.
- Implement a session control mechanism in Firebase to block concurrent logins from different locations/IPs for the same student account.

## 2. Secure Database Schema & Access Rules (Firestore)
- Design a relational serverless schema:
  - `users` collection: `{ uid, email, role, createdAt, parentEmail }`
  - `sessions` collection: `{ sessionId, studentId, videoTitle, driveFileId, quizPassed, createdAt }`
  - `quizzes` collection: `{ quizId, sessionId, questions: [{ question, options: [], correctAnswer }] }`
- Implement these strict Firestore Security Rules:
  ```javascript
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /users/{userId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      match /sessions/{sessionId} {
        allow create, update, delete: if request.auth != null && request.auth.token.role == 'teacher';
        allow read: if request.auth != null && (request.auth.uid == resource.data.studentId || request.auth.token.role == 'teacher');
      }
      match /quizzes/{quizId} {
        allow write: if request.auth != null && request.auth.token.role == 'teacher';
        allow read: if request.auth != null;
      }
    }
  }
  ```

## 3. Automated Google Drive Integration (Firebase Cloud Functions)
- Move all secure Google Drive API interactions (`client_id`, `client_secret`, `refresh_token`) to Firebase Cloud Functions v2 to protect credentials from the static frontend.
- **Automation Workflow:** When a teacher registers a new student, trigger a Cloud Function to automatically create a dedicated folder for that student on Google Drive.
- **Permission Locking:** When a video is linked to a session, a Cloud Function must call the Google Drive API to make the file private and share it strictly with the student's email as a "viewer" only, enforcing `copyRequiresWriterPermission: true` to completely block downloading, copying, or printing.

## 4. Anti-Piracy Player & Streaming (Plyr / Video.js)
- Build a custom React video player component that streams the video by securely piping the authenticated Google Drive media stream (`https://googleapis.com{fileId}?alt=media`) through the secure Cloud Function.
- **Dynamic Watermarking:** Program the custom player to display the logged-in student's email and phone number as a semi-transparent floating text that moves randomly across the screen every 90 seconds to prevent phone camera recording.
- Completely strip and disable all context menus, download triggers, and default layout artifacts.

## 5. Micro-Learning, Conditional Unlocking & Parents Portal
- **Conditional Quizzes:** Embed a 3-question MCQ quiz at the end of each session. Prevent the student from unlocking or viewing the next chronologically assigned session until they pass the current quiz with a minimum score of 100%.
- **Time-stamped Notes:** Build a client-side layout for students to save personalized bookmarks linked to video durations (`currentTime`).
- **Parents Portal:** Create a read-only tracking view accessible via `parentEmail` to monitor video completion rates, study durations, and quiz results.

## 6. GitHub Actions CI/CD Configuration
- Create a `.github/workflows/deploy.yml` workflow file to automate building and deploying the static Next.js project to GitHub Pages on every `git push` to the `main` branch.

# Instructions for Code Generation
- Generate the code incrementally. Start by setting up the project folder structure, `next.config.js` static export settings, and GitHub Actions workflow file.
- Apply strict TypeScript definitions across all modules. Avoid the use of `any`.
- Adhere strictly to 2026 clean coding principles (Arrow Functions, native ES Modules, clean async/await with robust error catching).
- Provide clean, production-ready code directly without conversational preambles.

اجعل الصفحة جذابة وجميلة جدا ومذهلة ومتطورة وقم بوضع اسمي باللغة العربية أ.يزن الزريقي واللغة الانجليزية T.YAZAN ZURIQY بشكل متحرك وبألوان مذهلة ونمط حديث وتنسيق رائع