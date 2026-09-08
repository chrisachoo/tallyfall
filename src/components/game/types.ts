export type TileState = "idle" | "selected" | "clearing";
export type MatchRule = "equality" | "sum" | "sequence";

export interface Tile {
  id: number;
  row: number;
  col: number;
  value: number;
  state: TileState;
  fallMs: number;
  delayMs: number;
}

export interface LevelConfig {
  level: number;
  cols: number;
  rows: number;
  valueCount: number;
  minMatchLength: number;
  targetScore: number;
  allowDiagonals: boolean;
  sumTarget: number;
  rules: MatchRule[];
  specialBombs: boolean;
  maxMoves: number;
  maxHints: number;
  ruleLabel: string;
  hint: string;
  intro: string;
}

export function getLevelConfig(level: number): LevelConfig {
  const safeLevel = Math.max(1, level);
  const phase = Math.floor((safeLevel - 1) / 5);

  const rules: MatchRule[] = ["equality"];
  if (phase >= 2) rules.push("sum");
  if (phase >= 3) rules.push("sequence");

  const allowDiagonals = phase >= 1;
  const specialBombs = phase >= 3;
  const valueCount =
    phase === 0 ? 5 : Math.min(5 + phase, specialBombs ? 9 : 8);

  let ruleLabel = "Match 3";
  let hint = "Drag through 3+ of the same number";
  let intro = "Connect three or more matching numbers.";
  if (phase === 1) {
    ruleLabel = "Diagonals";
    hint = "Diagonals count — drag 3+ of the same number";
    intro = "Diagonals count now. Same rule, more paths.";
  } else if (phase === 2) {
    ruleLabel = "Match or sum 10";
    hint = "Match 3-of-a-kind, or drag numbers that add to 10";
    intro = "New rule: a path that adds to 10 also clears.";
  } else if (phase >= 3) {
    ruleLabel = "Mixed rules";
    hint = "Match 3, sum to 10, or trace a sequence — 8s explode";
    intro = "Sequences work too. Clearing an 8 blasts a 3×3.";
  }

  return {
    level: safeLevel,
    cols: 6,
    rows: 8,
    valueCount,
    minMatchLength: 3,
    targetScore: 1500 + (safeLevel - 1) * 400,
    allowDiagonals,
    sumTarget: 10,
    rules,
    specialBombs,
    maxMoves: Math.max(14, 26 - Math.floor((safeLevel - 1) / 2)),
    maxHints: 3,
    ruleLabel,
    hint,
    intro,
  };
}

export const VALUE_COLORS: Record<number, string> = {
  1: "#3B8BD4",
  2: "#1D9E75",
  3: "#D85A30",
  4: "#EF9F27",
  5: "#7F77DD",
  6: "#D4537E",
  7: "#5B9BD5",
  8: "#36A269",
  9: "#C47A4A",
};
