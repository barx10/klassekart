"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useAppData } from "@/lib/app-data";
import { SaveCancelled, saveTextToFile } from "@/lib/backup-file";
import { slotsToEvents, toIcs } from "@/lib/calendar";
import { teacherKey } from "@/lib/local-db";
import ConfirmDialog from "./ConfirmDialog";
import HelpTip from "./HelpTip";
import {
  MAX_GAP,
  MAX_MINUTES,
  MAX_WEEKS,
  MEETING_KINDS,
  MIN_MINUTES,
  WEEKDAYS,
  addDays,
  addSlots,
  busySlots,
  clashingSlots,
  crossBusy,
  datesOf,
  dayLabel,
  daysBetween,
  defaultMinutes,
  fillSlots,
  kindLabel,
  mondayOf,
  newSlotId,
  nextWeekday,
  printFileName,
  rangeLabel,
  rebuildSlots,
  shiftSlots,
  slotEnd,
  slotsForDate,
  spanLabel,
  toClock,
  toDate,
  toMinutes,
  unplacedStudents,
  weekColumns,
  weekLabel,
  weeksOf,
  withStudentAt,
} from "@/lib/meetings";
import {
  ghostButton,
  inputClass,
  inputClassSm,
  plural,
  primaryButton,
  secondaryButton,
} from "@/lib/ui";
import type { MeetingKind, MeetingPlan, MeetingSlot } from "@/lib/types";

/**
 * Samtaler: elevsamtaler og utviklingssamtaler satt opp i en eller flere
 * arbeidsuker.
 *
 * Læreren setter et skjema — fra 08.30 til 17.00, tjue minutter om gangen —
 * lager tidene av det, og fordeler elevene på dem. Etterpå justeres enkelttider
 * for hånd, for det er slik en samtaleuke faktisk blir: de fleste tar tida de
 * får, og et par familier kan bare tirsdag klokka halv fem.
 *
 * **Uke-feltet sier hvor skjemaet lager tider, og flytter ingen som står der.**
 * Tidene henger på datoer (se `meetings.ts`). Før lå de som ukedagsnumre, og da
 * flyttet et klikk på uka eleven som var avtalt onsdag 16. september til
 * onsdagen etter. Skal hele runden skyves, er det en egen knapp som gjør det —
 * synlig, og ikke som en bieffekt av et datofelt.
 *
 * **Tider legges til, de erstatter ikke.** «Legg til tider» bygger uka skjemaet
 * står på og legger den til dem som alt står der; «Lag alle tidene på nytt»
 * bygger hele oppsettet fra skjemaet og er den som ber om bekreftelse. Før
 * fantes bare den siste, og da var det umulig å ha to uker i gang samtidig: en
 * lærer som satte opp noen familier i uke 39 og så bladde til uke 40 mistet
 * uke 39 og fikk navnene med seg over. En samtalerunde strekker seg, og en
 * enkelt familie kan måtte settes opp et godt stykke fram i tid.
 *
 * **Men da må spriket være synlig.** Uka i skjemaet og uka tidene ligger i er to
 * ulike ting, og et klikk på «uka etter» i skjemaet så ut som at det ikke virket:
 * det sto «Uke 40» over et skjema med uke 39 under. Nå står de to ukene mot
 * hverandre i en linje (`outOfSync`) med begge utveiene som knapper — flytt
 * tidene hit, eller sett skjemaet tilbake. Ingen av dem gjør noe læreren ikke har
 * bedt om, og ingen av dem lar spriket bli stående usagt.
 *
 * **Oppsettet gjelder én kontaktlærer om gangen.** En klasse har gjerne to som
 * tar hver sine samtaler, og det er egne elever læreren skal sette opp. Utvalget
 * følger `contact_teacher` på eleven, altså det som står i elevlista — settes det
 * ikke, gjelder oppsettet alle i klassen.
 *
 * **Eleven velges i en nedtrekksliste, ikke ved å dras.** Det er den samme
 * avveiningen som ellers i appen, men den faller motsatt vei her: en tid er en
 * rad i et skjema, ikke et sete i et rom, og en liste med 25 navn er raskere å
 * treffe enn et navn som skal dras tvers over uka. Lista virker likt med mus,
 * fingre og tastatur, og trenger ingen egen tastaturvei ved siden av.
 *
 * **Oppsettet lagres av seg selv**, med litt forsinkelse, som pultene i
 * klasserommet. En samtaleuke settes opp over flere økter og med telefonen i
 * hånda, og en «Lagre»-knapp læreren rekker å gå fra ville kostet hele uka.
 *
 * **Arket er en ukesvisning på én side.** Fem dagsbokser, mandag til fredag, og
 * i hver boks en tett liste: «Anna Oline: 10:15–10:45». Hver tid hadde en rute
 * for seg før, og da tok tolv samtaler hele siden uten å si mer enn tolv linjer
 * gjør. De ledige tidene filtreres bort på papiret — de er reserven i appen, men
 * støy på et ark elevene skal finne tida si på. Alt måles i `em`, og
 * skriftstørrelsen regnes ut fra hvor mange linjer som skal dele sidehøyden, så
 * en oversikt aldri renner over på side to. Alt dette ligger samlet i `sheet`.
 */

/** Hvor lenge det ventes fra siste tastetrykk til oppsettet skrives til disk. */
const SAVE_DELAY = 400;

/** Navnet på en elev som ikke finnes lenger — se `option`-lista under. */
const UNKNOWN = "Ukjent elev";

/** «15.9. 09:00» — hvor en elev står fra før, kort nok for en nedtrekksliste. */
function placedLabel(slot: MeetingSlot): string {
  const date = toDate(slot.date);
  if (!date) return slot.start;
  return `${date.getDate()}.${date.getMonth() + 1}. ${slot.start}`;
}

/**
 * Flest tider på én dag i uka. Det er høyden uka trenger på arket — dagene står
 * ved siden av hverandre, så det er den travleste som bestemmer.
 */
function rowsIn(slots: MeetingSlot[], dates: string[]): number {
  return Math.max(1, ...dates.map((d) => slotsForDate(slots, d).length));
}

function SlotCount({ used, total }: { used: number; total: number }) {
  return (
    <span className="shrink-0 text-[11px] tabular-nums text-subtle">
      {used}/{total}
    </span>
  );
}

/**
 * Overskrifta over en bolk i skjemaet, så feltene ikke flyter i én lang rad.
 * `hint` er til bolken som trenger å si hva feltene *ikke* gjør — uten den var
 * det umulig å se at skjemafeltene bare er en oppskrift på nye tider.
 */
function FieldGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{title}</h3>
      {hint && <p className="-mt-0.5 text-xs text-subtle">{hint}</p>}
      <div className="flex flex-wrap items-end gap-3">{children}</div>
    </div>
  );
}

