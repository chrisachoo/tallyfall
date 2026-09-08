import { component$, type QRL } from "@builder.io/qwik";
import { formatScore } from "./logic";
import type { LevelConfig } from "./types";

interface GameHudProps {
  config: LevelConfig;
  levelScore: number;
  totalScore: number;
  bestScore: number;
  movesLeft: number;
  hintsLeft: number;
  combo: number;
  muted: boolean;
  onMute$: QRL<() => void>;
  onReset$: QRL<() => void>;
  onHint$: QRL<() => void>;
}

const IconReset = () => (
  <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" aria-hidden="true">
    <path
      d="M4.5 12a7.5 7.5 0 0 1 12.7-5.4M19.5 12a7.5 7.5 0 0 1-12.7 5.4"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
    <path
      d="M16.5 3.8v3.7h3.7M7.5 20.2v-3.7H3.8"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

const IconSoundOn = () => (
  <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" aria-hidden="true">
    <path d="M4 10v4h3.2L12 18.5V5.5L7.2 10H4Z" fill="currentColor" />
    <path
      d="M16 9.2a3.6 3.6 0 0 1 0 5.6M18.4 7a6.4 6.4 0 0 1 0 10"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
    />
  </svg>
);

const IconSoundOff = () => (
  <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" aria-hidden="true">
    <path d="M4 10v4h3.2L12 18.5V5.5L7.2 10H4Z" fill="currentColor" />
    <path
      d="M16 10.5 20.5 15M20.5 10.5 16 15"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
    />
  </svg>
);

const IconHint = () => (
  <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" aria-hidden="true">
    <path
      d="M9.2 18h5.6M10 21h4"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
    />
    <path
      d="M12 3.2A6.4 6.4 0 0 0 8.1 14c.5.6.9 1.3.9 2.1h6c0-.8.4-1.5.9-2.1A6.4 6.4 0 0 0 12 3.2Z"
      fill="currentColor"
    />
  </svg>
);

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      class={`h-4 w-4 ${filled ? "text-amber-300" : "text-white/20"}`}
      aria-hidden="true"
    >
      <path
        d="M12 2.6 14.6 9l6.9.6-5.3 4.5 1.7 6.7L12 17.5 6.1 20.8l1.7-6.7L2.5 9.6 9.4 9 12 2.6Z"
        fill="currentColor"
      />
    </svg>
  );
}

export const GameHud = component$<GameHudProps>(
  ({
    config,
    levelScore,
    totalScore,
    bestScore,
    movesLeft,
    hintsLeft,
    combo,
    muted,
    onMute$,
    onReset$,
    onHint$,
  }) => {
    const progress = Math.min(100, (levelScore / config.targetScore) * 100);
    const stars =
      progress >= 100 ? 3 : progress >= 66 ? 2 : progress >= 33 ? 1 : 0;
    const comboScale = Math.min(1.35, 1 + Math.max(0, combo - 1) * 0.12);
    const hintsGone = hintsLeft <= 0;

    return (
      <header class="relative w-full pb-2 text-slate-100">
        <div class="flex items-center justify-between gap-3">
          <button
            type="button"
            class="hud-btn"
            onClick$={onReset$}
            aria-label="Restart level"
          >
            <IconReset />
          </button>

          <div class="min-w-0 flex-1 text-center">
            <p class="m-0 text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-200">
              Level {config.level}
            </p>
            <p class="mt-0.5 m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {config.ruleLabel}
            </p>
          </div>

          <button
            type="button"
            class="hud-btn"
            onClick$={onMute$}
            aria-pressed={muted}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <IconSoundOff /> : <IconSoundOn />}
          </button>
        </div>

        <div class="mt-3 flex items-end justify-between gap-3">
          <div>
            <p class="m-0 text-[32px] font-black tracking-tight tabular-nums leading-none">
              {formatScore(levelScore)}
            </p>
            <p class="mt-1 m-0 text-[11px] font-semibold text-slate-500">
              Goal {formatScore(config.targetScore)}
              {bestScore > 0 ? ` · Best ${formatScore(bestScore)}` : ""}
            </p>
          </div>
          <div class="flex items-end gap-3">
            <div class="flex flex-col items-center">
              <button
                type="button"
                class={`hint-booster ${hintsGone ? "hint-booster-empty" : ""}`}
                onClick$={onHint$}
                disabled={hintsGone}
                aria-label={
                  hintsGone
                    ? "No hints left this level"
                    : `Show a hint, ${hintsLeft} left`
                }
              >
                <IconHint />
                <span class="hint-badge" aria-hidden="true">
                  {hintsLeft}
                </span>
              </button>
              <p class="mt-1 mb-0 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Hint
              </p>
            </div>
            <div class="flex flex-col items-center">
              <div class="moves-orb">
                <p class="m-0 text-xl font-black tabular-nums text-amber-200">
                  {movesLeft}
                </p>
              </div>
              <p class="mt-1 mb-0 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Moves
              </p>
            </div>
          </div>
        </div>

        <div class="mt-2 flex items-center justify-center gap-1 leading-none">
          <Star filled={stars >= 1} />
          <Star filled={stars >= 2} />
          <Star filled={stars >= 3} />
        </div>

        {combo > 1 && (
          <div
            class="combo-toast"
            key={combo}
            style={{ "--combo-scale": String(comboScale) }}
          >
            chain x{combo}
          </div>
        )}
        <div class="sr-only" aria-live="polite">
          {combo > 1 ? `Chain multiplier ${combo}` : ""}
          {` ${movesLeft} moves left. ${hintsLeft} hints left. Total ${formatScore(totalScore)}.`}
        </div>
        <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full bg-linear-to-r from-cyan-300 to-amber-300 transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>
    );
  }
);
