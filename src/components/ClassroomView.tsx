import type { SeatingLayout, Student } from "@/lib/types";
import { genderDotClass } from "@/lib/gender";

interface Props {
  layout: SeatingLayout;
  cols: number;
  studentsById: Map<string, Student>;
}

function SeatCard({ student }: { student: Student | undefined }) {
  return (
    <div className="relative w-24 sm:w-28">
      <span
        className="absolute left-1/2 -bottom-1.5 h-3 w-10 -translate-x-1/2 rounded-b-full bg-border/50"
        aria-hidden
      />
      {student ? (
        <div className="relative z-10 flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3 py-2.5 shadow-sm">
          <span className={`h-2 w-2 shrink-0 rounded-full ${genderDotClass(student.gender)}`} aria-hidden />
          <span className="truncate text-sm font-medium">{student.name}</span>
        </div>
      ) : (
        <div className="relative z-10 rounded-xl border border-dashed border-border px-3 py-2.5 text-center text-xs text-subtle">
          Ledig
        </div>
      )}
    </div>
  );
}

export default function ClassroomView({ layout, cols, studentsById }: Props) {
  if (layout.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-background p-10 text-center text-sm text-muted">
        Ingen klassekart generert ennå.
      </div>
    );
  }

  const safeCols = Math.max(1, cols);
  const rows: SeatingLayout[] = [];
  for (let i = 0; i < layout.length; i += safeCols) {
    rows.push(layout.slice(i, i + safeCols));
  }

  return (
    <div className="rounded-2xl border border-border bg-background p-6 sm:p-8">
      <div className="mx-auto mb-8 w-full max-w-xs rounded-full border border-border bg-surface-raised py-2 text-center text-sm font-medium text-muted shadow-sm">
        Tavle
      </div>

      <div className="flex flex-col items-center gap-6 overflow-x-auto">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex flex-nowrap justify-center gap-6 sm:gap-10">
            {row.map((desk, colIndex) => (
              <div key={colIndex} className="flex gap-1.5 sm:gap-2">
                {[0, 1].map((seatIndex) => (
                  <SeatCard key={seatIndex} student={desk[seatIndex] ? studentsById.get(desk[seatIndex]) : undefined} />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
