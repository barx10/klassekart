import type { PairHistoryRow, Student } from "@/lib/types";
import { pairKey } from "@/lib/seating";

interface Props {
  students: Student[];
  historyRows: PairHistoryRow[];
}

const BUCKET_LABELS = ["0 ganger", "1 gang", "2 ganger", "3 ganger", "4 ganger", "5+ ganger"];

function bucketFor(count: number): number {
  return Math.min(count, 5);
}

function firstName(fullName: string): string {
  return fullName.split(" ")[0];
}

export default function PairHeatmap({ students, historyRows }: Props) {
  if (students.length < 2) {
    return <p className="text-sm text-muted">Legg til minst to elever for å se oversikten.</p>;
  }

  const countMap = new Map<string, number>();
  for (const row of historyRows) {
    countMap.set(pairKey(row.student_a_id, row.student_b_id), row.times_together);
  }

  const ordered = [...students].sort((a, b) => a.name.localeCompare(b.name, "no"));

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-max border-collapse text-xs">
          <caption className="sr-only">
            Antall ganger hvert elevpar har sittet sammen ved bordgruppe
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-surface-raised px-2 py-1 text-left">
                &nbsp;
              </th>
              {ordered.map((colStudent) => (
                <th
                  key={colStudent.id}
                  scope="col"
                  title={colStudent.name}
                  className="max-w-[3.5rem] truncate px-2 py-1 text-center font-medium text-muted"
                >
                  {firstName(colStudent.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((rowStudent) => (
              <tr key={rowStudent.id}>
                <th
                  scope="row"
                  title={rowStudent.name}
                  className="sticky left-0 z-10 max-w-[7rem] truncate bg-surface-raised px-2 py-1 text-left font-medium text-muted"
                >
                  {rowStudent.name}
                </th>
                {ordered.map((colStudent) => {
                  if (colStudent.id === rowStudent.id) {
                    return (
                      <td
                        key={colStudent.id}
                        className="border border-border bg-background px-2 py-1 text-center text-subtle"
                        aria-hidden
                      >
                        &middot;
                      </td>
                    );
                  }
                  const count = countMap.get(pairKey(rowStudent.id, colStudent.id)) ?? 0;
                  const bucket = bucketFor(count);
                  return (
                    <td
                      key={colStudent.id}
                      title={`${rowStudent.name} & ${colStudent.name}: ${count} gang(er) sammen`}
                      className="border border-border px-2 py-1 text-center tabular-nums"
                      style={{
                        backgroundColor: `var(--seq-${bucket})`,
                        color: `var(--seq-text-${bucket})`,
                      }}
                    >
                      {count}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
        <span>Antall ganger sittet sammen:</span>
        {BUCKET_LABELS.map((label, bucket) => (
          <span key={label} className="flex items-center gap-1">
            <span
              className="h-3 w-3 rounded-sm border border-border"
              style={{ backgroundColor: `var(--seq-${bucket})` }}
              aria-hidden
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
