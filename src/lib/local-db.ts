"use client";

import type { ContactTeacher, PairHistoryRow, SchoolClass, SeatingChart, Student } from "./types";

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

/**
 * Versjonen som skrives i sikkerhetskopier, så eldre filer kan leses senere.
 *
 * 2: lista over kontaktlærere kom til. Kopier fra versjon 1 leses fortsatt —
 *    `normalize()` bygger lista av navnene som står på elevene.
 * 3: klassene fikk `locked_seats` — elever læreren har låst til et sete. Eldre
 *    kopier mangler feltet, og leses som «ingen låser» (`validLocks`).
 */
export const BACKUP_VERSION = 3;

export interface LocalData {
  version: number;
  classes: SchoolClass[];
  students: Student[];
  charts: SeatingChart[];
  pairs: PairHistoryRow[];
  contact_teachers: ContactTeacher[];
}

export function emptyData(): LocalData {
  return {
    version: BACKUP_VERSION,
    classes: [],
    students: [],
    charts: [],
    pairs: [],
    contact_teachers: [],
  };
}

/** Samme navn skrevet med ulike store bokstaver eller mellomrom er samme lærer. */
export function teacherKey(name: string): string {
  return name.trim().toLocaleLowerCase("no");
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

/**
 * Kontaktlærerne som allerede står på elevene og klassene. Brukes når en
 * lagring fra versjon 1 leses: der fantes ingen liste, og navnene som er
 * skrevet inn er det eneste vi vet om hvem lærerne er.
 */
function contactTeachersFromNames(classes: SchoolClass[], students: Student[]): ContactTeacher[] {
  const sett = new Map<string, ContactTeacher>();
  const legg = (name: string | null | undefined, created_at: string) => {
    const trimmed = name?.trim();
    if (!trimmed || sett.has(teacherKey(trimmed))) return;
    sett.set(teacherKey(trimmed), { id: newId(), name: trimmed, created_at });
  };

  for (const student of students) legg(student.contact_teacher, student.created_at);
  // Klassens standard kan være satt uten at noen elev har fått den ennå.
  for (const klasse of classes) legg(klasse.default_contact_teacher, klasse.created_at);
  return [...sett.values()];
}

/** Fyller inn det som mangler, så en tom eller eldre lagring ikke krasjer appen. */
function normalize(value: unknown): LocalData {
  const raw = (value ?? {}) as Partial<LocalData>;
  const classes = Array.isArray(raw.classes) ? raw.classes : [];
  const students = Array.isArray(raw.students) ? raw.students : [];
  return {
    version: typeof raw.version === "number" ? raw.version : BACKUP_VERSION,
    classes,
    students,
    charts: Array.isArray(raw.charts) ? raw.charts : [],
    pairs: Array.isArray(raw.pairs) ? raw.pairs : [],
    contact_teachers: Array.isArray(raw.contact_teachers)
      ? raw.contact_teachers
      : contactTeachersFromNames(classes, students),
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
    current.contact_teachers = data.contact_teachers;
  });
}
