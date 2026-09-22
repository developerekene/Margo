/**
 * Central icon module.
 *
 * All UI iconography comes from `react-icons` (Lucide set, plus the coloured
 * Google mark). Wrapping them here keeps `aria-hidden`, sizing and the icon
 * choice consistent across the app, and gives a single place to swap sets later.
 *
 * The only bespoke SVG is the Margo brand mark — logos are identity assets,
 * not generic iconography.
 */

import { FcGoogle } from "react-icons/fc";
import {
  LuArrowUp,
  LuBookOpen,
  LuBot,
  LuCheck,
  LuCircleAlert,
  LuCircleCheck,
  LuCode,
  LuEye,
  LuEyeOff,
  LuFileText,
  LuGlobe,
  LuLoaderCircle,
  LuLock,
  LuSparkles,
  LuTrendingUp,
} from "react-icons/lu";

type IconProps = {
  className?: string;
};

/* -------------------------------------------------------------------------- */
/* Brand                                                                      */
/* -------------------------------------------------------------------------- */

export function MargoMarkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <path
        d="M4 6.6c0-1.2 1-2.1 2.1-2.1h7.8c1.2 0 2.1.9 2.1 2.1v5.1c0 1.2-.9 2.1-2.1 2.1h-4.2l-3.5 2.4a.5.5 0 0 1-.8-.4v-2.1A2.1 2.1 0 0 1 4 11.7V6.6Z"
        fill="currentColor"
      />
      <path
        d="M10 5.7l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7L7.6 8.1l1.7-.7L10 5.7Z"
        fill="#ffffff"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Lucide icons                                                               */
/* -------------------------------------------------------------------------- */

export function SparklesIcon({ className }: IconProps) {
  return <LuSparkles className={className} aria-hidden="true" />;
}

export function EyeIcon({ className }: IconProps) {
  return <LuEye className={className} aria-hidden="true" />;
}

export function EyeOffIcon({ className }: IconProps) {
  return <LuEyeOff className={className} aria-hidden="true" />;
}

export function CheckIcon({ className }: IconProps) {
  return <LuCheck className={className} aria-hidden="true" />;
}

export function CircleCheckIcon({ className }: IconProps) {
  return <LuCircleCheck className={className} aria-hidden="true" />;
}

export function AlertCircleIcon({ className }: IconProps) {
  return <LuCircleAlert className={className} aria-hidden="true" />;
}

export function LockIcon({ className }: IconProps) {
  return <LuLock className={className} aria-hidden="true" />;
}

export function DocumentIcon({ className }: IconProps) {
  return <LuFileText className={className} aria-hidden="true" />;
}

export function ArrowUpIcon({ className }: IconProps) {
  return <LuArrowUp className={className} aria-hidden="true" />;
}

export function BotIcon({ className }: IconProps) {
  return <LuBot className={className} aria-hidden="true" />;
}

export function GlobeIcon({ className }: IconProps) {
  return <LuGlobe className={className} aria-hidden="true" />;
}

export function BookOpenIcon({ className }: IconProps) {
  return <LuBookOpen className={className} aria-hidden="true" />;
}

export function CodeIcon({ className }: IconProps) {
  return <LuCode className={className} aria-hidden="true" />;
}

export function TrendingUpIcon({ className }: IconProps) {
  return <LuTrendingUp className={className} aria-hidden="true" />;
}

export function Spinner({ className }: IconProps) {
  return (
    <LuLoaderCircle
      className={`animate-spin ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Brand marks                                                                */
/* -------------------------------------------------------------------------- */

export function GoogleIcon({ className }: IconProps) {
  return <FcGoogle className={className} />;
}
