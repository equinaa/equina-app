import type { RidePhaseEntry } from "../../backend";
import type { RidePhaseWindows } from "../ride/ride-plan";
import { effortPhaseName, type RideEffort } from "./ride-effort";

/**
 * Where everything on the heart-rate chart goes, in points, for a plot of a
 * given size. Pure, so the drawing (RideEffortCard.tsx) only draws.
 */

export type EffortBand = {
  phaseIndex: number;
  name: string;
  x: number;
  width: number;
  /** Alternate bands are tinted, so neighbours read apart without colour alone (each has its name). */
  tinted: boolean;
  /** The phase's average, as a line across its band; its number shows when the band is wide enough. */
  avg: { y: number; label: string | null } | null;
};

export type EffortChartLayout = {
  yMin: number;
  yMax: number;
  gridlines: Array<{ y: number; label: string }>;
  bands: EffortBand[];
  /** Phase boundaries: solid when the clock placed them, dashed when they are estimated. */
  boundaries: number[];
  /** One path per run of readings; a run ends where the readings stopped. */
  lines: string[];
  /** The area under each run, for the soft fill. */
  areas: string[];
  points: Array<{ x: number; y: number }>;
  max: { x: number; y: number; label: string } | null;
  /** "52 min", the right end of the time axis. */
  endLabel: string;
};

/** A band narrower than this has no room for its average's number. */
export const MIN_LABELLED_BAND = 28;
const Y_MARGIN = 10;
/** About one line of 12 pt label text. */
const LABEL_HEIGHT = 18;

const round = (value: number) => Math.round(value * 10) / 10;

/** Two round heart rates inside the range, for the hairlines. */
const gridValues = (low: number, high: number) => {
  const span = high - low;
  const step = span > 120 ? 40 : span > 60 ? 20 : 10;
  const values: number[] = [];
  for (let value = Math.ceil((low + step / 2) / step) * step; value < high - step / 4; value += step) values.push(value);
  // Two lines are enough to read a level off; more only crowd a 112 pt plot.
  if (values.length <= 2) return values;
  return [values[Math.floor(values.length / 3)]!, values[Math.floor((2 * values.length) / 3)]!];
};

export const effortChartLayout = (
  effort: RideEffort,
  windows: readonly RidePhaseWindows[],
  phases: readonly RidePhaseEntry[] | undefined,
  { width, height }: { width: number; height: number }
): EffortChartLayout => {
  const { start, end } = effort.window;
  const span = Math.max(1, end - start);
  const x = (at: number) => round(((Math.min(end, Math.max(start, at)) - start) / span) * width);
  const values = effort.series.flat().map((point) => point.bpm);
  if (effort.maxBpm !== null) values.push(effort.maxBpm);
  for (const phase of effort.phases) if (phase.avgBpm !== null) values.push(phase.avgBpm);
  const low = values.length ? Math.min(...values) : 60;
  const high = values.length ? Math.max(...values) : 120;
  const yMin = Math.max(0, Math.floor((low - Y_MARGIN) / 10) * 10);
  const yMax = Math.max(yMin + 20, Math.ceil((high + Y_MARGIN) / 10) * 10);
  const y = (bpm: number) => round(height - ((bpm - yMin) / (yMax - yMin)) * height);

  const max = effort.maxBpm !== null && effort.maxAt !== null ? { x: x(effort.maxAt), y: y(effort.maxBpm), label: String(effort.maxBpm) } : null;
  // A band's number would sit on the highest reading's own number: the band keeps its line, the peak its label.
  const clashesWithMax = (from: number, to: number, at: number) =>
    max !== null && max.x >= from && max.x <= to && Math.abs(max.y - at) < LABEL_HEIGHT;

  const bands: EffortBand[] = [];
  const boundaries: number[] = [];
  windows.forEach((placed, order) => {
    const first = placed.windows[0];
    const last = placed.windows[placed.windows.length - 1];
    if (!first || !last) return;
    const from = x(first.start);
    const to = x(last.end);
    if (to <= from) return;
    if (bands.length) boundaries.push(from);
    const phaseEffort = effort.phases.find((phase) => phase.phaseIndex === placed.phaseIndex);
    const avg = phaseEffort?.avgBpm ?? null;
    bands.push({
      phaseIndex: placed.phaseIndex,
      name: effortPhaseName(phases?.[placed.phaseIndex], placed.phaseIndex),
      x: from,
      width: round(to - from),
      tinted: order % 2 === 1,
      avg: avg === null
        ? null
        : { y: y(avg), label: to - from >= MIN_LABELLED_BAND && !clashesWithMax(from, to, y(avg)) ? String(avg) : null }
    });
  });

  const lines: string[] = [];
  const areas: string[] = [];
  for (const run of effort.series) {
    if (run.length < 2) continue;
    const path = run.map((point, index) => `${index ? "L" : "M"}${x(point.at)} ${y(point.bpm)}`).join(" ");
    lines.push(path);
    areas.push(`${path} L${x(run[run.length - 1]!.at)} ${height} L${x(run[0]!.at)} ${height} Z`);
  }

  return {
    yMin,
    yMax,
    gridlines: gridValues(yMin, yMax).map((value) => ({ y: y(value), label: String(value) })),
    bands,
    boundaries,
    lines,
    areas,
    points: effort.series.flat().map((point) => ({ x: x(point.at), y: y(point.bpm) })),
    max,
    endLabel: `${Math.round(span / 60_000)} min`
  };
};

/**
 * Whether every phase's name fits its segment of the ribbon under the chart.
 * When one does not, all show numbers and the names are listed below, so no
 * name is cut and the numbers match.
 */
export const ribbonFits = (bands: readonly EffortBand[], fontScale: number) =>
  fontScale <= 1.4 && bands.every((band) => band.name.length * 6.6 * fontScale + 12 <= band.width);
