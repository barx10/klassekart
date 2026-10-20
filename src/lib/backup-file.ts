"use client";

/**
 * Å få sikkerhetskopien ut av nettleseren og ned på maskinen.
 *
 * Vanlig nedlasting sender fila rett til Nedlastinger uten å spørre, og da
 * forsvinner den for den som ikke vet hvor den mappa er. Chrome og Edge har
 * `showSaveFilePicker`, som gir det vanlige «Lagre som»-vinduet: læreren velger
 * mappe selv og ser navnet før det lagres. Safari og Firefox har det ikke, så
 * nedlastingen står igjen som reserve.
 */

/** Delen av File System Access API vi bruker. Ligger ikke i TypeScripts DOM-typer. */
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}

interface FileSystemWritable {
  write: (data: string | Blob) => Promise<void>;
  close: () => Promise<void>;
}

interface SaveFileHandle {
  name: string;
  createWritable: () => Promise<FileSystemWritable>;
}

type PickerWindow = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<SaveFileHandle>;
};

/** Brukeren lukket «Lagre som» uten å velge noe. Ikke en feil. */
export class SaveCancelled extends Error {
  constructor() {
    super("Lagringen ble avbrutt.");
    this.name = "SaveCancelled";
  }
}

/**
 * Filtypene appen lagrer. Sikkerhetskopien er hele datasettet; kalenderfila er
 * samtaletidene, og den skal åpne seg i kalenderprogrammet når læreren
 * dobbeltklikker den — derfor egen mediatype og ikke bare et annet navn.
 */
export type SaveKind = "backup" | "calendar";

const KINDS: Record<SaveKind, { mime: string; description: string; extension: string }> = {
  backup: {
    mime: "application/json",
    description: "Klassekart-sikkerhetskopi",
    extension: ".json",
  },
  calendar: {
    mime: "text/calendar",
    description: "Kalenderfil",
    extension: ".ics",
  },
};

/** Den gamle veien: en usynlig lenke som klikkes, og fila havner i Nedlastinger. */
function download(data: string | Blob, filename: string, mime: string) {
  const blob = typeof data === "string" ? new Blob([data], { type: mime }) : data;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Nettleseren trenger adressen litt til etter klikket.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Lagrer teksten som fil. Kaster `SaveCancelled` hvis brukeren lukket
 * «Lagre som» — den som kaller skal da ikke vise noen feilmelding.
 */
export async function saveTextToFile(
  text: string,
  filename: string,
  kind: SaveKind = "backup"
): Promise<void> {
  const { mime, description, extension } = KINDS[kind];
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (!picker) {
    download(text, filename, mime);
    return;
  }

  let handle: SaveFileHandle;
  try {
    handle = await picker({
      suggestedName: filename,
      types: [{ description, accept: { [mime]: [extension] } }],
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new SaveCancelled();
    // Nekter nettleseren å åpne vinduet — for eksempel i en innebygd ramme —
    // er en fil i Nedlastinger bedre enn ingen fil.
    download(text, filename, mime);
    return;
  }

  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

/** Bildeformatene klassekartet kan lagres som. */
const IMAGE_TYPES: NonNullable<SaveFilePickerOptions["types"]> = [
  { description: "PNG-bilde", accept: { "image/png": [".png"] } },
  { description: "JPG-bilde", accept: { "image/jpeg": [".jpg", ".jpeg"] } },
];

/**
 * Lagrer et bilde. Formatet følger navnet læreren gir fila i «Lagre som»:
 * slutter det på .jpg, blir det JPG, ellers PNG. Derfor tar funksjonen en
 * koder og ikke et ferdig bilde — formatet er ikke kjent før vinduet er lukket.
 *
 * Uten «Lagre som» blir det PNG. Skarpe kanter og tekst er det PNG er laget
 * for, og alle bildeprogrammer leser det.
 */
export async function saveImageToFile(
  encode: (mime: "image/png" | "image/jpeg") => Promise<Blob>,
  baseName: string
): Promise<void> {
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (!picker) {
    download(await encode("image/png"), `${baseName}.png`, "image/png");
    return;
  }

  let handle: SaveFileHandle;
  try {
    handle = await picker({ suggestedName: `${baseName}.png`, types: IMAGE_TYPES });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new SaveCancelled();
    download(await encode("image/png"), `${baseName}.png`, "image/png");
    return;
  }

  const mime = /\.jpe?g$/i.test(handle.name) ? "image/jpeg" : "image/png";
  const blob = await encode(mime);
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}
