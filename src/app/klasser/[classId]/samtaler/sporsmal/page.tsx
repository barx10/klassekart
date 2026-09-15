"use client";

import MeetingQuestions from "@/components/MeetingQuestions";

/**
 * Forslag til spørsmål i elevsamtaler og utviklingssamtaler. Egen adresse
 * under samtalene, så listen kan bokmerkes og åpnes rett før samtalen —
 * se `layout.tsx` for hvorfor fanene er ruter og ikke en bryter.
 */
export default function MeetingQuestionsPage() {
  return <MeetingQuestions />;
}
