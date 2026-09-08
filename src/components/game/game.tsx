import {
  $,
  component$,
  useSignal,
  useStore,
  useVisibleTask$,
} from "@builder.io/qwik";
import { playClearTone, playInvalidTone, setMuted } from "./audio";
import { GameHud } from "./game-hud";
import {
  CLEAR_MS,
  OVERLAY_MS,
  canExtendPath,
  clearWait,
  computeGravity,
  createInitialBoard,
  expandPlayerClear,
  fallMs,
  findAutoMatches,
  findHintPath,
  hasPlayableMove,
  isValidPlayerPath,
  nextAnimationFrame,
  pointsForClear,
  shuffleUntilPlayable,
  sleep,
} from "./logic";
import { loadPrefs, savePrefs } from "./persist";
import { TileView } from "./tile";
import {
  VALUE_COLORS,
  getLevelConfig,
  type LevelConfig,
  type Tile,
} from "./types";

interface Banner {
  title: string;
  body: string;
  lock: boolean;
}

interface GameState {
  level: number;
  config: LevelConfig;
  tiles: Tile[];
  nextId: number;
  levelScore: number;
  totalScore: number;
  bestScore: number;
  movesLeft: number;
  combo: number;
  isResolving: boolean;
  muted: boolean;
  seenHint: boolean;
  hintsLeft: number;
  hintIds: number[];
  banner: Banner | null;
}

const initial = createInitialBoard(getLevelConfig(1));

