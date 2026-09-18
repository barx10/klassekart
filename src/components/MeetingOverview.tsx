"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/lib/app-data";
import {
  dayLabel,
  datesOf,
  kindLabel,
  rangeLabel,
  slotEnd,
  toMinutes,
  weekColumns,
  weekLabel,
  weeksOf,
} from "@/lib/meetings";
import { plural } from "@/lib/ui";
import type { MeetingPlan, MeetingSlot } from "@/lib/types";

/**
 * Alle samtaleoppsett i én uke, på tvers av klassene.
 *
 * En kontaktlærer har gjerne to klasser, og setter opp samtaler i begge samme
 * høst. Hvert oppsett har sin egen side, og der ser uka romslig ut: femten
 * ledige tider, ingenting i veien. Det er først når begge klassene legges oppå
 * hverandre at tirsdag ettermiddag viser seg å være full — og da har familien
 * alt fått beskjed.
 *
 * Derfor er dette en ren **lesevisning**. Tidene endres der de hører hjemme, i
 * oppsettet sitt; her er spørsmålet bare «har jeg plass torsdag klokka tre».
 * En redigering på tvers ville dessuten måttet svare på hvilket oppsett en ny
 * tid skulle havne i, og det spørsmålet har ikke noe godt svar.
 */

/** Fargene klassene skilles med. Fem rekker lenger enn noen lærer har klasser. */
const COLORS = [1, 2, 3, 4, 5];

function colorOf(index: number): { border: string; soft: string } {
  const n = COLORS[index % COLORS.length];
  return { border: `var(--plan-${n})`, soft: `var(--plan-${n}-soft)` };
}

interface Entry {
  slot: MeetingSlot;
  plan: MeetingPlan;
  label: string;
  who: string;
  color: { border: string; soft: string };
  clash: boolean;
}

