"use client";

import MeetingPlanner from "@/components/MeetingPlanner";

/**
 * Planlegginga av samtalene: skjemaet, tidene og arket. Tynn side, som
 * klasserommet — alt arbeidet ligger i `MeetingPlanner`, og overskrifta,
 * underfanene og feilmeldinga i `layout.tsx` over.
 *
 * Egen side og ikke et vindu som gruppene: et samtaleskjema er en uke bredt,
 * og læreren blir sittende i det en stund av gangen. En dialog ville både
 * blitt for trang og lagt seg i veien for utskriften.
 */
export default function MeetingsPage() {
  return <MeetingPlanner />;
}
