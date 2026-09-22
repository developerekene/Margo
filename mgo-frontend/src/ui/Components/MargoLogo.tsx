import { MargoMarkIcon } from "./Icons";

type MargoLogoProps = {
  /** Controls the mark size and the wordmark type scale. */
  size?: "sm" | "md" | "lg";
  /** Hide the wordmark and render the mark only. */
  showWordmark?: boolean;
  className?: string;
};

const SIZES = {
  sm: { mark: "h-7 w-7 rounded-[9px]", glyph: "h-4 w-4", word: "text-[15px]" },
  md: { mark: "h-9 w-9 rounded-[11px]", glyph: "h-5 w-5", word: "text-[19px]" },
  lg: { mark: "h-11 w-11 rounded-xl", glyph: "h-6 w-6", word: "text-[23px]" },
} as const;

export function MargoLogo({
  size = "md",
  showWordmark = true,
  className = "",
}: MargoLogoProps) {
  const scale = SIZES[size];

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className={`flex shrink-0 items-center justify-center bg-brand-500 text-white ${scale.mark}`}
      >
        <MargoMarkIcon className={scale.glyph} />
      </span>
      {showWordmark ? (
        <span
          className={`font-semibold tracking-tight text-ink-900 ${scale.word}`}
        >
          Margo
        </span>
      ) : null}
    </span>
  );
}
