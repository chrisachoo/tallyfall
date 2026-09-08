import { type LevelConfig, type MatchRule, type Tile } from "./types";

export function randomValue(config: LevelConfig): number {
  return 1 + Math.floor(Math.random() * config.valueCount);
}

export function isAdjacentCell(
  a: { row: number; col: number },
  b: { row: number; col: number },
  allowDiagonals: boolean
): boolean {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  if (dr === 0 && dc === 0) return false;
  if (allowDiagonals) return dr <= 1 && dc <= 1;
  return dr + dc === 1;
}

export function neighborsOf(
  cell: { row: number; col: number },
  config: LevelConfig
): { row: number; col: number }[] {
  const out: { row: number; col: number }[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      if (!config.allowDiagonals && Math.abs(dr) + Math.abs(dc) !== 1) continue;
      const row = cell.row + dr;
      const col = cell.col + dc;
      if (row < 0 || col < 0 || row >= config.rows || col >= config.cols) {
        continue;
      }
      out.push({ row, col });
    }
  }
  return out;
}

function pathSum(tiles: Tile[]): number {
  return tiles.reduce((sum, tile) => sum + tile.value, 0);
}

function isEqualityPath(tiles: Tile[], minLength: number): boolean {
  if (tiles.length < minLength) return false;
  return tiles.every((tile) => tile.value === tiles[0].value);
}

function isSumPath(tiles: Tile[], target: number): boolean {
  if (tiles.length < 2) return false;
  return pathSum(tiles) === target;
}

function isSequencePath(tiles: Tile[]): boolean {
  if (tiles.length < 3) return false;
  const step = tiles[1].value - tiles[0].value;
  if (step === 0) return false;
  for (let i = 2; i < tiles.length; i++) {
    if (tiles[i].value - tiles[i - 1].value !== step) return false;
  }
  return true;
}

function ruleHolds(
  tiles: Tile[],
  rule: MatchRule,
  config: LevelConfig
): boolean {
  if (rule === "equality") return isEqualityPath(tiles, config.minMatchLength);
  if (rule === "sum") return isSumPath(tiles, config.sumTarget);
  return isSequencePath(tiles);
}

export function isValidPlayerPath(tiles: Tile[], config: LevelConfig): boolean {
  if (tiles.length < 2) return false;
  for (let i = 1; i < tiles.length; i++) {
    if (!isAdjacentCell(tiles[i - 1], tiles[i], config.allowDiagonals)) {
      return false;
    }
  }
  return config.rules.some((rule) => ruleHolds(tiles, rule, config));
}

export function canExtendPath(
  path: Tile[],
  next: Tile,
  config: LevelConfig
): boolean {
  if (path.length === 0) return true;
  if (path.some((tile) => tile.id === next.id)) return false;
  const last = path[path.length - 1];
  if (!isAdjacentCell(last, next, config.allowDiagonals)) return false;

  const candidate = [...path, next];
  return config.rules.some((rule) => {
    if (rule === "equality") {
      return candidate.every((tile) => tile.value === candidate[0].value);
    }
    if (rule === "sum") {
      return pathSum(candidate) <= config.sumTarget;
    }
    if (candidate.length === 2) {
      return candidate[1].value !== candidate[0].value;
    }
    return isSequencePath(candidate);
  });
}

export interface GravityResult {
  moved: { id: number; row: number }[];
  spawned: Tile[];
  nextId: number;
}

export function computeGravity(
  survivingTiles: Tile[],
  config: LevelConfig,
  nextId: number
): GravityResult {
  const moved: { id: number; row: number }[] = [];
  const spawned: Tile[] = [];
  let id = nextId;

  for (let col = 0; col < config.cols; col++) {
    const columnTiles = survivingTiles
      .filter((tile) => tile.col === col)
      .sort((a, b) => a.row - b.row);

    let targetRow = config.rows - 1;
    for (let i = columnTiles.length - 1; i >= 0; i--) {
      const tile = columnTiles[i];
      if (tile.row !== targetRow) {
        moved.push({ id: tile.id, row: targetRow });
      }
      targetRow--;
    }

    const emptyCount = targetRow + 1;
    for (let i = 0; i < emptyCount; i++) {
      spawned.push({
        id: id++,
        row: i,
        col,
        value: randomValue(config),
        state: "idle",
        fallMs: fallMs(config.rows),
        delayMs: 0,
      });
    }
  }

  return { moved, spawned, nextId: id };
}

