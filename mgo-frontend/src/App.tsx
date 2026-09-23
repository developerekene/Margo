import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

const Home = lazy(() => import("./ui/pages/Home"));
const Signup = lazy(() => import("./ui/pages/auth/Signup"));
const Signin = lazy(() => import("./ui/pages/auth/SignIn"));
const Dashboard = lazy(() => import("./ui/pages/dashboard/Dashboard"));
const Chatbot = lazy(() => import("./ui/pages/Chatbot"));

/**
 * Routes are lazily loaded, so each page ships in its own chunk.
 * Pages navigate with `useNavigate()` from react-router-dom.
 */
function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/signin" element={<Signin />} />
          <Route path="/chatbot" element={<Chatbot />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

function PageFallback() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-white"
      role="status"
      aria-live="polite"
    >
      <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-line border-t-brand-500" />
      <span className="sr-only">Loading Margo…</span>
    </div>
  );
}

export default App;
