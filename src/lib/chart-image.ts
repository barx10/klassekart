"use client";

import {
  DESK_HEADER_HEIGHT,
  DESK_PADDING,
  SEAT_GAP,
  clampSeats,
  deskHeight,
  deskWidth,
  seatGrid,
} from "./classroom";
import type { Desk, DeskAssignments, Gender, Student } from "./types";

/**
 * Klassekartet som bilde, til å lime inn i et dokument eller en presentasjon.
 *
 * Bildet tegnes fra dataene og ikke fotograferes av sida. Lerretet på skjermen
 * er en editor med håndtak, verktøylinjer og en zoom som følger vinduet; å ta
 * bildet av det ville krevd et bibliotek som kopierer stilarkene, og gitt med
 * seg alt som ikke hører hjemme på kartet. Tegningen følger målene i
 * `classroom.ts`, så bildet ser ut som fullskjermvisningen.
 *
 * Fargene er de lyse med vilje, også når appen står i mørk modus: bildet skal
 * inn i et dokument eller på et ark, og der er bakgrunnen hvit.
 */

const COLORS = {
  background: "#ffffff",
  desk: "#ffffff",
  deskBorder: "rgba(11, 11, 11, 0.16)",
  seatBorder: "rgba(11, 11, 11, 0.12)",
  seat: "#fcfcfb",
  text: "#0b0b0b",
  muted: "#52514e",
  board: "#1f66c0",
  boardText: "#ffffff",
};

const GENDER: Record<Gender, { border: string; fill: string }> = {
  jente: { border: "#d1417a", fill: "#fbe9f1" },
  gutt: { border: "#1f66c0", fill: "#e7f0fc" },
  annet: { border: "#6d6a63", fill: "#efeee9" },
};

/** Pikseltetthet. Med 2 er navnene skarpe også når bildet strekkes på en side. */
const SCALE = 2;
const MARGIN = 32;
const TITLE_HEIGHT = 40;
const BOARD_HEIGHT = 34;
const BOARD_WIDTH = 320;
const BOARD_GAP = 20;

function firstName(name: string): string {
  return name.split(" ")[0];
}

function lastName(name: string): string {
  return name.split(" ").slice(1).join(" ");
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Kapper teksten med … så den holder seg innenfor bredden, slik `truncate` gjør. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let end = text.length;
  while (end > 0 && ctx.measureText(`${text.slice(0, end)}…`).width > width) end -= 1;
  return end > 0 ? `${text.slice(0, end)}…` : "";
}

