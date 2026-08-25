"use client";

import type { PairHistoryRow, SchoolClass, SeatingChart, Student } from "./types";

/**
 * All lagring skjer i nettleseren, i IndexedDB. Ingenting sendes til en
 * server: elevnavnene ligger på maskinen til læreren som skrev dem inn, og
 * appen er bare en side som leser dem derfra. Se `docs/personvern.md` for
 * hvorfor det er valgt slik.
 *
 * Datamengden er liten — noen klasser, noen titalls elever, noen kart — så
 * hele datasettet ligger som *ett* objekt under én nøkkel. Det gjør
 * sikkerhetskopi til en ren `JSON.stringify`, og gjør at en endring aldri kan
 * skrive halve sannheten til disk.
 */

const DB_NAME = "klassekart";
const DB_VERSION = 1;
const STORE = "data";
const KEY = "state";

/** Versjonen som skrives i sikkerhetskopier, så eldre filer kan leses senere. */
export const BACKUP_VERSION = 1;

export interface LocalData {
  version: number;
  classes: SchoolClass[];
  students: Student[];
  charts: SeatingChart[];
  pairs: PairHistoryRow[];
}

export function emptyData(): LocalData {
  return { version: BACKUP_VERSION, classes: [], students: [], charts: [], pairs: [] };
}

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const STORAGE_UNAVAILABLE =
  "Nettleseren lar ikke Klassekart lagre data. Sjekk at du ikke er i privat modus, og at nettstedsdata er tillatt.";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error(STORAGE_UNAVAILABLE));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(request.error?.message ?? STORAGE_UNAVAILABLE));
    request.onblocked = () => reject(new Error(STORAGE_UNAVAILABLE));
  });
}

/** Fyller inn det som mangler, så en tom eller eldre lagring ikke krasjer appen. */
function normalize(value: unknown): LocalData {
  const raw = (value ?? {}) as Partial<LocalData>;
  return {
    version: typeof raw.version === "number" ? raw.version : BACKUP_VERSION,
    classes: Array.isArray(raw.classes) ? raw.classes : [],
    students: Array.isArray(raw.students) ? raw.students : [],
    charts: Array.isArray(raw.charts) ? raw.charts : [],
    pairs: Array.isArray(raw.pairs) ? raw.pairs : [],
  };
}

async function readRaw(): Promise<LocalData> {
  const db = await openDb();
  try {
    return await new Promise<LocalData>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(normalize(request.result));
      request.onerror = () => reject(new Error(request.error?.message ?? STORAGE_UNAVAILABLE));
    });
  } finally {
    db.close();
  }
}

async function writeRaw(data: LocalData): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(data, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(tx.error?.message ?? STORAGE_UNAVAILABLE));
      tx.onabort = () => reject(new Error(tx.error?.message ?? STORAGE_UNAVAILABLE));
    });
  } finally {
    db.close();
  }
}

/**
 * Alle lesninger og skrivinger står i kø etter hverandre. Uten køen kunne to
 * endringer rukket å lese samme utgangspunkt — for eksempel et pultflytt som
 * lagres med forsinkelse samtidig som en elev legges til — og den siste ville
 * skrevet over den første.
 */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  // En feilet operasjon skal ikke velte køen for de neste.
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Leser ut en avledet verdi fra lagringen. */
export function read<T>(select: (data: LocalData) => T): Promise<T> {
  return enqueue(async () => select(await readRaw()));
}

/**
 * Endrer lagringen: leser hele datasettet, lar `apply` endre det, og skriver
 * det tilbake. Kaster `apply`, blir ingenting skrevet.
 */
export function mutate<T>(apply: (data: LocalData) => T): Promise<T> {
  return enqueue(async () => {
    const data = await readRaw();
    const result = apply(data);
    await writeRaw(data);
    return result;
  });
}

// ---------------------------------------------------------------------------
// Sikkerhetskopi
// ---------------------------------------------------------------------------

export function backupFilename(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  return `klassekart-sikkerhetskopi-${stamp}.json`;
}

export function exportBackup(): Promise<string> {
  return read((data) => JSON.stringify(data, null, 2));
}

/** Leser en sikkerhetskopi og sier tydelig fra hvis fila ikke er en. */
export function parseBackup(text: string): LocalData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Fila er ikke en gyldig sikkerhetskopi (klarte ikke lese innholdet).");
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as LocalData).classes)) {
    throw new Error("Fila ser ikke ut som en sikkerhetskopi fra Klassekart.");
  }
  const data = normalize(parsed);
  if (data.version > BACKUP_VERSION) {
    throw new Error("Sikkerhetskopien er laget med en nyere versjon av Klassekart.");
  }
  return data;
}

/** Erstatter alt som ligger lagret. Brukes når en sikkerhetskopi hentes inn. */
export function replaceAll(data: LocalData): Promise<void> {
  return mutate((current) => {
    current.version = BACKUP_VERSION;
    current.classes = data.classes;
    current.students = data.students;
    current.charts = data.charts;
    current.pairs = data.pairs;
  });
}
