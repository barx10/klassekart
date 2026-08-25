import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Personvern",
  description:
    "Hva Klassekart lagrer, hvor det ligger, og hvordan du sletter det. Alt lagres i nettleseren din.",
};

const EMAIL = "kenneth@laererliv.no";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-1.5 text-base font-semibold text-foreground">{title}</h2>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

/**
 * Personvernavsnittet appen skal ha fordi den håndterer navn på barn: hva som
 * lagres, hvor det ligger, og hvordan læreren blir kvitt det igjen. Egen side
 * og ikke et vindu, så den kan sendes videre til rektor eller personvernombud.
 * `docs/personvern.md` er den lange versjonen, for utviklingen.
 */
export default function PersonvernPage() {
  return (
    <article className="mx-auto max-w-2xl text-sm text-muted">
      <h1 className="text-2xl font-bold text-foreground">Personvern i Klassekart</h1>
      <p className="mt-2 text-base">
        Klassekart håndterer navn på elever, altså personopplysninger om barn. Her står det hva
        appen lagrer, hvor det ligger, og hvordan du sletter det.
      </p>

      <div className="mt-5 rounded-xl border border-border bg-surface-raised px-4 py-3">
        <p className="text-foreground">
          Alt du legger inn lagres i <strong>din egen nettleser</strong>, på maskinen du sitter ved.
          Ingenting sendes til en server, det finnes ingen konto og ingen delt database — og dermed
          heller ingen andre som kan se klassene dine.
        </p>
      </div>

      <Section title="Hva appen lagrer">
        <ul className="ml-5 list-disc space-y-1">
          <li>Navn på klassen, og eventuelt hvem som er kontaktlærer.</li>
          <li>Navn på elevene, og kjønn hvis du velger å oppgi det. Kjønn er valgfritt, og brukes
            bare til fargeprikken — fordelingen av elever ser ikke på det.</li>
          <li>Pultoppsettet i klasserommet.</li>
          <li>Klassekartene du genererer, og hvor mange ganger hvert elevpar har sittet sammen.</li>
        </ul>
        <p>
          Et klassekart trenger ikke fullt navn. Fornavn, eller fornavn og en forbokstav der to
          heter det samme, gjør appen like brukbar — og gjør opplysningene mindre sårbare hvis
          maskinen kommer på avveie.
        </p>
      </Section>

      <Section title="Hvor det ligger">
        <p>
          I nettleserens egen lagring (IndexedDB) på maskinen du bruker. Appen har ingen database,
          ingen innlogging og ingen analyse- eller sporingsverktøy.
        </p>
        <p>
          Selve nettsiden hostes hos Vercel, som fører vanlige nettlogger — IP-adresse og tidspunkt,
          slik enhver nettside gjør. Det du skriver inn i appen, sendes aldri dit.
        </p>
      </Section>

      <Section title="Hvem kan se det">
        <p>
          Alle som får tilgang til nettleserprofilen din på maskinen. Deler du en PC med andre,
          bruk egen brukerkonto — samme forholdsregel som for et regneark med klasselista i.
        </p>
        <p>
          Bruker du appen på skole-PC-en og hjemme-PC-en, har de hver sin lagring. De ser altså
          ikke hverandres klasser.
        </p>
      </Section>

      <Section title="Sikkerhetskopien">
        <p>
          Nederst i menyen ligger <em>Lagre kopi til fil</em>. Fila inneholder elevnavnene i
          klartekst, så den hører hjemme der skolen ellers lagrer elevopplysninger — ikke på privat
          e-post eller en minnepinne i sekken.
        </p>
        <p>
          Ta likevel en kopi innimellom: tømmes nettleserdataene, eller bytter du maskin, er
          klassene borte uten den.
        </p>
      </Section>

      <Section title="Slik sletter du">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong className="text-foreground">Én elev:</strong> åpne Elever i menyen, klikk på
            navnet og velg «Fjern eleven». Par-historikken for eleven forsvinner samtidig.
          </li>
          <li>
            <strong className="text-foreground">En hel klasse:</strong> søppelbøtta ved klassen i
            menyen. Elever, klassekart og par-historikk slettes med.
          </li>
          <li>
            <strong className="text-foreground">Bare historikken:</strong> «Oversikt over par» →
            «Nullstill historikken». Passer ved skoleårsslutt.
          </li>
          <li>
            <strong className="text-foreground">Alt:</strong> slett nettstedsdata for denne siden i
            nettleseren din. Da er ingenting igjen — heller ikke sikkerhetskopier du har lastet ned
            selv.
          </li>
        </ul>
      </Section>

      <Section title="Ansvaret i skolen">
        <p>
          Selv om opplysningene ligger lokalt hos deg, er det skolen og kommunen som er
          behandlingsansvarlig for elevopplysninger. Bruker du Klassekart med ekte elevnavn, si fra
          til ledelsen at du gjør det — på samme måte som for et regneark eller et dokument med
          klasselista i. Slett dataene når skoleåret er over.
        </p>
        <p>
          Klassekart er et lite verktøy laget av en lærer, ikke en tjeneste skolen kjøper. Skal det
          en dag brukes av lærere ved andre skoler, kreves det mer: innlogging, databehandleravtale
          og en vurdering av personvernkonsekvenser. Det er ikke situasjonen i dag.
        </p>
      </Section>

      <Section title="Spørsmål">
        <p>
          Ta kontakt på{" "}
          <a href={`mailto:${EMAIL}`} className="text-accent-text hover:underline">
            {EMAIL}
          </a>
          .
        </p>
      </Section>

      <p className="mt-8 border-t border-border pt-3 text-xs text-subtle">
        Sist oppdatert august 2026.
      </p>
    </article>
  );
}