export function drawChartImage({
  className,
  desks,
  assignments,
  studentsById,
}: {
  className: string;
  desks: Desk[];
  assignments: DeskAssignments;
  studentsById: Map<string, Student>;
}): HTMLCanvasElement {
  // Rammen rundt pultene, ikke lerretets fulle størrelse: tom plass til venstre
  // og plassen verktøylinja får under nederste rad hører ikke med på bildet.
  const minX = desks.length ? Math.min(...desks.map((d) => d.x)) : 0;
  const minY = desks.length ? Math.min(...desks.map((d) => d.y)) : 0;
  const maxX = desks.length ? Math.max(...desks.map((d) => d.x + deskWidth(d))) : 0;
  const maxY = desks.length ? Math.max(...desks.map((d) => d.y + deskHeight(d))) : 0;

  const roomWidth = Math.max(maxX - minX, BOARD_WIDTH);
  const roomHeight = maxY - minY;
  const width = roomWidth + MARGIN * 2;
  const top = MARGIN + TITLE_HEIGHT + BOARD_HEIGHT + BOARD_GAP;
  const height = top + roomHeight + MARGIN;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * SCALE);
  canvas.height = Math.ceil(height * SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Nettleseren kunne ikke tegne bildet.");
  ctx.scale(SCALE, SCALE);

  const font = getComputedStyle(document.body).fontFamily || "sans-serif";
  ctx.textBaseline = "middle";

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  // Klassenavnet, midtstilt over tavla som på utskriften.
  ctx.fillStyle = COLORS.text;
  ctx.font = `700 24px ${font}`;
  ctx.textAlign = "center";
  ctx.fillText(fit(ctx, className, roomWidth), width / 2, MARGIN + TITLE_HEIGHT / 2 - 6);

  const boardX = width / 2 - BOARD_WIDTH / 2;
  const boardY = MARGIN + TITLE_HEIGHT;
  ctx.fillStyle = COLORS.board;
  roundedRect(ctx, boardX, boardY, BOARD_WIDTH, BOARD_HEIGHT, 12);
  ctx.fill();
  ctx.fillStyle = COLORS.boardText;
  ctx.font = `600 14px ${font}`;
  ctx.fillText("Tavle", width / 2, boardY + BOARD_HEIGHT / 2);

  // Rommet sentreres når tavla er bredere enn pultene.
  const offsetX = MARGIN + (roomWidth - (maxX - minX)) / 2 - minX;
  const offsetY = top - minY;

  for (const desk of desks) {
    const x = desk.x + offsetX;
    const y = desk.y + offsetY;
    const w = deskWidth(desk);
    const h = deskHeight(desk);

    ctx.fillStyle = COLORS.desk;
    ctx.strokeStyle = COLORS.deskBorder;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    roundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 11px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText(fit(ctx, desk.name ?? "", w - 16), x + w / 2, y + DESK_HEADER_HEIGHT / 2);

    const seats = clampSeats(desk.seats);
    const { cols, rows } = seatGrid(seats);
    const areaX = x + DESK_PADDING;
    const areaY = y + DESK_HEADER_HEIGHT;
    const areaW = w - DESK_PADDING * 2;
    const areaH = h - DESK_HEADER_HEIGHT - DESK_PADDING;
    const seatW = (areaW - (cols - 1) * SEAT_GAP) / cols;
    const seatH = (areaH - (rows - 1) * SEAT_GAP) / rows;
    const seated = assignments[desk.id] ?? [];

    for (let i = 0; i < seats; i++) {
      const sx = areaX + (i % cols) * (seatW + SEAT_GAP);
      const sy = areaY + Math.floor(i / cols) * (seatH + SEAT_GAP);
      const studentId = seated[i] ?? null;
      const student = studentId ? studentsById.get(studentId) : undefined;

      roundedRect(ctx, sx + 0.5, sy + 0.5, seatW - 1, seatH - 1, 8);
      if (!student) {
        ctx.strokeStyle = COLORS.seatBorder;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }

      const colors = student.gender ? GENDER[student.gender] : null;
      ctx.fillStyle = colors?.fill ?? COLORS.seat;
      ctx.strokeStyle = colors?.border ?? COLORS.seatBorder;
      ctx.fill();
      ctx.stroke();

      const textX = sx + 8;
      const textW = seatW - 16;
      const first = firstName(student.name);
      const last = lastName(student.name);
      const mid = sy + seatH / 2;
      ctx.textAlign = "left";
      ctx.fillStyle = COLORS.text;
      ctx.font = `600 16px ${font}`;
      ctx.fillText(fit(ctx, first, textW), textX, last ? mid - 8 : mid);
      if (last) {
        ctx.fillStyle = COLORS.muted;
        ctx.font = `400 12px ${font}`;
        ctx.fillText(fit(ctx, last, textW), textX, mid + 9);
      }
    }
  }

  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: "image/png" | "image/jpeg"
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Bildet kunne ikke lages."))),
      mime,
      0.92
    )
  );
}

/** Filnavnet uten endelse. Tegnene Windows ikke tåler byttes ut, som i `printFileName`. */
export function chartFileName(className: string): string {
  return `Klassekart ${className.trim()}`.replace(/[\\/:*?"<>|]/g, "-").trim();
}