function tileAt(
  grid: Map<string, Tile>,
  row: number,
  col: number
): Tile | undefined {
  return grid.get(`${row},${col}`);
}

function collectLineMatches(
  line: Tile[],
  config: LevelConfig,
  matched: Set<number>
) {
  if (line.length < 2) return;

  if (config.rules.includes("equality")) {
    let runStart = 0;
    for (let i = 1; i <= line.length; i++) {
      const same = i < line.length && line[i].value === line[runStart].value;
      if (!same) {
        if (i - runStart >= config.minMatchLength) {
          for (let j = runStart; j < i; j++) matched.add(line[j].id);
        }
        runStart = i;
      }
    }
  }

  if (config.rules.includes("sum") || config.rules.includes("sequence")) {
    for (let start = 0; start < line.length; start++) {
      for (let end = start + 1; end < line.length; end++) {
        const slice = line.slice(start, end + 1);
        if (config.rules.some((rule) => ruleHolds(slice, rule, config))) {
          slice.forEach((tile) => matched.add(tile.id));
        }
      }
    }
  }
}

function expandBombs(
  tiles: Tile[],
  matched: Set<number>,
  config: LevelConfig
): Set<number> {
  if (!config.specialBombs) return matched;
  const extra = new Set(matched);
  const byId = new Map(tiles.map((tile) => [tile.id, tile]));
  matched.forEach((id) => {
    const tile = byId.get(id);
    if (!tile || tile.value < 8) return;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const neighbor = tiles.find(
          (candidate) =>
            candidate.row === tile.row + dr && candidate.col === tile.col + dc
        );
        if (neighbor) extra.add(neighbor.id);
      }
    }
  });
  return extra;
}

export function findAutoMatches(tiles: Tile[], config: LevelConfig): number[] {
  const grid = new Map<string, Tile>();
  tiles.forEach((tile) => grid.set(`${tile.row},${tile.col}`, tile));
  const matched = new Set<number>();

  for (let row = 0; row < config.rows; row++) {
    const line: Tile[] = [];
    for (let col = 0; col < config.cols; col++) {
      const tile = tileAt(grid, row, col);
      if (tile) line.push(tile);
    }
    collectLineMatches(line, config, matched);
  }

  for (let col = 0; col < config.cols; col++) {
    const line: Tile[] = [];
    for (let row = 0; row < config.rows; row++) {
      const tile = tileAt(grid, row, col);
      if (tile) line.push(tile);
    }
    collectLineMatches(line, config, matched);
  }

  if (config.allowDiagonals) {
    const diagonals: Tile[][] = [];
    for (let startCol = 0; startCol < config.cols; startCol++) {
      const down: Tile[] = [];
      const up: Tile[] = [];
      for (let i = 0; startCol + i < config.cols && i < config.rows; i++) {
        const a = tileAt(grid, i, startCol + i);
        const b = tileAt(grid, config.rows - 1 - i, startCol + i);
        if (a) down.push(a);
        if (b) up.push(b);
      }
      diagonals.push(down, up);
    }
    for (let startRow = 1; startRow < config.rows; startRow++) {
      const down: Tile[] = [];
      const up: Tile[] = [];
      for (let i = 0; startRow + i < config.rows && i < config.cols; i++) {
        const a = tileAt(grid, startRow + i, i);
        const b = tileAt(grid, startRow - i, i);
        if (a) down.push(a);
        if (b && startRow - i >= 0) up.push(b);
      }
      diagonals.push(down, up);
    }
    diagonals.forEach((line) => collectLineMatches(line, config, matched));
  }

  return Array.from(expandBombs(tiles, matched, config));
}

export function expandPlayerClear(
  tiles: Tile[],
  matchedIds: number[],
  config: LevelConfig
): number[] {
  return Array.from(expandBombs(tiles, new Set(matchedIds), config));
}