export default function MeetingOverview() {
  const { classes, studentsByClass, allMeetingPlans } = useAppData();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  /** Alle elevnavn, på tvers av klasser: tidene her kommer fra flere av dem. */
  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const list of studentsByClass.values()) {
      for (const student of list) map.set(student.id, student.name);
    }
    return map;
  }, [studentsByClass]);

  /** Oppsettene som har tider i det hele tatt, med farge og navn. */
  const plans = useMemo(
    () =>
      allMeetingPlans
        .filter((plan) => plan.slots.length > 0)
        .map((plan, i) => ({
          plan,
          color: colorOf(i),
          className: classes.find((c) => c.id === plan.class_id)?.name ?? "Ukjent klasse",
        })),
    [allMeetingPlans, classes]
  );

  const shown = useMemo(() => plans.filter((p) => !hidden.has(p.plan.id)), [plans, hidden]);

  /**
   * Alle tidene i utvalget, som rader.
   *
   * Bare tider som gjelder noen kommer med. De ledige er lærerens reserve i
   * oppsettet, men her er spørsmålet hva som er opptatt, og tjue linjer som
   * sier «ledig» ville skjult de fem som er avtalt.
   */
  const entries = useMemo(() => {
    const rows: Entry[] = [];
    for (const { plan, color, className } of shown) {
      for (const slot of plan.slots) {
        if (!slot.student_id && !slot.note.trim()) continue;
        const navn = slot.student_id ? (nameOf.get(slot.student_id) ?? "Ukjent elev") : "";
        rows.push({
          slot,
          plan,
          label: `${className} · ${plan.name || kindLabel(plan.kind)}`,
          who: navn || slot.note.trim(),
          color,
          clash: false,
        });
      }
    }

    // Kollisjonene regnes ut på den samlede lista, ikke per oppsett: det er
    // nettopp de som krysser klassegrensa denne siden finnes for.
    for (const a of rows) {
      for (const b of rows) {
        if (a === b || a.slot.date !== b.slot.date) continue;
        const aStart = toMinutes(a.slot.start);
        const bStart = toMinutes(b.slot.start);
        if (aStart < bStart + b.slot.minutes && bStart < aStart + a.slot.minutes) {
          a.clash = true;
          break;
        }
      }
    }

    return rows.sort(
      (a, b) =>
        a.slot.date.localeCompare(b.slot.date) ||
        toMinutes(a.slot.start) - toMinutes(b.slot.start)
    );
  }, [shown, nameOf]);

  const weeks = useMemo(() => {
    const dates = datesOf(entries.map((e) => e.slot));
    return weeksOf(dates).map(({ monday, dates: inWeek }) => ({
      monday,
      dates: weekColumns(monday, inWeek),
    }));
  }, [entries]);

  const clashCount = entries.filter((e) => e.clash).length;

  function toggle(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (plans.length === 0) {
    return (
      <p className="text-sm text-muted">
        Ingen samtaleoppsett med tider ennå. Sett opp en runde under «Planlegging», så samles den
        her sammen med de andre klassene dine.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p data-print-hide className="text-sm text-muted">
        Alle samtalerundene dine i samme uke, uansett klasse. Tidene endres i oppsettet sitt under
        «Planlegging» — her er spørsmålet bare når du er opptatt.
      </p>

      {/* Hvilke oppsett som er med. Fargene går igjen på tidene under, så
          lista er både filter og tegnforklaring. */}
      <div data-print-hide className="flex flex-wrap items-center gap-2">
        {plans.map(({ plan, color, className }) => {
          const på = !hidden.has(plan.id);
          return (
            <label
              key={plan.id}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
              style={{
                borderColor: på ? color.border : "var(--border)",
                background: på ? color.soft : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={på}
                onChange={() => toggle(plan.id)}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              <span className="font-medium">{className}</span>
              <span className="text-muted">{plan.name || kindLabel(plan.kind)}</span>
            </label>
          );
        })}
      </div>

      {clashCount > 0 && (
        <p
          role="status"
          className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-1.5 text-xs text-danger"
        >
          {plural(clashCount, "samtale", "samtaler")} ligger oppå en annen. De er merket med rødt —
          rett dem i oppsettet de hører til.
        </p>
      )}

      {weeks.length === 0 ? (
        <p className="text-sm text-muted">Ingen av oppsettene som er huket av har tider.</p>
      ) : (
        weeks.map(({ monday, dates }) => (
          <section key={monday} className="flex flex-col gap-2">
            <h2 className="flex flex-wrap items-baseline gap-2 border-b border-border pb-1">
              <span className="text-sm font-semibold">{weekLabel(monday)}</span>
              <span className="text-xs text-subtle">{rangeLabel(dates)}</span>
            </h2>
            {/* På papiret står dagene side om side, som på samtalearket:
                en uke lest nedover er ingen ukesvisning. */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 print:grid-cols-5 print:gap-2">
              {dates.map((date) => {
                const inDay = entries.filter((e) => e.slot.date === date);
                return (
                  <section
                    key={date}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-2.5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold">{dayLabel(date)}</h3>
                      <span className="shrink-0 text-[11px] tabular-nums text-subtle">
                        {inDay.length}
                      </span>
                    </div>
                    {inDay.length === 0 ? (
                      <p className="text-xs text-subtle">Ingen samtaler.</p>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {inDay.map((entry) => (
                          <li
                            key={entry.slot.id}
                            className={`rounded-lg border px-2 py-1.5 text-xs ${
                              entry.clash ? "border-danger" : ""
                            }`}
                            style={
                              entry.clash
                                ? undefined
                                : { borderColor: entry.color.border, background: entry.color.soft }
                            }
                          >
                            <p className="flex items-baseline gap-1.5">
                              <span className="shrink-0 font-semibold tabular-nums">
                                {entry.slot.start}–{slotEnd(entry.slot)}
                              </span>
                              <span className="truncate">{entry.who}</span>
                              {entry.slot.done && (
                                <span className="ml-auto shrink-0 text-[10px] text-muted">hatt</span>
                              )}
                            </p>
                            <p className="truncate text-[11px] text-muted">{entry.label}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
