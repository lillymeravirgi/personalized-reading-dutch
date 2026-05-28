import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import AuthLayout from "./layouts/AuthLayout";
import MainLayout from "./layouts/MainLayout";
import DelayedVocabReminder from "./components/DelayedVocabReminder";

import LoginPage                from "./pages/LoginPage";
import RegisterPage             from "./pages/RegisterPage";
import OnboardingPage           from "./pages/OnboardingPage";
import OnboardingFlashcardsPage from "./pages/OnboardingFlashcardsPage";
import HomePage                 from "./pages/HomePage";
import ReadingPage              from "./pages/ReadingPage";
import ReadingSessionPage       from "./pages/ReadingSessionPage";
import FlashcardsPage           from "./pages/FlashcardsPage";
import ProfilePage              from "./pages/ProfilePage";
import SettingsPage             from "./pages/SettingsPage";
import SurveyPage               from "./pages/SurveyPage";
import VocabTestPage            from "./pages/VocabTestPage";
import SystemTransitionPage     from "./pages/SystemTransitionPage";
import ThankYouPage             from "./pages/ThankYouPage";

export default function App() {
  return (
    <BrowserRouter>
      <DelayedVocabReminder />
      <Routes>
        {/* ── Auth / Onboarding (no sidebar) ── */}
        <Route element={<AuthLayout />}>
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/onboarding/flashcards" element={<OnboardingFlashcardsPage />} />
        </Route>

        <Route path="/thank-you" element={<ThankYouPage />} />
        <Route path="/system-transition" element={<SystemTransitionPage />} />

        {/* ── Main app (with sidebar/nav) ── */}
        <Route element={<MainLayout />}>
          <Route path="/home"                       element={<HomePage />} />
          <Route path="/reading"                    element={<ReadingPage />} />
          <Route path="/read/:sessionId"            element={<ReadingSessionPage />} />
          <Route path="/flashcards"                 element={<FlashcardsPage />} />
          <Route path="/profile"                    element={<ProfilePage />} />
          <Route path="/settings"                   element={<SettingsPage />} />
          <Route path="/vocab-test"                 element={<VocabTestPage />} />
          <Route path="/vocab-test/:sessionGroupId" element={<VocabTestPage />} />
          <Route path="/survey/:sessionId"          element={<SurveyPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