export function findHintPath(
  tiles: Tile[],
  config: LevelConfig
): Tile[] | null {
  const grid = new Map<string, Tile>();
  tiles.forEach((tile) => grid.set(`${tile.row},${tile.col}`, tile));
  const starts = tiles.filter((tile) => tile.state !== "clearing");
  for (let i = starts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = starts[i];
    starts[i] = starts[j];
    starts[j] = swap;
  }

  const visit = (path: Tile[]): Tile[] | null => {
    if (isValidPlayerPath(path, config)) return path;
    if (path.length >= 8) return null;
    const last = path[path.length - 1];
    for (const neighbor of neighborsOf(last, config)) {
      const tile = tileAt(grid, neighbor.row, neighbor.col);
      if (!tile || tile.state === "clearing") continue;
      if (!canExtendPath(path, tile, config)) continue;
      const found = visit([...path, tile]);
      if (found) return found;
    }
    return null;
  };

  for (const start of starts) {
    const found = visit([start]);
    if (found) return found;
  }
  return null;
}

export function hasPlayableMove(tiles: Tile[], config: LevelConfig): boolean {
  const grid = new Map<string, Tile>();
  tiles.forEach((tile) => grid.set(`${tile.row},${tile.col}`, tile));

  const visit = (path: Tile[]): boolean => {
    if (isValidPlayerPath(path, config)) return true;
    if (path.length >= 8) return false;
    const last = path[path.length - 1];
    for (const neighbor of neighborsOf(last, config)) {
      const tile = tileAt(grid, neighbor.row, neighbor.col);
      if (!tile || tile.state === "clearing") continue;
      if (!canExtendPath(path, tile, config)) continue;
      if (visit([...path, tile])) return true;
    }
    return false;
  };

  return tiles.some((tile) => tile.state !== "clearing" && visit([tile]));
}

function plantEqualityRun(tiles: Tile[], config: LevelConfig) {
  const maxCol = config.cols - config.minMatchLength;
  const row = Math.floor(Math.random() * config.rows);
  const col = Math.floor(Math.random() * Math.max(1, maxCol + 1));
  const value = randomValue(config);
  for (let i = 0; i < config.minMatchLength; i++) {
    const tile = tiles.find(
      (candidate) => candidate.row === row && candidate.col === col + i
    );
    if (tile) tile.value = value;
  }
}

export function createInitialBoard(
  config: LevelConfig,
  startId = 1
): { tiles: Tile[]; nextId: number } {
  let nextId = startId;
  const tiles: Tile[] = [];

  for (let row = 0; row < config.rows; row++) {
    for (let col = 0; col < config.cols; col++) {
      tiles.push({
        id: nextId++,
        row,
        col,
        value: randomValue(config),
        state: "idle",
        fallMs: FALL_BASE_MS,
        delayMs: 0,
      });
    }
  }

  if (!hasPlayableMove(tiles, config)) {
    plantEqualityRun(tiles, config);
  }

  return { tiles, nextId };
}

export const CLEAR_MS = 180;
export const CLEAR_STAGGER_MS = 18;
export const FALL_BASE_MS = 140;
export const FALL_MS_PER_ROW = 36;
export const MAX_FALL_MS = 320;
export const OVERLAY_MS = 1100;

export function fallMs(rowsMoved: number): number {
  return Math.min(
    MAX_FALL_MS,
    FALL_BASE_MS + Math.max(1, Math.abs(rowsMoved)) * FALL_MS_PER_ROW
  );
}

export function clearWait(count: number): number {
  return CLEAR_MS + Math.max(0, count - 1) * CLEAR_STAGGER_MS;
}

export function lengthBonus(tileCount: number): number {
  if (tileCount >= 6) return 4;
  if (tileCount >= 5) return 2.5;
  if (tileCount >= 4) return 1.8;
  return 1;
}

export function pointsForClear(tileCount: number, chainIndex: number): number {
  return Math.round(tileCount * 40 * lengthBonus(tileCount) * 2 ** chainIndex);
}

export function formatScore(value: number): string {
  return value.toLocaleString("en-US");
}

export function shuffleUntilPlayable(tiles: Tile[], config: LevelConfig) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const values = tiles.map((tile) => tile.value);
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = values[i];
      values[i] = values[j];
      values[j] = swap;
    }
    tiles.forEach((tile, index) => {
      tile.value = values[index];
      tile.state = "idle";
    });
    if (hasPlayableMove(tiles, config)) return;
  }
  plantEqualityRun(tiles, config);
}

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
