"use client";

import Image from "next/image";
import Modal from "./Modal";
import { secondaryButton } from "@/lib/ui";

const SITE_URL = "https://laererliv.no";
const EMAIL = "kenneth@laererliv.no";

export default function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Om Klassekart"
      size="sm"
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose} className={secondaryButton()}>
          Lukk
        </button>
      }
    >
      <div className="flex flex-col gap-4 text-sm text-muted">
        <div className="flex items-center gap-3">
          <Image
            src="/laererliv-logo.png"
            alt=""
            width={40}
            height={40}
            className="rounded-lg"
          />
          <div>
            <p className="font-semibold text-foreground">Lærerliv</p>
            <a
              href={SITE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-accent-text hover:underline"
            >
              laererliv.no
            </a>
          </div>
        </div>

        <p>
          Lærerliv er en side om skole og undervisning, med tekster, tips og små
          verktøy til lærerhverdagen. Klassekart er ett av verktøyene: det setter
          opp klasserommet, fordeler elevene i bordgrupper og holder styr på hvem
          som har sittet sammen før, så du slipper å telle på fingrene.
        </p>

        <div>
          <p className="mb-1 font-semibold text-foreground">Bak siden</p>
          <p>
            Jeg heter Kenneth, er lærer og skriver om skole på Lærerliv. Ved siden
            av undervisningen lager jeg små verktøy som løser praktiske problemer i
            skolehverdagen — Klassekart er ett av dem.
          </p>
        </div>

        <div>
          <p className="mb-1 font-semibold text-foreground">Personvern</p>
          <p>
            Klassekart lagrer klassene dine i denne nettleseren, på maskinen du
            sitter ved. Ingenting sendes til en server, og ingen andre kan se
            det. Bruk gjerne fornavn eller kallenavn på elevene — et klassekart
            trenger ikke fullt navn.
          </p>
          <p className="mt-2">
            Fordi alt ligger lokalt, forsvinner klassene om nettleserdataene
            tømmes. Lagre derfor en kopi til fil fra menyen innimellom, og legg
            den der skolen ellers lagrer elevopplysninger.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
          <p className="text-xs font-medium text-subtle">Innspill, feil eller ønsker?</p>
          <a href={`mailto:${EMAIL}`} className="text-accent-text hover:underline">
            {EMAIL}
          </a>
        </div>
      </div>
    </Modal>
  );
}