export default function MeetingPlanner() {
  const {
    activeClass,
    activeStudents,
    classes,
    meetingPlans,
    allMeetingPlans,
    ignoredPlans,
    toggleIgnoredPlan,
    createMeetingPlan,
    saveMeetingPlan,
    deleteMeetingPlan,
    setError,
  } = useAppData();

  const [draft, setDraft] = useState<MeetingPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MeetingPlan | null>(null);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  /**
   * Utskriften læreren ba om sist.
   *
   * Ukeoversikten og lappene er to helt ulike ark av de samme tidene, og bare
   * ett av dem kan ligge i dokumentet når nettleseren tar bildet av sida.
   * Tellersteget gjør at to trykk på samme knapp begge fører til en utskrift;
   * uten det ville `useEffect` sett samme verdi og ikke gjort noe.
   */
  const [printJob, setPrintJob] = useState<{ mode: "uke" | "lapper"; n: number } | null>(null);
  // Feltene som har en hjelpetekst ved siden av seg må peke på feltet med
  // `htmlFor`. En <label> som omslutter både spørsmålstegnet og feltet gir
  // navnet sitt til knappen — den kommer først — og feltet blir stående uten.
  const teacherId = useId();
  const weekId = useId();

  /**
   * Oppsettet som vises: det læreren har åpnet, ellers det nyeste. Utledet og
   * ikke satt i en effekt, så det nyeste oppsettet ligger framme med én gang
   * uten at noe må settes i to omganger.
   *
   * Hører utkastet til en annen klasse, er vi kommet hit fra en annen klasse i
   * menya, og det er klassens egne oppsett som gjelder.
   */
  const plan = draft && draft.class_id === activeClass?.id ? draft : (meetingPlans[0] ?? null);

  const byId = useMemo(() => new Map(activeStudents.map((s) => [s.id, s])), [activeStudents]);

  /**
   * Kontaktlærerne som faktisk har elever i klassen. Lista over alle lærerne i
   * programmet ville tilbudt et utvalg som ga en tom uke.
   */
  const teachers = useMemo(() => {
    const funnet = new Map<string, string>();
    for (const student of activeStudents) {
      const navn = student.contact_teacher?.trim();
      if (navn) funnet.set(teacherKey(navn), navn);
    }
    return [...funnet.values()].sort((a, b) => a.localeCompare(b, "no"));
  }, [activeStudents]);

  /** Elevene oppsettet gjelder: kontaktlærerens egne, ellers hele klassen. */
  const students = useMemo(() => {
    const valgt = plan?.teacher.trim();
    if (!valgt) return activeStudents;
    return activeStudents.filter(
      (s) => s.contact_teacher && teacherKey(s.contact_teacher) === teacherKey(valgt)
    );
  }, [activeStudents, plan]);

  /** Hvor hver elev står oppført. Brukes til å vise tida i nedtrekkslista. */
  const placedIn = useMemo(() => {
    const map = new Map<string, MeetingSlot>();
    for (const slot of plan?.slots ?? []) {
      if (slot.student_id) map.set(slot.student_id, slot);
    }
    return map;
  }, [plan]);

  /**
   * Dagene oppsettet har tider på, gruppert i uker. Utledet av tidene og ikke
   * av skjemaet: en dag læreren har lagt til selv i uka etter skal ha sin egen
   * spalte, selv om skjemaet bare lager tider i én uke.
   */
  const weeks = useMemo(() => weeksOf(datesOf(plan?.slots ?? [])), [plan]);
  const lastDate = useMemo(() => {
    const dates = datesOf(plan?.slots ?? []);
    return dates[dates.length - 1] ?? plan?.week_start ?? "";
  }, [plan]);

  /**
   * Mandagen tidene faktisk begynner i, og «uke 39» / «uke 39–40» til å si det
   * med. Skjemaets `week_start` sier bare hvor *nye* tider lages, så de to kan
   * peke hver sin vei — og det er nettopp det som må stå skrevet et sted.
   */
  const slotMonday = weeks[0]?.monday ?? "";
  const weekSpan = useMemo(
    () => (weeks.length === 0 ? "" : spanLabel(weeks[0].monday, weeks[weeks.length - 1].monday)),
    [weeks]
  );

  /**
   * Ukene skjemaet ville lagt til nå, til knappen som gjør det. Knappen må si
   * hvilken uke den gjelder: «Legg til tider» ved siden av et uke-felt læreren
   * nettopp endret sier ikke om den følger feltet eller tidene under.
   */
  const planSpan = plan
    ? spanLabel(plan.week_start, addDays(plan.week_start, (plan.weeks - 1) * 7))
    : "";

  /**
   * Tidene skjemaet ville lagt til. Regnes ut på forhånd for at knappen skal
   * kunne si hvor mange det blir — og slå seg av når skjemaet bare ville lagd
   * tider som alt står der.
   */
  const pending = useMemo(() => (plan ? addSlots(plan) : []), [plan]);
  const pendingCount = pending.length - (plan?.slots.length ?? 0);

  /**
   * Skjemaet peker på en uke det ikke er laget tider i ennå.
   *
   * Det er *ikke* det samme som at skjemaet står i en annen uke enn den første
   * tida: en runde som går over uke 39 og 40 skal kunne ha skjemaet stående i
   * uke 40 uten at appen maser. Det er bare uka uten tider som er verdt en
   * linje — der har læreren enten glemt å legge dem til, eller endret feltet
   * uten å mene det.
   */
  const outOfSync =
    plan !== null && weeks.length > 0 && !weeks.some((w) => w.monday === plan.week_start);

  /**
   * Arket: alt som skiller papiret fra skjermen, regnet ut ett sted.
   *
   * **Bare tidene som gjelder noen kommer med.** De ledige er nyttige i appen —
   * de er reserven når en familie må bytte dag — men på papiret er de støy:
   * læreren henger opp arket for at elevene skal finne tida si, og tjue rader
   * som sier «ledig» gjør den vanskeligere å finne. De filtreres altså bort
   * ved utskrift, og blir liggende i oppsettet. Å slette dem automatisk, når
   * siste elev har fått tid, ville tatt fra læreren nettopp den reserven —
   * midt i uka der den trengs mest.
   *
   * Er ingen fordelt ennå, er det den *tomme* uka læreren vil ha på papir, og
   * da står alle tidene der. Ellers ville «Skriv ut» før fordelingen gitt et
   * blankt ark.
   *
   * **Alt skal på én side.** En samtaleoversikt som fortsetter på side to er
   * ingen oversikt: læreren skal kunne se hele runden på én gang, og et ark
   * nummer to blir liggende igjen på kopirommet. Arket har en gitt høyde, og
   * `font` er det som gir etter når samtalene blir mange — alt inni måles i
   * `em`, så hele skjemaet krymper i takt. Taket er den størrelsen en
   * samtaleuke med god plass fortjener; gulvet er der for at et urimelig stort
   * oppsett skal krympe i stedet for å renne over.
   */
  const sheet = useMemo(() => {
    const alle = plan?.slots ?? [];
    const brukt = alle.filter((s) => s.student_id || s.note.trim());
    const slots = brukt.length > 0 ? brukt : alle;

    // Hver uke får alle fem hverdagene, ikke bare dem som har noe: arket er en
    // ukesvisning, og en onsdagsspalte som flytter seg fra uke til uke er ingen.
    const weeks = weeksOf(datesOf(slots)).map(({ monday, dates }) => ({
      monday,
      dates: weekColumns(monday, dates),
    }));

    // Linjene arket må få plass til: den travleste dagen i hver uke, lagt sammen.
    const rows = weeks.reduce((n, w) => n + rowsIn(slots, w.dates), 0);
    // Liggende A4 minus 12 mm marg, og plassen overskrifta og uke-linjene tar.
    const rowMm = (186 - 14 - Math.max(1, weeks.length) * 7) / Math.max(1, rows);
    // Et millimeter er ca. 3.78 px, og en linje trenger drøyt sin egen høyde.
    const font = Math.max(5, Math.min(11, (rowMm * 3.78) / 1.45));

    const span = weeks.length
      ? spanLabel(weeks[0].monday, weeks[weeks.length - 1].monday)
      : "";

    return { slots, weeks, font, span };
  }, [plan]);

  /** Om noen samtale er holdt. Styrer tegnforklaringa på arket. */
  const sheetHeld = sheet.slots.some((s) => s.done);

  /**
   * De andre samtaleoppsettene læreren har, i alle klasser.
   *
   * En kontaktlærer i to klasser setter dem opp hver for seg, men har bare én
   * tirsdag. Etiketten er klassen og oppsettet, for «opptatt» uten å si av hva
   * ber læreren lete seg gjennom de andre klassene selv.
   */
  const otherPlans = useMemo(() => {
    if (!plan) return [];
    return allMeetingPlans
      .filter((m) => m.id !== plan.id && m.slots.some((s) => s.student_id || s.note.trim()))
      .map((m) => ({
        id: m.id,
        label: `${classes.find((c) => c.id === m.class_id)?.name ?? "annen klasse"}: ${
          m.name || kindLabel(m.kind)
        }`,
        slots: m.slots,
      }));
  }, [allMeetingPlans, classes, plan]);

  /**
   * De av dem læreren faktisk regner med. Avhukinga er delt med «Alle klasser»,
   * så en klasse som er haket bort der er borte her også — før satt varselet
   * igjen på denne sida og påsto at tidene lå oppå en avtale læreren nettopp
   * hadde sagt fra seg.
   */
  const countedPlans = useMemo(
    () => otherPlans.filter((m) => !ignoredPlans.has(m.id)),
    [otherPlans, ignoredPlans]
  );

  /**
   * Tidene læreren er opptatt i de andre oppsettene. Fordelingen tar dem imot
   * og lar tidene som ligger oppå dem stå ledige — en kontaktlærer med to
   * klasser kan bare være ett sted tirsdag klokka 15.
   */
  const busyTimes = useMemo(() => busySlots(countedPlans), [countedPlans]);

  /**
   * Lappene: én samtale per elev, i den rekkefølgen de skjer.
   *
   * Bare tider som er satt av til en elev. En merknadstid — «møte med PPT» —
   * hører hjemme i lærerens kalender og på ukeoversikten, ikke i en sekk.
   */
  const notes = useMemo(
    () =>
      (plan?.slots ?? [])
        .filter((slot) => slot.student_id)
        .sort((a, b) => a.date.localeCompare(b.date) || toMinutes(a.start) - toMinutes(b.start)),
    [plan]
  );

  /**
   * Tider som ligger oppå en samtale i et annet oppsett, og hva de treffer.
   * Ledige tider er med: de er ikke en feil, men de er opptatt, og fordelingen
   * hopper over dem.
   */
  const crossed = useMemo(
    () => crossBusy(plan?.slots ?? [], countedPlans),
    [plan, countedPlans]
  );

  /**
   * De av dem som gjelder noen — kollisjonene læreren må rette. En ledig tid
   * som er opptatt et annet sted er ingenting å varsle om; den står bare der.
   */
  const crossedUsed = useMemo(
    () =>
      (plan?.slots ?? []).filter(
        (s) => (s.student_id || s.note.trim()) && crossed.has(s.id)
      ),
    [plan, crossed]
  );

  /**
   * Filnavnet utskriften foreslår.
   *
   * Nettleseren tar sidetittelen, og den sier «Klassekart» på alle sidene i
   * appen. Læreren som lagrer samtalerunden som PDF satt igjen med en fil hen
   * ikke kunne kjenne igjen. Tittelen byttes derfor i `beforeprint` og settes
   * tilbake i `afterprint`.
   *
   * Det er trygt her, til forskjell fra å måle om lerretet i samme lytter:
   * tittelen er ren DOM og krever ingen ny tegning fra React før nettleseren
   * tar bildet av sida.
   */
  /**
   * Skriver ut når læreren har valgt hvilket ark hen vil ha.
   *
   * Utskriften må vente på at React har tegnet det valgte arket: `window.print()`
   * rett i klikket ville tatt bildet av sida slik den så ut *før* byttet, og
   * læreren hadde fått ukeoversikten når hen ba om lapper. Effekten kjører etter
   * tegningen, og der er arket på plass.
   */
  useEffect(() => {
    if (!printJob) return;
    window.print();
  }, [printJob]);

  /** Arket som ligger i dokumentet nå. Ukeoversikten er det vanlige. */
  const printMode = printJob?.mode ?? "uke";

  /**
   * Samtalene som kalenderfil.
   *
   * Læreren lever i skolens kalender, ikke i Klassekart, og tjue avtaler skrevet
   * inn for hånd er tjue sjanser til å bomme med en time. Fila lages her i
   * nettleseren: en kobling mot Google eller Outlook ville sendt elevnavn til en
   * tjeneste, og det er nettopp det appen ikke gjør.
   */
  async function downloadCalendar() {
    if (!plan) return;
    const events = slotsToEvents(
      plan.slots,
      plan.kind,
      activeClass?.name ?? "",
      (id) => byId.get(id)?.name ?? UNKNOWN
    );
    if (events.length === 0) return;
    const navn = printFileName(plan.kind, activeClass?.name ?? "");
    try {
      await saveTextToFile(toIcs(events, navn), `${navn}.ics`, "calendar");
    } catch (e) {
      // Lukker læreren «Lagre som» uten å velge noe, er det ikke en feil.
      if (e instanceof SaveCancelled) return;
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    if (!plan) return;
    const utskriftsnavn = printFileName(plan.kind, activeClass?.name ?? "");
    let forrige = "";
    const before = () => {
      forrige = document.title;
      document.title = utskriftsnavn;
    };
    const after = () => {
      if (forrige) document.title = forrige;
      forrige = "";
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      after();
    };
  }, [plan, activeClass]);

  const clashes = useMemo(() => clashingSlots(plan?.slots ?? []), [plan]);
  const unplaced = useMemo(
    () => unplacedStudents(plan?.slots ?? [], students),
    [plan, students]
  );

  /**
   * Tider som er satt av til elever utenfor utvalget. Skifter læreren
   * kontaktlærer på et oppsett som alt er fordelt, blir de stående — de kan
   * være avtalt med noen — men da skal det stå tydelig hvorfor tider er
   * opptatt av navn som ikke er i lista under.
   */
  const foreign = useMemo(() => {
    if (!plan?.teacher.trim()) return 0;
    const mine = new Set(students.map((s) => s.id));
    return plan.slots.filter((s) => s.student_id && !mine.has(s.student_id)).length;
  }, [plan, students]);

  // Lagrer av seg selv når det har vært stille en liten stund. Timeren
  // nullstilles for hvert tastetrykk, så et navn som skrives inn blir ett
  // skriv og ikke ett per bokstav.
  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => {
      saveMeetingPlan(draft)
        .then(() => setSaved(true))
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [draft, saveMeetingPlan, setError]);

  function update(next: MeetingPlan) {
    setSaved(false);
    setDraft(next);
  }

  /** Endrer skjemaet. Tidene lages ikke på nytt før læreren ber om det. */
  function change(fields: Partial<MeetingPlan>) {
    if (!plan) return;
    update({ ...plan, ...fields });
  }

  function changeSlot(id: string, fields: Partial<MeetingSlot>) {
    if (!plan) return;
    update({ ...plan, slots: plan.slots.map((s) => (s.id === id ? { ...s, ...fields } : s)) });
  }

  async function newPlan(kind: MeetingKind) {
    setBusy(true);
    try {
      setDraft(await createMeetingPlan(kind));
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Lager tidene på nytt fra skjemaet. Elevene som alt står oppført settes inn
   * igjen på dagen sin — endrer læreren lengden fra 20 til 30 minutter, er det
   * klokkeslettene som skal flytte seg, ikke hvilken dag familien skal møte.
   * Samtalene som er holdt blir stående der de står; de er ikke en plan lenger.
   */
  function rebuild() {
    if (!plan) return;
    setConfirmRebuild(false);
    update({ ...plan, slots: rebuildSlots(plan, busyTimes) });
  }

  /**
   * Legger tidene skjemaet lager til dem som alt står der, og rører ingen av
   * dem. Dette er veien til en samtale lenger fram: uke 39 blir stående med
   * elevene sine, og uke 40 kommer i tillegg, tom. De som ikke har fått tid
   * står nedenfor som før, og kan velges i en av de nye tidene.
   *
   * «Lag tidene» gjør det motsatte — bygger hele oppsettet på nytt fra skjemaet
   * — og det er fortsatt riktig når lengden eller arbeidsdagen er endret. Men
   * det var før den eneste veien, og da kastet et bytte av uke uke 39 og tok
   * navnene med seg til uke 40.
   */
  function appendSlots() {
    if (!plan || pendingCount === 0) return;
    update({ ...plan, slots: pending });
  }

  /**
   * Setter elevene inn i de ledige tidene — og hopper over dem læreren alt er
   * opptatt i en annen klasse. Fordelingen så før bare sitt eget oppsett, og
   * satte glatt en familie i 7A oppå en i 5B; kollisjonen kom fram etterpå, som
   * et varsel om noe som allerede var avtalt.
   */
  function distribute() {
    if (!plan) return;
    update({
      ...plan,
      slots: fillSlots(plan.slots, students.map((s) => s.id), busyTimes),
    });
  }

  /**
   * Tømmer fordelingen, bortsett fra de holdte samtalene. «Start på nytt» kan
   * ikke bety at samtalene læreren har hatt forsvinner ut av oversikten.
   */
  function clearStudents() {
    if (!plan) return;
    update({
      ...plan,
      slots: plan.slots.map((s) => (s.done ? s : { ...s, student_id: null })),
    });
  }

  /** Rydder bort tidene ingen skal ha, så arket blir kort nok til å henge opp. */
  function dropFree() {
    if (!plan) return;
    update({
      ...plan,
      slots: plan.slots.filter((s) => s.student_id || s.note.trim()),
    });
  }

  /**
   * Skyver hele runden en uke fram eller tilbake — datoene og skjemaet sammen.
   * Dette er handlingen læreren egentlig var ute etter da hen endret uka og
   * fikk se at ingenting flyttet seg: en runde som må utsettes, utsettes i sin
   * helhet.
   */
  function shiftWeeks(delta: number) {
    if (!plan) return;
    update({
      ...plan,
      week_start: addDays(plan.week_start, delta * 7) || plan.week_start,
      slots: shiftSlots(plan.slots, delta * 7),
    });
  }

  /**
   * Flytter tidene bort til uka skjemaet står på. Den ene utveien når de to
   * spriker: klokkeslettene, merknadene og elevene følger med, bare datoene
   * skyves. Skjemaet står allerede der, så det røres ikke.
   */
  function moveSlotsToPlanWeek() {
    if (!plan || !slotMonday) return;
    const days = daysBetween(slotMonday, plan.week_start);
    if (days === 0) return;
    update({ ...plan, slots: shiftSlots(plan.slots, days) });
  }

  /** Den andre utveien: skjemaet settes tilbake til uka tidene ligger i. */
  function matchPlanToSlots() {
    if (!slotMonday) return;
    change({ week_start: slotMonday });
  }

  /** Ny tid etter den siste den dagen, ellers først i arbeidsdagen. */
  function addSlot(date: string) {
    if (!plan) return;
    const inDay = slotsForDate(plan.slots, date);
    const last = inDay[inDay.length - 1];
    const start = last
      ? toClock(toMinutes(last.start) + last.minutes + plan.gap)
      : plan.day_start;
    update({
      ...plan,
      slots: [
        ...plan.slots,
        {
          id: newSlotId(),
          date,
          start,
          minutes: plan.minutes,
          student_id: null,
          note: "",
          done: false,
        },
      ],
    });
  }

  /**
   * Én dag til, etter den siste dagen som har tider. Det er slik en runde som
   * ikke fikk plass utvides: en familie som bare kan mandagen etter, trenger
   * ikke et helt nytt oppsett.
   */
  function addDay() {
    const date = nextWeekday(lastDate);
    if (date) addSlot(date);
  }

  function removeSlot(id: string) {
    if (!plan) return;
    update({ ...plan, slots: plan.slots.filter((s) => s.id !== id) });
  }

  function setStudent(slotId: string, studentId: string | null) {
    if (!plan) return;
    update({ ...plan, slots: withStudentAt(plan.slots, slotId, studentId) });
  }

  /** Slutten settes som klokkeslett; lengden er det som faktisk lagres. */
  function setEnd(slot: MeetingSlot, end: string) {
    const minutes = toMinutes(end) - toMinutes(slot.start);
    if (minutes < MIN_MINUTES) return;
    changeSlot(slot.id, { minutes: Math.min(MAX_MINUTES, minutes) });
  }

  function toggleDay(day: number) {
    if (!plan) return;
    const days = plan.days.includes(day)
      ? plan.days.filter((d) => d !== day)
      : [...plan.days, day].sort((a, b) => a - b);
    // Tidene på en dag som slås av blir stående til tidene lages på nytt.
    // Slettet vi dem her, ville et feilklikk tatt med seg en hel dag med
    // avtalte samtaler.
    change({ days });
  }

  async function doDelete() {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteMeetingPlan(id);
      if (draft?.id === id) setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const totalSlots = plan?.slots.length ?? 0;
  const usedSlots = plan?.slots.filter((s) => s.student_id).length ?? 0;
  /** Samtalene som er holdt. De telles for seg: det er dem læreren kan stryke. */
  const heldSlots = plan?.slots.filter((s) => s.done).length ?? 0;

  if (activeStudents.length === 0) {
    return (
      <p className="text-sm text-muted">
        Legg inn elevene i klassen først — det er navnene deres som settes inn i tidene.
      </p>
    );
  }

  /**
   * Én dagsspalte med tidene sine.
   *
   * En vanlig funksjon som gir JSX, ikke en komponent inni komponenten: en
   * nestet komponent er en ny type for hver tegning, og React river da spalta
   * ned og bygger den opp igjen — midt i et klokkeslett læreren skriver.
   */
  function dayColumn(date: string) {
    if (!plan) return null;
    const inDay = slotsForDate(plan.slots, date);
    const label = dayLabel(date);

    return (
      <section
        key={date}
        className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-2.5"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-sm font-semibold">{label}</h3>
          <SlotCount used={inDay.filter((s) => s.student_id).length} total={inDay.length} />
        </div>

        {inDay.length === 0 ? (
          <p className="text-xs text-subtle">Ingen tider denne dagen.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {inDay.map((slot) => {
              const student = slot.student_id ? byId.get(slot.student_id) : undefined;
              const unknown = Boolean(slot.student_id) && !student;
              // En holdt samtale er ikke en plan lenger, og feltene låses.
              // Haken står igjen som veien tilbake: tas den av, er tida til å
              // redigere igjen. Uten låsen kunne et uhell i en nedtrekksliste
              // ha flyttet en samtale som faktisk har vært.
              const done = slot.done;
              const holdt = `Samtalen ${slot.start} ${label} er holdt`;
              // Hva tida kolliderer med i en annen klasse. Ramma holdes lik den
              // vanlige kollisjonen, men uten fyll: den andre samtalen ligger
              // ikke i dette oppsettet, og er ikke noe læreren kan rette her.
              const opptatt = crossed.get(slot.id);
              // Rødt bare når tida gjelder noen: da er det to samtaler på én
              // lærer, og noe å rette. En ledig tid som er opptatt i en annen
              // klasse er ingen feil — den er bare ikke å bruke, og fordelingen
              // lar den stå.
              const kollisjon = Boolean(opptatt) && Boolean(slot.student_id || slot.note.trim());
              return (
                <li
                  key={slot.id}
                  className={`flex flex-col gap-1 rounded-lg border px-2 py-1.5 ${
                    clashes.has(slot.id)
                      ? "border-danger bg-danger-soft"
                      : kollisjon
                        ? "border-danger bg-surface-raised"
                        : done
                          ? "border-accent/40 bg-accent-soft"
                          : slot.student_id
                            ? "border-border bg-surface-raised"
                            : "border-dashed border-border bg-surface-raised"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <input
                      type="time"
                      step={300}
                      value={slot.start}
                      disabled={done}
                      onChange={(e) => changeSlot(slot.id, { start: e.target.value })}
                      aria-label={`Starter, ${label}`}
                      className={`${inputClassSm} w-[6.5rem] tabular-nums`}
                    />
                    <span className="text-xs text-subtle" aria-hidden>
                      –
                    </span>
                    <input
                      type="time"
                      step={300}
                      value={slotEnd(slot)}
                      disabled={done}
                      onChange={(e) => setEnd(slot, e.target.value)}
                      aria-label={`Slutter, ${label}`}
                      className={`${inputClassSm} w-[6.5rem] tabular-nums`}
                    />
                    <button
                      type="button"
                      onClick={() => removeSlot(slot.id)}
                      disabled={done}
                      aria-label={`Fjern tida ${slot.start} ${label}`}
                      title={done ? "Ta av haken for å kunne fjerne tida" : "Fjern tida"}
                      className="ml-auto rounded p-1 text-subtle hover:bg-danger-soft hover:text-danger disabled:pointer-events-none disabled:opacity-40"
                    >
                      <svg
                        viewBox="0 0 16 16"
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden
                      >
                        <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={slot.student_id ?? ""}
                      disabled={done}
                      onChange={(e) => setStudent(slot.id, e.target.value || null)}
                      aria-label={`Elev ${slot.start} ${label}`}
                      className={`${inputClassSm} min-w-0 flex-1`}
                    >
                      <option value="">— ledig —</option>
                      {unknown && (
                        // Eleven er slettet i en eldre utgave av lagringen. Vises
                        // som valg, ellers ville feltet stått tomt samtidig som
                        // tida var opptatt.
                        <option value={slot.student_id ?? ""}>{UNKNOWN}</option>
                      )}
                      {/* Eleven som står i tida er alltid med, også når hen hører
                          til en annen kontaktlærer enn den oppsettet gjelder —
                          ellers ville feltet stått tomt for en opptatt tid. */}
                      {(student && !students.includes(student)
                        ? [student, ...students]
                        : students
                      ).map((s) => {
                        const at = placedIn.get(s.id);
                        const elsewhere = at && at.id !== slot.id;
                        // Står eleven i en samtale som er holdt, er navnet
                        // ikke å flytte hit. Valget er avslått og ikke bare
                        // virkningsløst: et navn som ikke gjør noe når det
                        // velges ser ut som en feil.
                        return (
                          <option key={s.id} value={s.id} disabled={Boolean(elsewhere && at.done)}>
                            {s.name}
                            {elsewhere ? ` · ${placedLabel(at)}${at.done ? " · hatt" : ""}` : ""}
                          </option>
                        );
                      })}
                    </select>

                    {/* Haken vises først når tida gjelder noen: «hatt» om en
                        tom rad i skjemaet betyr ingenting. */}
                    {(slot.student_id || slot.note.trim() || done) && (
                      <label
                        className={`flex shrink-0 cursor-pointer items-center gap-1 text-[11px] ${
                          done ? "font-medium text-accent-text" : "text-muted"
                        }`}
                        title={
                          done
                            ? "Samtalen er holdt. Tida står fast, og flyttes verken av en ny fordeling eller av at runden utsettes."
                            : "Kryss av når samtalen er holdt. Tida blir stående der den er."
                        }
                      >
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={(e) => changeSlot(slot.id, { done: e.target.checked })}
                          aria-label={holdt}
                          className="h-3.5 w-3.5 accent-[var(--accent)]"
                        />
                        Hatt
                      </label>
                    )}
                  </div>

                  {(showNotes || slot.note.trim()) && (
                    <input
                      value={slot.note}
                      onChange={(e) => changeSlot(slot.id, { note: e.target.value })}
                      placeholder="Merknad, f.eks. pause"
                      aria-label={`Merknad ${slot.start} ${label}`}
                      className={inputClassSm}
                    />
                  )}

                  {/* Hvilket oppsett tida krasjer med står på tida selv. En
                      rød ramme alene ville fortalt at noe er galt uten å si
                      hvor læreren skal lete. */}
                  {opptatt && (
                    <p
                      className={`text-[11px] leading-tight ${
                        kollisjon ? "text-danger" : "text-muted"
                      }`}
                    >
                      Opptatt: {opptatt.join(", ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <button type="button" onClick={() => addSlot(date)} className={ghostButton("sm")}>
          + Legg til tid
        </button>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* --- Oppsettene klassen har --- */}
      <div
        data-print-hide
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface px-3 py-2.5"
      >
        {meetingPlans.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {meetingPlans.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setDraft(m);
                  setSaved(true);
                }}
                aria-pressed={m.id === plan?.id}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                  m.id === plan?.id
                    ? "border-accent bg-accent-soft text-accent-text"
                    : "border-border bg-surface-raised hover:border-border-strong"
                }`}
              >
                {m.name || kindLabel(m.kind)}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {MEETING_KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              onClick={() => newPlan(k.kind)}
              disabled={busy}
              title={k.hint}
              className={ghostButton("sm")}
            >
              + {k.label}r
            </button>
          ))}
        </div>

        <HelpTip label="Hva er et samtaleoppsett?">
          Et oppsett er én runde med samtaler — for eksempel utviklingssamtalene i høst. Du setter
          en arbeidsuke med tider, fordeler elevene på dem, og skriver ut oversikten. Oppsettet blir
          liggende, så du finner det igjen når noen spør hvilken tid de fikk.
        </HelpTip>
      </div>

      {!plan ? (
        <p className="text-sm text-muted">
          Ingen samtaler satt opp ennå. Velg «+ Elevsamtaler» eller «+ Utviklingssamtaler» over, så
          får du en arbeidsuke med tider du kan fordele elevene på.
        </p>
      ) : (
        <>
          {/* --- Skjemaet tidene lages av --- */}
          <div
            data-print-hide
            className="flex flex-col gap-4 rounded-xl border border-border bg-surface px-3 py-3"
          >
            <FieldGroup title="Samtalen">
              {/* Navnet trenger en bunn å stå på: med `min-w-0` alene ble feltet
                  presset ned til tre bokstaver ved siden av «Type» på en telefon. */}
              <label className="min-w-[12rem] flex-1">
                <span className="mb-1 block text-xs text-muted">Navn på oppsettet</span>
                <input
                  value={plan.name}
                  onChange={(e) => change({ name: e.target.value })}
                  placeholder="Utviklingssamtaler høst"
                  className={inputClass}
                />
              </label>

              <label>
                <span className="mb-1 block text-xs text-muted">Type</span>
                <select
                  value={plan.kind}
                  onChange={(e) => {
                    const kind = e.target.value as MeetingKind;
                    // Typen bærer lengden: velger læreren utviklingssamtale,
                    // er det halvtimene hen er ute etter.
                    change({ kind, minutes: defaultMinutes(kind) });
                  }}
                  className={inputClass}
                >
                  {MEETING_KINDS.map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <span className="mb-1 flex items-center gap-1 text-xs text-muted">
                  <label htmlFor={teacherId}>Kontaktlærer</label>
                  <HelpTip label="Hva gjør valget av kontaktlærer?">
                    Velger du en kontaktlærer, er det bare elevene som har hen som kontaktlærer som
                    settes opp og fordeles. Det bestemmes av feltet «Kontaktlærer» på eleven, under
                    <strong className="text-foreground"> Elever</strong> i menyen. Har ingen elever
                    fått en kontaktlærer ennå, er «Alle i klassen» det eneste valget.
                  </HelpTip>
                </span>
                <select
                  id={teacherId}
                  value={plan.teacher}
                  onChange={(e) => change({ teacher: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Alle i klassen</option>
                  {teachers.map((navn) => (
                    <option key={navn} value={navn}>
                      {navn}
                    </option>
                  ))}
                  {/* Læreren kan ha mistet elevene sine siden oppsettet ble
                      laget. Valget må likevel stå, ellers ville lista hoppet
                      tilbake til «alle i klassen» uten at noen ba om det. */}
                  {plan.teacher.trim() &&
                    !teachers.some((n) => teacherKey(n) === teacherKey(plan.teacher)) && (
                      <option value={plan.teacher}>{plan.teacher} (ingen elever)</option>
                    )}
                </select>
              </div>
            </FieldGroup>

            <FieldGroup
              title="Oppskrift på nye tider"
              hint={
                <>
                  Feltene her er bare en oppskrift: de bestemmer hvilke tider{" "}
                  <strong className="text-muted">«Legg til tider»</strong> lager. De flytter ingen
                  tid som alt står i oversikten under: setter du uka lenger fram, kommer den uka i
                  tillegg, og elevene du alt har satt opp blir stående.
                </>
              }
            >
              <div>
                <span className="mb-1 flex items-center gap-1 text-xs text-muted">
                  <label htmlFor={weekId}>Lag tider fra uke</label>
                  <HelpTip label="Hva gjør uke-feltet?">
                    Uka sier hvor <strong className="text-foreground">nye</strong> tider lages, og
                    flytter ingen tid som alt står i oversikten — de har sin egen dato, og kan være
                    avtalt med noen. Skal du sette opp en samtale lenger fram, setter du uka hit og
                    trykker <strong className="text-foreground">«Legg til tider»</strong>: uka
                    kommer i tillegg, og elevene du alt har satt opp blir stående. Treffer du en
                    annen ukedag i kalenderen, starter oppsettet på mandagen i den uka.
                  </HelpTip>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => change({ week_start: addDays(plan.week_start, -7) })}
                    aria-label="Uka før"
                    title="Uka før"
                    className="rounded-md border border-border bg-surface-raised px-2 py-2 text-muted hover:bg-background hover:text-foreground"
                  >
                    ‹
                  </button>
                  <input
                    id={weekId}
                    type="date"
                    value={plan.week_start}
                    onChange={(e) => {
                      // Et tomt felt er ingen uke å lage tider i. Da beholder vi
                      // den forrige i stedet for å stå igjen uten skjema.
                      const monday = mondayOf(e.target.value);
                      if (monday) change({ week_start: monday });
                    }}
                    className={`${inputClass} w-40`}
                  />
                  <button
                    type="button"
                    onClick={() => change({ week_start: addDays(plan.week_start, 7) })}
                    aria-label="Uka etter"
                    title="Uka etter"
                    className="rounded-md border border-border bg-surface-raised px-2 py-2 text-muted hover:bg-background hover:text-foreground"
                  >
                    ›
                  </button>
                  <span className="ml-1 whitespace-nowrap text-xs font-medium text-accent-text">
                    {weekLabel(plan.week_start)}
                  </span>
                </div>
              </div>

              <label>
                <span className="mb-1 block text-xs text-muted">Antall uker</span>
                <select
                  value={plan.weeks}
                  onChange={(e) => change({ weeks: Number(e.target.value) || 1 })}
                  className={`${inputClass} w-28`}
                >
                  {Array.from({ length: MAX_WEEKS }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {plural(n, "uke", "uker")}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-1 block text-xs text-muted">Fra</span>
                <input
                  type="time"
                  step={300}
                  value={plan.day_start}
                  onChange={(e) => change({ day_start: e.target.value })}
                  className={`${inputClass} w-28`}
                />
              </label>

              <label>
                <span className="mb-1 block text-xs text-muted">Til</span>
                <input
                  type="time"
                  step={300}
                  value={plan.day_end}
                  onChange={(e) => change({ day_end: e.target.value })}
                  className={`${inputClass} w-28`}
                />
              </label>

              <label>
                <span className="mb-1 block text-xs text-muted">Lengde</span>
                <span className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={MIN_MINUTES}
                    max={MAX_MINUTES}
                    step={5}
                    value={plan.minutes}
                    onChange={(e) =>
                      change({
                        minutes: Math.min(
                          MAX_MINUTES,
                          Math.max(MIN_MINUTES, Number(e.target.value) || MIN_MINUTES)
                        ),
                      })
                    }
                    className={`${inputClass} w-20`}
                  />
                  <span className="text-xs text-subtle">min</span>
                </span>
              </label>

              <label>
                <span className="mb-1 block text-xs text-muted">Pause mellom</span>
                <span className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={MAX_GAP}
                    step={5}
                    value={plan.gap}
                    onChange={(e) =>
                      change({
                        gap: Math.min(MAX_GAP, Math.max(0, Number(e.target.value) || 0)),
                      })
                    }
                    className={`${inputClass} w-20`}
                  />
                  <span className="text-xs text-subtle">min</span>
                </span>
              </label>

              <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-1.5">
                <legend className="sr-only">Ukedager</legend>
                <span className="text-xs text-muted">Dager</span>
                {WEEKDAYS.map((d) => (
                  <label key={d.day} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={plan.days.includes(d.day)}
                      onChange={() => toggleDay(d.day)}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                    {d.name}
                  </label>
                ))}
              </fieldset>
            </FieldGroup>

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              {/* To ulike handlinger, ikke én knapp med to utfall. Å legge til
                  er det vanlige når det alt står tider der — en runde som
                  strekker seg over to uker settes opp uke for uke — mens å
                  bygge alt på nytt hører til når lengden eller arbeidsdagen er
                  endret. Da må den siste be om bekreftelse, og den første ikke. */}
              {totalSlots === 0 ? (
                <button type="button" onClick={rebuild} className={primaryButton("sm")}>
                  Lag tidene
                </button>
              ) : (
                <button
                  type="button"
                  onClick={appendSlots}
                  disabled={pendingCount === 0}
                  title={
                    pendingCount === 0
                      ? "Skjemaet gir ingen nye tider — de ligger der alt"
                      : `Legg til ${plural(pendingCount, "tid", "tider")} uten å røre dem som står der`
                  }
                  className={primaryButton("sm")}
                >
                  + Legg til tider i {planSpan}
                </button>
              )}
              <button
                type="button"
                onClick={distribute}
                disabled={unplaced.length === 0}
                title={
                  unplaced.length === 0
                    ? "Alle elevene har fått en tid"
                    : "Sett elevene inn i de ledige tidene"
                }
                className={secondaryButton("sm")}
              >
                Fordel elevene
              </button>
              <button
                type="button"
                onClick={dropFree}
                disabled={totalSlots === usedSlots}
                title="Fjern tidene ingen skal ha, så oppsettet blir kortere. Utskriften tar uansett bare med tidene som gjelder noen."
                className={secondaryButton("sm")}
              >
                Fjern ledige tider
              </button>

              {totalSlots > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmRebuild(true)}
                  title="Bygg hele oppsettet på nytt fra skjemaet. Tider du har flyttet for hånd forsvinner."
                  className={`${ghostButton("sm")} hover:text-danger`}
                >
                  Lag alle tidene på nytt
                </button>
              )}

              <button
                type="button"
                onClick={clearStudents}
                disabled={usedSlots === heldSlots}
                title={
                  heldSlots > 0
                    ? "Tømmer fordelingen. Samtalene du har krysset av som holdt blir stående."
                    : "Tømmer fordelingen, så du kan begynne på nytt"
                }
                className={`${ghostButton("sm")} hover:text-danger`}
              >
                Tøm fordelingen
              </button>

              <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={showNotes}
                  onChange={(e) => setShowNotes(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
                Vis merknader
              </label>
              <button
                type="button"
                onClick={() => setPendingDelete(plan)}
                className={`${ghostButton("sm")} hover:text-danger`}
              >
                Slett oppsettet
              </button>
            </div>
          </div>

          {/* --- Status --- */}
          <div data-print-hide className="flex flex-wrap items-center gap-3 text-xs">
            {/* «fordelt på 1 uke» sto her før, rett under et skjema der det sto
                «2 uker» — to tall om det samme ordet som ikke var det samme. Nå
                står ukenummeret, som er det læreren kan kjenne igjen. */}
            <span className="text-subtle" role="status">
              {students.length - unplaced.length} av {plural(students.length, "elev", "elever")} satt
              opp
              {plan.teacher.trim() ? ` hos ${plan.teacher}` : " i klassen"} ·{" "}
              {plural(totalSlots, "tid", "tider")}
              {weekSpan ? ` i ${weekSpan}` : ""}
              {heldSlots > 0 ? ` · ${heldSlots} holdt` : ""}
            </span>
            <span className={saved ? "text-subtle" : "text-accent-text"}>
              {saved ? "Lagret" : "Lagrer …"}
            </span>
          </div>

          {/* --- Ut av appen ---
              Tre veier ut av de samme tidene, samlet ett sted fordi de gjøres i
              samme åndedrag når uka er satt opp: arket på veggen, lappene hjem,
              og avtalene i lærerens egen kalender. */}
          {usedSlots > 0 && (
            <div
              data-print-hide
              className="flex flex-wrap items-center gap-2 border-t border-border pt-3"
            >
              <span className="text-xs text-subtle">Ta med ut</span>
              <button
                type="button"
                onClick={() => setPrintJob((j) => ({ mode: "uke", n: (j?.n ?? 0) + 1 }))}
                title="Hele runden på ett ark, til veggen i klasserommet"
                className={secondaryButton("sm")}
              >
                Skriv ut ukeoversikt
              </button>
              <button
                type="button"
                onClick={() => setPrintJob((j) => ({ mode: "lapper", n: (j?.n ?? 0) + 1 }))}
                title="En lapp per elev, til å klippe fra hverandre og sende hjem"
                className={secondaryButton("sm")}
              >
                Skriv ut lapper
              </button>
              <button
                type="button"
                onClick={downloadCalendar}
                title="Samtalene som kalenderfil, til å åpne i din egen kalender. Ingenting sendes noe sted."
                className={secondaryButton("sm")}
              >
                Last ned kalenderfil
              </button>
              <span className="text-xs text-subtle">
                Lappene og kalenderfila tar med {plural(usedSlots, "samtale", "samtaler")}.
              </span>
            </div>
          )}

          {/* Skjemaet peker et annet sted enn tidene ligger. Det er lov — nye
              tider kan godt lages i uka etter — men det skal ikke være noe
              læreren må gjette seg til av to ukenumre som ikke stemmer. */}
          {outOfSync && (
            <div
              role="status"
              data-print-hide
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-xs text-foreground"
            >
              <span>
                Skjemaet lager nye tider fra{" "}
                <strong>{weekLabel(plan.week_start).toLowerCase()}</strong>, men tidene under ligger
                i <strong>{weekSpan}</strong>. Skal runden strekke seg over begge, trykker du{" "}
                <strong>«Legg til tider i {planSpan}»</strong> over — da kommer uka i tillegg, og
                tidene under beholder elevene sine.
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={moveSlotsToPlanWeek}
                  title="Flytt alle tidene, med elever og merknader, til uka skjemaet står på"
                  className={secondaryButton("sm")}
                >
                  Flytt tidene til {weekLabel(plan.week_start).toLowerCase()}
                </button>
                <button
                  type="button"
                  onClick={matchPlanToSlots}
                  title="Sett skjemaet tilbake til uka tidene ligger i"
                  className={ghostButton("sm")}
                >
                  Sett skjemaet til {weekSpan.split("–")[0]}
                </button>
              </span>
            </div>
          )}

          {foreign > 0 && (
            <p
              role="status"
              data-print-hide
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted"
            >
              {plural(foreign, "tid er", "tider er")} satt av til elever som har en annen
              kontaktlærer. De blir stående — de kan være avtalt — men telles ikke med over.
            </p>
          )}

          {clashes.size > 0 && (
            <p
              role="status"
              data-print-hide
              className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-1.5 text-xs text-danger"
            >
              To eller flere tider ligger oppå hverandre. De er merket med rødt under.
            </p>
          )}

          {/* Kollisjon med en annen klasse er den læreren ikke kan se noe sted:
              oppsettene settes opp hver for seg, men kontaktlæreren har bare én
              tirsdag. Varselet står her, over tidene, og navnet på det andre
              oppsettet står på tida selv. */}
          {crossedUsed.length > 0 && (
            <p
              role="status"
              data-print-hide
              className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-1.5 text-xs text-danger"
            >
              {plural(crossedUsed.length, "tid ligger", "tider ligger")} oppå en samtale i et annet
              oppsett. De er merket under, med hvilket. Hele bildet står i{" "}
              <strong>Alle klasser</strong>.
            </p>
          )}

          {/* Hvilke andre oppsett som regnes som opptatt tid. Lista står her,
              ved tidene og fordelinga den styrer, og ikke bare i «Alle klasser»:
              det var der læreren haket bort en klasse og kom tilbake hit til det
              samme varselet. Avhukinga er den samme de to stedene. */}
          {otherPlans.length > 0 && (
            <div data-print-hide className="flex flex-col gap-1.5">
              <p className="text-xs text-muted">
                Tar hensyn til disse rundene: fordelingen hopper over tidene du er opptatt i
                dem.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {otherPlans.map((other) => (
                  <label
                    key={other.id}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                      ignoredPlans.has(other.id)
                        ? "border-border text-muted"
                        : "border-accent/40 bg-accent-soft"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!ignoredPlans.has(other.id)}
                      onChange={() => toggleIgnoredPlan(other.id)}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                    {other.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* --- Ukene --- */}
          <div data-print-hide className="flex flex-col gap-4">
            {weeks.length === 0 && (
              <p className="text-sm text-muted">
                Ingen tider ennå. Trykk «Lag tidene» for å fylle uka fra skjemaet over.
              </p>
            )}

            {/* Å skyve hele runden står her, ved tidene den flytter, og ikke
                blant skjemaknappene: der sto to knapper som het «uke» rett ved
                to felt som også het «uke», og bare én av dem flyttet noe.
                Spriker skjemaet og tidene, viker raden for varselet over — to
                linjer om uke 38 rett etter hverandre er ingen hjelp. */}
            {weeks.length > 0 && !outOfSync && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>
                  Hele runden ligger i {weekSpan}. Skal den utsettes?
                  {heldSlots > 0 ? " Samtalene du har hatt blir stående." : ""}
                </span>
                <button
                  type="button"
                  onClick={() => shiftWeeks(-1)}
                  title="Flytt alle tidene, og skjemaet, en uke tilbake"
                  className={secondaryButton("sm")}
                >
                  ‹ En uke tidligere
                </button>
                <button
                  type="button"
                  onClick={() => shiftWeeks(1)}
                  title="Flytt alle tidene, og skjemaet, en uke fram"
                  className={secondaryButton("sm")}
                >
                  En uke senere ›
                </button>
              </div>
            )}

            {weeks.map(({ monday, dates }) => (
              <section key={monday} className="flex flex-col gap-2">
                <h2 className="flex flex-wrap items-baseline gap-2 border-b border-border pb-1">
                  <span className="text-sm font-semibold">{weekLabel(monday)}</span>
                  <span className="text-xs text-subtle">{rangeLabel(dates)}</span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                  {dates.map((date) => dayColumn(date))}
                </div>
              </section>
            ))}

            {totalSlots > 0 && (
              <div>
                <button type="button" onClick={addDay} className={secondaryButton("sm")}>
                  + Legg til dagen etter
                </button>
                {/* Dagsnavnet ender alt på punktum («tirsdag 6. okt.»), så
                    setninga får ikke ett til. */}
                <span className="ml-2 text-xs text-subtle">
                  Får ikke alle plass? Legg på {dayLabel(nextWeekday(lastDate)).toLowerCase()}
                </span>
              </div>
            )}
          </div>

          {unplaced.length > 0 && (
            <section
              data-print-hide
              className="rounded-xl border border-dashed border-border bg-surface p-3"
            >
              <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                Ikke satt opp
                <span className="ml-1.5 font-normal normal-case tabular-nums">
                  ({unplaced.length})
                </span>
              </h2>
              <p className="mb-2 text-xs text-subtle">
                {totalSlots - usedSlots === 0
                  ? "Det er ingen ledige tider igjen. Legg til en dag under, eller flere uker i skjemaet."
                  : "Trykk «Fordel elevene», eller velg dem i en ledig tid."}
              </p>
              <ul className="flex flex-wrap gap-1">
                {unplaced.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-md border border-border bg-surface-raised px-2 py-1 text-sm"
                  >
                    {s.name}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* --- Arket. Egen blokk, ikke redigeringen med feltene skrudd av:
              på papiret er det navnet og tida som er hele poenget, og en side
              full av nedtrekkslister og «fjern»-kryss er ikke til å lese.

              Arket er en **ukesvisning**: én rad med fem dagsbokser, og i hver
              boks en tett liste — «Anna Oline: 10:15–10:45». Hver tid hadde en
              rute for seg før, og da tok fem samtaler hele siden uten å si mer
              enn fem linjer gjør. Liggende A4 er gitt av utskriftsreglene, og
              det er formatet en uke skal leses i.

              Blokka tas helt ut av dokumentet når lappene skal skrives ut, og
              skjules ikke bare med CSS: utskriftsreglene finner arket med
              `main:has([data-print-sheet])`, og `:has` bryr seg ikke om
              `display`. Sto den igjen, ville lappene fått arkets sidehøyde. --- */}
          {printMode === "uke" && (
          <div
            data-print-sheet
            className="hidden print:flex print:flex-col"
            style={{ fontSize: `${sheet.font}px` }}
          >
            <header className="mb-[0.5em] border-b-2 border-foreground pb-[0.35em] text-center">
              <p className="text-[1.7em] font-bold leading-tight">
                {plan.name || kindLabel(plan.kind)} – {activeClass?.name}
              </p>
              <p className="mt-[0.15em] text-[1em] leading-tight text-muted">
                {plan.teacher.trim() ? `${plan.teacher} · ` : ""}
                {plural(plan.minutes, "minutt", "minutter")} per samtale
                {sheet.span ? ` · ${sheet.span}` : ""}
                {/* Tegnforklaringa står bare når den trengs: et «✓ = hatt» over
                    en runde ingen har krysset av i er en linje som forvirrer. */}
                {sheetHeld ? " · ✓ = hatt" : ""}
              </p>
            </header>

            {sheet.weeks.map(({ monday, dates }) => (
              // `flex-1` er det som fyller arket: ukene deler sidehøyden mellom
              // seg og dagsboksene deler uka. Innholdet står tett øverst i hver
              // boks, og det som blir til overs er skriveplass.
              <section key={monday} className="mb-[0.7em] flex flex-1 flex-col last:mb-0">
                {/* Ukenummeret står på arket også: to onsdager ser like ut, og
                    det er den forskjellen foresatte må kunne lese. */}
                <p className="mb-[0.25em] text-[1em] font-semibold leading-tight">
                  {weekLabel(monday)} <span className="font-normal">· {rangeLabel(dates)}</span>
                </p>
                <div
                  className="grid flex-1 gap-[0.45em]"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(1, dates.length)}, minmax(0, 1fr))`,
                  }}
                >
                  {dates.map((date) => (
                    <div
                      key={date}
                      className="flex flex-col overflow-hidden rounded border border-border-strong"
                    >
                      <h2 className="border-b border-border-strong bg-background px-[0.5em] py-[0.3em] text-[1em] font-semibold leading-tight">
                        {dayLabel(date)}
                      </h2>
                      <ul className="flex flex-col px-[0.5em] py-[0.35em]">
                        {slotsForDate(sheet.slots, date).map((slot) => {
                          const student = slot.student_id ? byId.get(slot.student_id) : undefined;
                          const navn = student?.name ?? (slot.student_id ? UNKNOWN : "");
                          const note = slot.note.trim();
                          // En tid uten elev er enten en merknad læreren har
                          // satt av — «Møte med PPT» — eller, når ingen er
                          // fordelt ennå, en åpen tid. Da står tida alene; et
                          // «ledig:» foran hver linje sa ingenting.
                          const hvem = navn || note;
                          return (
                            <li
                              key={slot.id}
                              className="truncate py-[0.12em] text-[1em] leading-tight"
                            >
                              {/* Haken «Hatt» sto bare på skjermen, og det er
                                  nettopp den lista læreren tar med seg inn i
                                  samtaleuka: hen må kunne se hvem som gjenstår
                                  uten å ha maskinen oppe. Merket får sin egen
                                  kolonne — står det rett foran navnet, kommer
                                  navnene i ulik avstand fra kanten og lista blir
                                  tyngre å lese enn den tjener på. */}
                              <span
                                aria-hidden="true"
                                className="inline-block w-[1.1em] font-bold"
                              >
                                {slot.done ? "✓" : ""}
                              </span>
                              {hvem && <span className="font-medium">{hvem}: </span>}
                              <span className="tabular-nums">
                                {slot.start}–{slotEnd(slot)}
                              </span>
                              {/* Merknaden på en tid som *også* har en elev —
                                  «på Teams», «tolk» — sto ikke på arket før. */}
                              {navn && note && (
                                <span className="text-muted"> ({note})</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {/* Hvem som ennå ikke har fått en tid hører hjemme på arket: det er
                dem læreren må ringe, og lista sto bare på skjermen. */}
            {unplaced.length > 0 && (
              <p className="mt-[0.4em] border-t border-border pt-[0.3em] text-[0.95em] leading-snug text-muted">
                <span className="font-semibold text-foreground">
                  Uten tid ({unplaced.length}):
                </span>{" "}
                {unplaced.map((s) => s.name).join(", ")}
              </p>
            )}
          </div>
          )}

          {/* --- Lappene. En rute per elev, til å klippe fra hverandre og
              sende hjem.

              Ukeoversikten henges opp; lappen går i sekken. Derfor står bare
              den ene samtalen på hver: dagen, datoen, klokkeslettet og
              klassen. Ingen andre elevers navn — lappen forlater skolen, og
              det eneste barnet som skal stå på den er det som får den med seg.

              Tider uten elev er ikke med. En lapp som sier «ledig» har ingen
              å gå hjem til. --- */}
          {printMode === "lapper" && (
            <div data-print-notes className="hidden print:grid print:grid-cols-3 print:gap-2">
              {notes.map((slot) => (
                <article
                  key={slot.id}
                  // Stiplet ramme er klippelinja. Hel ramme så ut som en
                  // innramming av lappen, og da klippet lærerne rundt den.
                  // Lappene får samme høyde, så klippelinjene står i rett
                  // linje tvers over arket. Med høyden gitt av innholdet fikk
                  // en lapp med merknad en centimeter mer enn naboen, og saksa
                  // måtte finne en ny linje for hver rad.
                  className="flex min-h-[3.4cm] break-inside-avoid flex-col gap-1 rounded border border-dashed border-foreground/50 p-3"
                >
                  <p className="text-[10px] uppercase tracking-wide text-muted">
                    {kindLabel(plan.kind)}
                    {activeClass?.name ? ` · ${activeClass.name}` : ""}
                  </p>
                  <p className="text-base font-bold leading-tight">
                    {byId.get(slot.student_id ?? "")?.name ?? UNKNOWN}
                  </p>
                  <p className="text-sm leading-tight">
                    {dayLabel(slot.date)} · {weekLabel(slot.date).toLowerCase()}
                  </p>
                  <p className="text-lg font-bold tabular-nums leading-tight">
                    {slot.start}–{slotEnd(slot)}
                  </p>
                  {slot.note.trim() && (
                    <p className="text-xs leading-snug text-muted">{slot.note.trim()}</p>
                  )}
                  {plan.teacher.trim() && (
                    <p className="mt-auto pt-1 text-[10px] text-muted">{plan.teacher}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {confirmRebuild && plan && (
        <ConfirmDialog
          title="Lage tidene på nytt?"
          body={
            <>
              Alle tidene i oppsettet settes opp på nytt fra skjemaet — {weekLabel(plan.week_start)}{" "}
              og {plural(plan.weeks, "uke", "uker")} fram — og tider du har flyttet for hånd eller
              skrevet merknad på forsvinner. Elevene som står oppført beholder ukedagen sin: den som
              skulle tirsdag får tirsdag, også om tidene nå lages i en annen uke.
              {heldSlots > 0 && (
                <>
                  {" "}
                  De {heldSlots} samtalene du har krysset av som holdt står fast, på dagen og
                  klokkeslettet de hadde.
                </>
              )}
              <br />
              <br />
              Skal du bare ha med en uke til, er det{" "}
              <strong>«Legg til tider i {planSpan}»</strong> du er ute etter. Den lar tidene som
              står være i fred.
            </>
          }
          confirmLabel="Lag tidene"
          onConfirm={rebuild}
          onCancel={() => setConfirmRebuild(false)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Slette ${pendingDelete.name || kindLabel(pendingDelete.kind)}?`}
          body={
            <>
              Hele oppsettet med tidene slettes. Elevene, klassekartene og de andre oppsettene
              beholdes.
            </>
          }
          confirmLabel="Slett oppsettet"
          onConfirm={doDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
