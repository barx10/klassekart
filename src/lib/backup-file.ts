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
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
}

interface SaveFileHandle {
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

/** Den gamle veien: en usynlig lenke som klikkes, og fila havner i Nedlastinger. */
function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
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
export async function saveTextToFile(text: string, filename: string): Promise<void> {
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (!picker) {
    download(text, filename);
    return;
  }

  let handle: SaveFileHandle;
  try {
    handle = await picker({
      suggestedName: filename,
      types: [
        {
          description: "Klassekart-sikkerhetskopi",
          accept: { "application/json": [".json"] },
        },
      ],
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new SaveCancelled();
    // Nekter nettleseren å åpne vinduet — for eksempel i en innebygd ramme —
    // er en fil i Nedlastinger bedre enn ingen fil.
    download(text, filename);
    return;
  }

  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}
