import type { MeetingKind } from "./types";

/**
 * Forslag til spørsmål å stille i en samtale.
 *
 * Spørsmålene er **faste og ikke lagrede data**: de hører til programmet slik
 * gruppestørrelsene i `seating.ts` gjør, ikke til klassen. En lærer som endrer
 * på dem ville ventet å finne endringen igjen neste år, og da måtte de vært med
 * i sikkerhetskopien, i formatversjonen og i importen — for en huskeliste ingen
 * har bedt om å kunne skrive om.
 *
 * De to samtaletypene har ulike spørsmål fordi de har ulike deltakere.
 * Elevsamtalen er eleven og kontaktlæreren to og to, og spørsmålene går rett
 * til eleven. I utviklingssamtalen sitter de foresatte ved samme bord, og da er
 * halve poenget å få de tre til å snakke sammen: derfor står det flere spørsmål
 * om hva hjemmet ser, og om hvem som gjør hva etterpå.
 *
 * Merkelappen brukes derfor ulikt i de to settene: i elevsamtalen sier den hva
 * spørsmålet handler om, i utviklingssamtalen hvem det går til. Det er det som
 * er uklart når tre sitter rundt bordet — læreren må vite om hen spør eleven
 * eller de foresatte, og et tema-navn hadde ikke svart på det.
 */

/** Ett forslag: en kort merkelapp, og spørsmålet selv. */
export interface MeetingQuestion {
  /** Hva spørsmålet handler om, eller hvem det går til — «Til foresatte». Kan stå tomt. */
  label?: string;
  /** Spørsmålet slik det kan stilles. */
  text: string;
}

/** En bolk i samtalen — «Trivsel og skolehverdag». */
export interface QuestionGroup {
  title: string;
  questions: MeetingQuestion[];
}

export interface QuestionSet {
  kind: MeetingKind;
  /** Hvem som sitter i samtalen. Det er forskjellen på de to typene. */
  who: string;
  groups: QuestionGroup[];
}

const ELEVSAMTALE: QuestionSet = {
  kind: "elevsamtale",
  who: "Eleven og kontaktlæreren, to og to.",
  groups: [
    {
      title: "Trivsel og skolehverdag",
      questions: [
        {
          label: "Sosialt miljø",
          text: "Hvordan har du det i klassen og i friminuttene? Hvem er du mest sammen med?",
        },
        {
          label: "Trygghet og klassemiljø",
          text: "Er det ro nok i timene til at du får arbeidet? Føler du deg trygg til å rekke opp hånden eller si din mening?",
        },
        {
          label: "Motivasjon og skolehverdag",
          text: "Hva synes du er gøy eller mestrende på skolen for tiden, og hva oppleves som mest krevende?",
        },
      ],
    },
    {
      title: "Faglig status og arbeidsvaner",
      questions: [
        {
          label: "Egenvurdering",
          text: "Hvilke fag føler du at du mestrer best, og i hvilke fag trenger du mer støtte eller utfordringer?",
        },
        {
          label: "Innsats og konsentrasjon",
          text: "Hvordan jobber du i timene? Fullfører du oppgaver, og klarer du å holde fokus uten å bli avsporet?",
        },
        {
          label: "Lekser og forberedelser",
          text: "Hvordan fungerer lekselesingen og arbeidet hjemme? Har du gode rutiner og et egnet sted å jobbe?",
        },
      ],
    },
    {
      title: "Mål og tiltak videre",
      questions: [
        {
          label: "Faglige og sosiale mål",
          text: "Hva ønsker du å bli bedre til innen neste samtale — enten faglig, eller knyttet til arbeidsvaner og det sosiale?",
        },
        {
          label: "Lærerens og elevens støtte",
          text: "Hva skal du spesifikt gjøre selv for å nå målet, og hva trenger du at læreren eller skolen hjelper deg med?",
        },
      ],
    },
    {
      title: "Oppsummering",
      questions: [
        {
          text: "Kort oppsummering av de 1–2 viktigste avtalene dere er blitt enige om.",
        },
      ],
    },
  ],
};

const UTVIKLINGSSAMTALE: QuestionSet = {
  kind: "utviklingssamtale",
  who: "Eleven, kontaktlæreren og de foresatte.",
  groups: [
    {
      title: "Trivsel og hjem-skole-samarbeid",
      questions: [
        {
          label: "Til eleven",
          text: "Hvordan trives du på skolen nå?",
        },
        {
          label: "Til foresatte",
          text: "Hvordan opplever dere at barnet trives, sett hjemmefra?",
        },
        {
          label: "Felles",
          text: "Er det noe som skjer hjemme eller på skolen som påvirker skolehverdagen, og som vi bør vite om?",
        },
      ],
    },
    {
      title: "Faglig utvikling",
      questions: [
        {
          label: "Lærer",
          text: "Kort status på faglig utvikling siden forrige samtale.",
        },
        {
          label: "Til eleven",
          text: "Hvilke fag føler du at du mestrer godt? Hvor trenger du mer støtte?",
        },
        {
          label: "Til foresatte",
          text: "Stemmer dette bildet med det dere ser hjemmefra?",
        },
      ],
    },
    {
      title: "Arbeidsvaner og hjemmearbeid",
      questions: [
        {
          label: "Til eleven",
          text: "Hvordan går det med lekser og forberedelser?",
        },
        {
          label: "Til foresatte",
          text: "Hvordan fungerer lekselesing hjemme? Har dere faste rutiner, tid og sted?",
        },
        {
          label: "Til foresatte",
          text: "Klarer barnet å jobbe selvstendig, eller trengs tett oppfølging?",
        },
      ],
    },
    {
      title: "Sosialt miljø og trygghet",
      questions: [
        {
          label: "Til eleven",
          text: "Hvem er du mest sammen med? Føler du deg trygg i klassen?",
        },
        {
          label: "Til foresatte",
          text: "Har dere inntrykk av at barnet har det bra sosialt, både på skolen og på fritiden?",
        },
        {
          label: "Til foresatte",
          text: "Er det noe dere har hørt hjemme som skolen bør kjenne til?",
        },
      ],
    },
    {
      title: "Mål og videre skolegang",
      questions: [
        {
          label: "Til eleven",
          text: "Har du tanker om videre utdanningsvalg? (Relevant fra 8. trinn og oppover.)",
        },
        {
          label: "Felles",
          text: "Hva skal eleven jobbe med fram til neste samtale, faglig eller sosialt?",
        },
      ],
    },
    {
      title: "Ansvarsfordeling og oppfølging",
      questions: [
        { text: "Hva gjør eleven selv?" },
        { text: "Hva følger foresatte opp hjemme?" },
        { text: "Hva bidrar skolen med?" },
      ],
    },
    {
      title: "Oppsummering",
      questions: [
        {
          text: "Kort oppsummering av avtalene, med ansvar tydelig fordelt mellom elev, foresatte og skole.",
        },
      ],
    },
  ],
};

const SETS: QuestionSet[] = [ELEVSAMTALE, UTVIKLINGSSAMTALE];

export function questionsFor(kind: MeetingKind): QuestionSet {
  return SETS.find((s) => s.kind === kind) ?? ELEVSAMTALE;
}

/** Hvor mange spørsmål et sett har — til linja over lista. */
export function questionCount(set: QuestionSet): number {
  return set.groups.reduce((n, g) => n + g.questions.length, 0);
}
