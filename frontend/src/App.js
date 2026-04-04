import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import InteractiveReader from './pages/InteractiveReader';
import './App.css';

export default function App() {
  const [activeUserId, setActiveUserId] = useState(null);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<LandingPage onUserSelect={setActiveUserId} />}
        />
        <Route
          path="/read/:sessionId"
          element={<InteractiveReader userId={activeUserId} />}
        />
      </Routes>
    </BrowserRouter>
  );
}