export const Game = component$(() => {
  const store = useStore<GameState>({
    level: 1,
    config: getLevelConfig(1),
    tiles: initial.tiles,
    nextId: initial.nextId,
    levelScore: 0,
    totalScore: 0,
    bestScore: 0,
    movesLeft: getLevelConfig(1).maxMoves,
    combo: 0,
    isResolving: false,
    muted: false,
    seenHint: true,
    hintsLeft: getLevelConfig(1).maxHints,
    hintIds: [],
    banner: null,
  });

  const wrapRef = useSignal<HTMLDivElement>();
  const boardRef = useSignal<HTMLDivElement>();
  const lineRef = useSignal<SVGLineElement>();
  const polyRef = useSignal<SVGPolylineElement>();
  const hintPolyRef = useSignal<SVGPolylineElement>();
  const burstRef = useSignal<HTMLDivElement>();
  const tileSize = useSignal(48);

  const boardWidth = store.config.cols * tileSize.value;
  const boardHeight = store.config.rows * tileSize.value;

  // Native pointer tracking stays off Qwik's render path so 60fps drags
  // don't serialize a QRL on every move — see src/guide.md.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(
    ({ cleanup }) => {
      const prefs = loadPrefs();
      store.bestScore = prefs.bestScore;
      store.muted = prefs.muted;
      store.seenHint = prefs.seenHint;
      setMuted(prefs.muted);
      if (!prefs.seenHint) {
        store.banner = {
          title: "How to play",
          body: "Drag matching numbers. Beat the goal before you run out of moves.",
          lock: true,
        };
      }

      const getBoard = () => boardRef.value;
      const getWrap = () => wrapRef.value;

      const measure = () => {
        const wrap = getWrap();
        if (!wrap) return;
        const cols = store.config.cols;
        const rows = store.config.rows;
        const availW = wrap.clientWidth;
        const top = wrap.getBoundingClientRect().top;
        const availH = window.innerHeight - top - 56;
        const next = Math.max(
          34,
          Math.min(56, Math.floor(availW / cols), Math.floor(availH / rows))
        );
        if (next !== tileSize.value) tileSize.value = next;
      };

      const wrap = getWrap();
      const observer = new ResizeObserver(measure);
      if (wrap) observer.observe(wrap);
      window.addEventListener("resize", measure);

      let pointerId: number | null = null;
      let gesture: Tile[] = [];

      const size = () => tileSize.value;

      const tileEl = (id: number) =>
        getBoard()?.querySelector<HTMLElement>(`[data-tile-id="${id}"]`);

      const findTile = (row: number, col: number) =>
        store.tiles.find(
          (tile) =>
            tile.row === row && tile.col === col && tile.state !== "clearing"
        );

      const cellFromPoint = (clientX: number, clientY: number) => {
        const board = getBoard();
        if (!board) return null;
        const rect = board.getBoundingClientRect();
        const tile = size();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const col = Math.max(
          0,
          Math.min(store.config.cols - 1, Math.round(x / tile - 0.5))
        );
        const row = Math.max(
          0,
          Math.min(store.config.rows - 1, Math.round(y / tile - 0.5))
        );
        const cx = (col + 0.5) * tile;
        const cy = (row + 0.5) * tile;
        if (Math.hypot(x - cx, y - cy) > tile * 0.68) return null;
        return { row, col };
      };

      const setLiveLine = (x1: number, y1: number, x2: number, y2: number) => {
        const line = lineRef.value;
        if (!line) return;
        line.setAttribute("x1", String(x1));
        line.setAttribute("y1", String(y1));
        line.setAttribute("x2", String(x2));
        line.setAttribute("y2", String(y2));
        line.style.opacity = "1";
      };

      const hideLiveLine = () => {
        const line = lineRef.value;
        if (line) line.style.opacity = "0";
      };

      const centerOf = (tile: Tile) => {
        const tilePx = size();
        return {
          x: tile.col * tilePx + tilePx / 2,
          y: tile.row * tilePx + tilePx / 2,
        };
      };

      const pathColor = () => {
        const first = gesture[0];
        return first ? (VALUE_COLORS[first.value] ?? "#fff") : "#fff";
      };

      const paintPath = () => {
        const color = pathColor();
        const poly = polyRef.value;
        if (poly) {
          poly.setAttribute(
            "points",
            gesture
              .map((tile) => {
                const { x, y } = centerOf(tile);
                return `${x},${y}`;
              })
              .join(" ")
          );
          poly.style.stroke = color;
        }
        const line = lineRef.value;
        if (line) line.style.stroke = color;
        if (gesture.length > 0) {
          const last = centerOf(gesture[gesture.length - 1]);
          setLiveLine(last.x, last.y, last.x, last.y);
        }
      };

      const selectTile = (tile: Tile) => {
        const el = tileEl(tile.id);
        if (!el) return;
        const tilePx = size();
        el.classList.add("tile-selected");
        el.style.transitionDuration = "90ms, 160ms";
        el.style.transform = `translate(${tile.col * tilePx}px, ${tile.row * tilePx}px) scale(1.08)`;
      };

      const unselectTile = (tile: Tile) => {
        const el = tileEl(tile.id);
        if (!el) return;
        const tilePx = size();
        el.classList.remove("tile-selected");
        el.style.transitionDuration = `${tile.fallMs}ms, 160ms`;
        el.style.transform = `translate(${tile.col * tilePx}px, ${tile.row * tilePx}px) scale(1)`;
      };

      const resetGestureVisuals = () => {
        gesture.forEach(unselectTile);
        gesture = [];
        paintPath();
        hideLiveLine();
      };

      const haptic = (pattern: number | number[]) => {
        if (store.muted) return;
        try {
          navigator.vibrate?.(pattern);
        } catch {
          /* iOS and unsupported browsers no-op */
        }
      };

      const burstAt = (x: number, y: number, color: string) => {
        const layer = burstRef.value;
        if (!layer) return;
        for (let i = 0; i < 6; i++) {
          const dot = document.createElement("span");
          dot.className = "burst-dot";
          const angle = (Math.PI * 2 * i) / 6 + Math.random() * 0.35;
          const dist = 16 + Math.random() * 24;
          dot.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
          dot.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
          dot.style.left = `${x}px`;
          dot.style.top = `${y}px`;
          dot.style.background = color;
          dot.addEventListener("animationend", () => dot.remove(), {
            once: true,
          });
          layer.appendChild(dot);
        }
        while (layer.childElementCount > 36) {
          layer.firstElementChild?.remove();
        }
      };

      const floatScore = (x: number, y: number, text: string) => {
        const layer = burstRef.value;
        if (!layer) return;
        const label = document.createElement("span");
        label.className = "score-float";
        label.textContent = text;
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
        label.addEventListener("animationend", () => label.remove(), {
          once: true,
        });
        layer.appendChild(label);
      };

      const centroid = (ids: number[]) => {
        const points = ids
          .map((id) => store.tiles.find((tile) => tile.id === id))
          .filter((tile): tile is Tile => Boolean(tile))
          .map((tile) => centerOf(tile));
        if (points.length === 0) {
          const tilePx = size();
          return {
            x: (tilePx * store.config.cols) / 2,
            y: (tilePx * store.config.rows) / 2,
          };
        }
        return {
          x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
          y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        };
      };

      const addPoints = (amount: number, ids: number[], extra = "") => {
        store.levelScore += amount;
        store.totalScore += amount;
        if (store.totalScore > store.bestScore) {
          store.bestScore = store.totalScore;
          savePrefs({
            bestScore: store.bestScore,
            muted: store.muted,
            seenHint: store.seenHint,
          });
        }
        const { x, y } = centroid(ids);
        floatScore(x, y, extra ? `+${amount} ${extra}` : `+${amount}`);
      };

      const shakeBoard = () => {
        const board = getBoard();
        if (!board) return;
        board.classList.remove("board-shake");
        void board.offsetWidth;
        board.classList.add("board-shake");
        window.setTimeout(() => board.classList.remove("board-shake"), 220);
      };

      const shakeTiles = (tiles: Tile[]) => {
        tiles.forEach((tile) => {
          const el = tileEl(tile.id);
          if (!el) return;
          el.classList.remove("tile-shake");
          void el.offsetWidth;
          el.classList.add("tile-shake");
          window.setTimeout(() => el.classList.remove("tile-shake"), 280);
        });
      };

      const markClearing = (ids: number[]) => {
        ids.forEach((id, index) => {
          const tile = store.tiles.find((candidate) => candidate.id === id);
          if (!tile) return;
          tile.delayMs = index * 18;
          tile.fallMs = CLEAR_MS;
          tile.state = "clearing";
          const { x, y } = centerOf(tile);
          burstAt(x, y, VALUE_COLORS[tile.value] ?? "#fff");
        });
      };

      const dropTiles = async (
        moved: { id: number; row: number }[],
        spawned: Tile[]
      ) => {
        let maxWait = 0;
        moved.forEach((item) => {
          const tile = store.tiles.find(
            (candidate) => candidate.id === item.id
          );
          if (!tile) return;
          const distance = Math.abs(item.row - tile.row);
          tile.fallMs = fallMs(distance);
          tile.delayMs = 0;
          tile.row = item.row;
          maxWait = Math.max(maxWait, tile.fallMs);
        });

        const offscreen = spawned.map((tile) => ({
          ...tile,
          row: tile.row - store.config.rows,
          fallMs: fallMs(store.config.rows),
        }));
        if (offscreen.length > 0) {
          maxWait = Math.max(maxWait, fallMs(store.config.rows));
          store.tiles = [...store.tiles, ...offscreen];
          await nextAnimationFrame();
          spawned.forEach((spawn) => {
            const tile = store.tiles.find(
              (candidate) => candidate.id === spawn.id
            );
            if (tile) {
              tile.fallMs = fallMs(store.config.rows);
              tile.row = spawn.row;
            }
          });
        }
        await sleep(maxWait || fallMs(1));
      };

      const ensureMoves = async () => {
        if (hasPlayableMove(store.tiles, store.config)) return;
        shuffleUntilPlayable(store.tiles, store.config);
        store.banner = {
          title: "No moves",
          body: "Board shuffled",
          lock: false,
        };
        await sleep(800);
        if (store.banner?.title === "No moves") store.banner = null;
      };

      const settleBoard = async () => {
        let chaining = true;
        let chain = 0;
        while (chaining) {
          if (document.hidden) {
            await sleep(50);
          }
          const { moved, spawned, nextId } = computeGravity(
            store.tiles,
            store.config,
            store.nextId
          );
          store.nextId = nextId;
          await dropTiles(moved, spawned);

          const autoMatches = findAutoMatches(store.tiles, store.config);
          if (autoMatches.length > 0 && chain < 12) {
            chain += 1;
            store.combo = chain + 1;
            addPoints(
              pointsForClear(autoMatches.length, chain),
              autoMatches,
              `x${2 ** chain}`
            );
            haptic([10, 30, 10]);
            playClearTone(chain);
            if (chain >= 2) shakeBoard();
            markClearing(autoMatches);
            await sleep(clearWait(autoMatches.length));
            store.tiles = store.tiles.filter(
              (tile) => !autoMatches.includes(tile.id)
            );
          } else {
            chaining = false;
          }
        }
      };

      const advanceLevel = async () => {
        const nextLevel = store.level + 1;
        const nextConfig = getLevelConfig(nextLevel);
        store.banner = {
          title: `Level ${nextLevel}`,
          body:
            nextLevel % 5 === 1
              ? nextConfig.intro
              : `Score ${nextConfig.targetScore.toLocaleString("en-US")} in ${nextConfig.maxMoves} moves.`,
          lock: true,
        };
        const board = getBoard();
        board?.classList.add("board-exit");
        await sleep(280);
        store.level = nextLevel;
        store.config = nextConfig;
        store.levelScore = 0;
        store.movesLeft = nextConfig.maxMoves;
        store.hintsLeft = nextConfig.maxHints;
        store.hintIds = [];
        const next = createInitialBoard(nextConfig, store.nextId);
        store.nextId = next.nextId;
        store.tiles = next.tiles.map((tile) => ({
          ...tile,
          row: tile.row - nextConfig.rows,
          fallMs: fallMs(nextConfig.rows),
        }));
        board?.classList.remove("board-exit");
        await nextAnimationFrame();
        const finals = next.tiles.map((tile) => tile.row);
        store.tiles.forEach((tile, index) => {
          tile.fallMs = fallMs(nextConfig.rows);
          tile.row = finals[index] ?? tile.row + nextConfig.rows;
        });
        await sleep(Math.max(OVERLAY_MS, fallMs(nextConfig.rows)));
        store.banner = null;
        measure();
      };

      const resolveMatch = async (matched: Tile[]) => {
        store.isResolving = true;
        const ids = expandPlayerClear(
          store.tiles,
          matched.map((tile) => tile.id),
          store.config
        );
        addPoints(pointsForClear(ids.length, 0), ids);
        store.combo = 1;
        store.movesLeft = Math.max(0, store.movesLeft - 1);
        haptic(20);
        playClearTone(0);
        markClearing(ids);
        await sleep(clearWait(ids.length));
        store.tiles = store.tiles.filter((tile) => !ids.includes(tile.id));
        await settleBoard();
        if (store.levelScore >= store.config.targetScore) {
          await advanceLevel();
        } else if (store.movesLeft <= 0) {
          store.banner = {
            title: "Out of moves",
            body: `Score ${store.levelScore.toLocaleString("en-US")} / ${store.config.targetScore.toLocaleString("en-US")}. Try the level again.`,
            lock: true,
          };
        } else {
          await ensureMoves();
        }
        store.isResolving = false;
        if (store.combo > 1) {
          const flashed = store.combo;
          window.setTimeout(() => {
            if (store.combo === flashed) store.combo = 0;
          }, 900);
        } else {
          store.combo = 0;
        }
      };

      const tryAddCell = (cell: { row: number; col: number }) => {
        const tile = findTile(cell.row, cell.col);
        if (!tile) return;
        const last = gesture[gesture.length - 1];
        if (last && tile.id === last.id) return;

        if (gesture.length >= 2 && tile.id === gesture[gesture.length - 2].id) {
          const removed = gesture.pop();
          if (removed) unselectTile(removed);
          paintPath();
          return;
        }

        if (!canExtendPath(gesture, tile, store.config)) return;
        gesture = [...gesture, tile];
        selectTile(tile);
        paintPath();
        haptic(6);
      };

      const onDown = (event: PointerEvent) => {
        if (store.isResolving || store.banner?.lock || pointerId !== null)
          return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        const board = getBoard();
        if (!board) return;
        const rect = board.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientY < rect.top ||
          event.clientX > rect.right ||
          event.clientY > rect.bottom
        ) {
          return;
        }
        event.preventDefault();
        const cell = cellFromPoint(event.clientX, event.clientY);
        if (!cell) return;
        const tile = findTile(cell.row, cell.col);
        if (!tile) return;

        pointerId = event.pointerId;
        try {
          board.setPointerCapture(event.pointerId);
        } catch {
          /* synthetic / unsupported capture */
        }
        hintPolyRef.value?.setAttribute("points", "");
        board
          .querySelectorAll(".tile-hint")
          .forEach((el) => el.classList.remove("tile-hint"));
        gesture = [tile];
        selectTile(tile);
        paintPath();
        haptic(10);
      };

      const onMove = (event: PointerEvent) => {
        if (pointerId !== event.pointerId || gesture.length === 0) return;
        event.preventDefault();
        const board = getBoard();
        if (!board) return;
        const last = gesture[gesture.length - 1];
        const origin = centerOf(last);
        const rect = board.getBoundingClientRect();
        setLiveLine(
          origin.x,
          origin.y,
          event.clientX - rect.left,
          event.clientY - rect.top
        );

        const cell = cellFromPoint(event.clientX, event.clientY);
        if (!cell) return;

        let cursor = { row: last.row, col: last.col };
        let guard = 0;
        while (
          (cursor.row !== cell.row || cursor.col !== cell.col) &&
          guard++ < 8
        ) {
          const dr = Math.sign(cell.row - cursor.row);
          const dc = Math.sign(cell.col - cursor.col);
          if (store.config.allowDiagonals) {
            cursor = { row: cursor.row + dr, col: cursor.col + dc };
          } else if (
            Math.abs(cell.row - cursor.row) >= Math.abs(cell.col - cursor.col)
          ) {
            cursor = { row: cursor.row + dr, col: cursor.col };
          } else {
            cursor = { row: cursor.row, col: cursor.col + dc };
          }
          tryAddCell(cursor);
        }
      };

      const finishGesture = async () => {
        const path = gesture;
        if (path.length === 0) return;
        if (isValidPlayerPath(path, store.config)) {
          if (store.hintIds.length > 0) store.hintIds = [];
          const snapshot = [...path];
          gesture = [];
          paintPath();
          hideLiveLine();
          await resolveMatch(snapshot);
        } else {
          haptic(15);
          playInvalidTone();
          shakeTiles(path);
          resetGestureVisuals();
          if (store.hintIds.length > 0) {
            window.setTimeout(() => {
              store.hintIds = [];
            }, 300);
          }
        }
      };

      const onUp = (event: PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        pointerId = null;
        const board = getBoard();
        try {
          if (board?.hasPointerCapture(event.pointerId)) {
            board.releasePointerCapture(event.pointerId);
          }
        } catch {
          /* capture may already be released */
        }
        void finishGesture();
      };

      const onCancel = (event: PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        pointerId = null;
        if (store.hintIds.length > 0) store.hintIds = [];
        resetGestureVisuals();
      };

      const onContextMenu = (event: Event) => {
        const board = getBoard();
        if (
          board &&
          event.target instanceof Node &&
          board.contains(event.target)
        ) {
          event.preventDefault();
        }
      };

      window.addEventListener("pointerdown", onDown, { passive: false });
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("contextmenu", onContextMenu);
      measure();

      cleanup(() => {
        observer.disconnect();
        window.removeEventListener("resize", measure);
        window.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("contextmenu", onContextMenu);
      });
    },
    { strategy: "document-ready" }
  );

  return (
    <div
      class="flex w-full max-w-[420px] flex-col items-center gap-2"
      ref={wrapRef}
    >
      <GameHud
        config={store.config}
        levelScore={store.levelScore}
        totalScore={store.totalScore}
        bestScore={store.bestScore}
        movesLeft={store.movesLeft}
        combo={store.combo}
        muted={store.muted}
        hintsLeft={store.hintsLeft}
        onMute$={$(() => {
          store.muted = !store.muted;
          setMuted(store.muted);
          savePrefs({
            bestScore: store.bestScore,
            muted: store.muted,
            seenHint: store.seenHint,
          });
        })}
        onReset$={$(() => {
          if (store.isResolving) return;
          const config = getLevelConfig(store.level);
          const next = createInitialBoard(config, store.nextId);
          store.config = config;
          store.tiles = next.tiles;
          store.nextId = next.nextId;
          store.levelScore = 0;
          store.movesLeft = config.maxMoves;
          store.hintsLeft = config.maxHints;
          store.hintIds = [];
          store.combo = 0;
          store.banner = null;
        })}
        onHint$={$(() => {
          if (store.isResolving || store.banner?.lock) return;
          if (store.hintsLeft <= 0) return;
          const path = findHintPath(store.tiles, store.config);
          if (!path) return;
          store.hintsLeft -= 1;
          store.hintIds = path.map((tile) => tile.id);
        })}
      />
      <div
        class="board relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 shadow-[0_24px_80px_rgba(8,15,35,0.45)]"
        ref={boardRef}
        role="application"
        aria-label="Number cascade board"
        style={{
          width: `${boardWidth}px`,
          height: `${boardHeight}px`,
          backgroundSize: `${100 / store.config.cols}% ${100 / store.config.rows}%`,
        }}
      >
        {store.tiles.map((tile) => (
          <TileView
            key={tile.id}
            tile={tile}
            tileSize={tileSize.value}
            bombsActive={store.config.specialBombs}
            hinted={store.hintIds.includes(tile.id)}
          />
        ))}

        <svg class="path-overlay" width={boardWidth} height={boardHeight}>
          <polyline
            ref={hintPolyRef}
            class="path-hint"
            points={
              store.hintIds.length > 0
                ? store.hintIds
                    .map((id) => {
                      const tile = store.tiles.find((item) => item.id === id);
                      if (!tile) return "";
                      const mid = tileSize.value / 2;
                      return `${tile.col * tileSize.value + mid},${tile.row * tileSize.value + mid}`;
                    })
                    .join(" ")
                : ""
            }
          />
          <polyline ref={polyRef} class="path-line" points="" />
          <line
            ref={lineRef}
            class="path-live"
            style={{ opacity: 0 }}
            x1="0"
            y1="0"
            x2="0"
            y2="0"
          />
        </svg>
        <div class="burst-layer" ref={burstRef} />
        {store.banner && (
          <div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-950/55 p-6">
            <div class="pointer-events-auto max-w-[16rem] rounded-2xl border border-white/15 bg-slate-900/95 px-5 py-4 text-center shadow-xl">
              <p class="m-0 text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-200">
                {store.banner.title}
              </p>
              <p class="mt-2 mb-0 text-sm font-semibold leading-snug text-slate-200">
                {store.banner.body}
              </p>
              {store.banner.lock &&
                (store.banner.title === "How to play" ||
                  store.banner.title === "Out of moves") && (
                  <button
                    type="button"
                    class="mt-3 rounded-full bg-amber-300 px-4 py-1.5 text-xs font-black uppercase tracking-wide text-slate-950"
                    onClick$={$(() => {
                      if (store.banner?.title === "Out of moves") {
                        const config = getLevelConfig(store.level);
                        const next = createInitialBoard(config, store.nextId);
                        store.config = config;
                        store.tiles = next.tiles;
                        store.nextId = next.nextId;
                        store.levelScore = 0;
                        store.movesLeft = config.maxMoves;
                        store.hintsLeft = config.maxHints;
                        store.hintIds = [];
                        store.combo = 0;
                        store.banner = null;
                        return;
                      }
                      store.seenHint = true;
                      store.banner = null;
                      savePrefs({
                        bestScore: store.bestScore,
                        muted: store.muted,
                        seenHint: true,
                      });
                    })}
                  >
                    {store.banner.title === "Out of moves" ? "Retry" : "Play"}
                  </button>
                )}
            </div>
          </div>
        )}
      </div>

      <p class="m-0 max-w-[28em] px-2 text-center text-xs font-semibold leading-snug tracking-wide text-slate-400/80">
        {store.config.hint}
      </p>
    </div>
  );
});
