import type { IconType } from "react-icons";

type SectionPlaceholderProps = {
  icon: IconType;
  title: string;
  description: string;
  /** Short notes about what will live on this page. */
  points: string[];
};

/** Empty state shared by the dashboard sections that aren't built yet. */
export function SectionPlaceholder({
  icon: Icon,
  title,
  description,
  points,
}: SectionPlaceholderProps) {
  return (
    <section className="rounded-xl border border-line bg-white p-8 text-center shadow-soft">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>

      <h2 className="mt-4 text-[15px] font-semibold text-ink-900">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-ink-500">
        {description}
      </p>

      <ul className="mx-auto mt-5 flex max-w-lg flex-wrap justify-center gap-2">
        {points.map((point) => (
          <li
            key={point}
            className="rounded-full border border-line bg-slate-50 px-3 py-1 text-[12px] text-ink-500"
          >
            {point}
          </li>
        ))}
      </ul>
    </section>
  );
}
