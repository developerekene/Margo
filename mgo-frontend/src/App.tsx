import { lazy, Suspense, useLayoutEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { Toaster } from "sonner";

const Home = lazy(() => import("./ui/pages/Home"));
const Signup = lazy(() => import("./ui/pages/auth/Signup"));
const Signin = lazy(() => import("./ui/pages/auth/SignIn"));
const ForgetPassword = lazy(() => import("./ui/pages/auth/ForgetPassword"));
const CreateNewPassword = lazy(
  () => import("./ui/pages/auth/CreatenewPassword"),
);
const Pricing = lazy(() => import("./ui/Components/Pricing"));
const AboutUs = lazy(() => import("./ui/Components/About"));
const ContactUs = lazy(() => import("./ui/pages/ContactUspage"));
const Features = lazy(() => import("./ui/pages/Features"));
const HowItWorks = lazy(() => import("./ui/pages/HowItWork"));
const Dashboard = lazy(() => import("./ui/pages/dashboard/Dashboard"));

const Chatbotembed = lazy(() => import("./ui/pages/Chatbotembed"));
const Chatbot = lazy(() => import("./ui/pages/Chatbot"));

/**
 * React Router keeps the window scroll position between routes, so footer
 * links open the next page already scrolled to the bottom. Reset to the top
 * on every path change; hash links keep their own anchor behaviour.
 */
function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}

/**
 * Routes are lazily loaded, so each page ships in its own chunk.
 * Pages navigate with `useNavigate()` from react-router-dom.
 */
function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />

      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/signin" element={<Signin />} />
          <Route path="/forgot-password" element={<ForgetPassword />} />
          <Route path="/reset-password" element={<CreateNewPassword />} />
          <Route path="/create-new-password" element={<CreateNewPassword />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/about-us" element={<AboutUs />} />
          <Route path="/contact-us" element={<ContactUs />} />
          <Route path="/features" element={<Features />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/chatbot" element={<Chatbot />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/agent/new" element={<Dashboard />} />
          <Route
            path="/dashboard/agent/:agentId/edit"
            element={<Dashboard />}
          />
          <Route path="/dashboard/:section" element={<Dashboard />} />
          <Route path="/embed/chatbot" element={<Chatbotembed />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      <Toaster position="top-right" richColors closeButton />
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
