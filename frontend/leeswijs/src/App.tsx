import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import AuthLayout from "./layouts/AuthLayout";
import MainLayout from "./layouts/MainLayout";

import LoginPage from "./pages/LoginPage";
import OnboardingPage from "./pages/OnboardingPage";
import AssessmentPage from "./pages/AssessmentPage";
import HomePage from "./pages/HomePage";
import ReadingPage from "./pages/ReadingPage";
import FlashcardsPage from "./pages/FlashcardsPage";
import ProfilePage from "./pages/ProfilePage";
import SurveyPage from "./pages/SurveyPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Auth / onboarding flow (no sidebar) ─────────────────────── */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/assessment" element={<AssessmentPage />} />
        </Route>

        {/* ── Authenticated app (with sidebar + top bar) ───────────────── */}
        <Route element={<MainLayout />}>
          <Route path="/home" element={<HomePage />} />
          <Route path="/read/:sessionId" element={<ReadingPage />} />
          <Route path="/flashcards" element={<FlashcardsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/survey/:sessionId" element={<SurveyPage />} />
        </Route>

        {/* ── Default redirect ─────────────────────────────────────────── */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
