import type { SeatingLayout, Student } from "@/lib/types";
import { genderDotClass } from "@/lib/gender";

interface Props {
  layout: SeatingLayout;
  studentsById: Map<string, Student>;
}

export default function SeatingChartView({ layout, studentsById }: Props) {
  if (layout.length === 0) {
    return <p className="text-sm text-muted">Ingen klassekart generert ennå.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {layout.map((group, i) => (
        <div key={i} className="rounded-lg border border-border bg-surface-raised p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
            Bord {i + 1}
          </p>
          <ul className="flex flex-col gap-1.5">
            {group.map((studentId) => {
              const student = studentsById.get(studentId);
              if (!student) return null;
              return (
                <li key={studentId} className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${genderDotClass(student.gender)}`} aria-hidden />
                  {student.name}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
