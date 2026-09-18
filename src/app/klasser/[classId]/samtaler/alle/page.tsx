"use client";

import MeetingOverview from "@/components/MeetingOverview";

/**
 * Alle samtalerundene i én uke, på tvers av klassene. Egen adresse under
 * samtalene, av samme grunn som spørsmålene: en bryter i planleggeren ville
 * latt begge visningene ligge i dokumentet samtidig, og utskriftsreglene
 * finner arket med `:has` uten å bry seg om hva som er skjult.
 */
export default function AllMeetingsPage() {
  return <MeetingOverview />;
}
