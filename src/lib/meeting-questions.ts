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
 */

/** Ett forslag: en kort merkelapp, og spørsmålet selv. */
export interface MeetingQuestion {
  /** Hva spørsmålet handler om — «Sosialt miljø». Kan stå tomt. */
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
      title: "Innledning",
      questions: [
        {
          label: "Elevens ord først",
          text: "Hvordan synes du selv det går på skolen nå — både faglig og sosialt?",
        },
        {
          label: "Hjemmets inntrykk",
          text: "Hva forteller eleven om skoledagen hjemme? Er det noe hen gruer seg til, eller gleder seg til?",
        },
        {
          label: "Siden sist",
          text: "Hva har blitt bedre siden forrige samtale, og hva står på stedet hvil?",
        },
      ],
    },
    {
      title: "Faglig utvikling",
      questions: [
        {
          label: "Status i fagene",
          text: "Hvilke fag går det godt i, og i hvilke fag trengs det mer støtte eller større utfordringer?",
        },
        {
          label: "Arbeidsvaner i timene",
          text: "Kommer eleven i gang på egen hånd, holder hen fokus, og blir oppgavene fullført og levert?",
        },
        {
          label: "Hjemmearbeid",
          text: "Hvordan fungerer lekser og forberedelser hjemme? Er det rutiner, et sted å jobbe, og passe mye hjelp å få?",
        },
      ],
    },
    {
      title: "Trivsel og sosialt",
      questions: [
        {
          label: "Venner og klassemiljø",
          text: "Hvem er eleven sammen med i friminuttene og på fritiden? Er det noen som blir stående utenfor?",
        },
        {
          label: "Trygghet",
          text: "Er det noe på skolen eller på nett som gjør skoledagen utrygg? Skolen har plikt til å følge opp en elev som ikke har det trygt og godt.",
        },
        {
          label: "Hverdagen utenom skolen",
          text: "Hvordan er søvn, fritidsaktiviteter og skjermtid på hverdager? Rekker eleven å hvile?",
        },
      ],
    },
    {
      title: "Mål og tiltak videre",
      questions: [
        {
          label: "Mål til neste samtale",
          text: "Hva skal eleven jobbe mot til neste samtale — gjerne ett faglig mål og ett knyttet til arbeidsvaner eller det sosiale?",
        },
        {
          label: "Hvem gjør hva",
          text: "Hva gjør eleven selv, hva gjør skolen, og hva gjør hjemmet for at målet skal nås?",
        },
        {
          label: "Kontakten mellom hjem og skole",
          text: "Hvordan holder vi kontakten fram til neste samtale, og hvem tar kontakt med hvem hvis noe skjer?",
        },
      ],
    },
    {
      title: "Oppsummering",
      questions: [
        {
          text: "Gjenta de 1–2 avtalene dere er blitt enige om, hvem som følger opp hva, og når dere hører fra hverandre igjen.",
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
