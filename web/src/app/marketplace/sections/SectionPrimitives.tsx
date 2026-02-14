interface SectionHeaderProps {
  title: string;
  subtitle?: string;
}

export function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export function SectionSkeleton({ title }: { title: string }) {
  return (
    <div>
      <SectionHeader title={title} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-36 animate-pulse rounded-sm border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900"
          />
        ))}
      </div>
    </div>
  );
}
