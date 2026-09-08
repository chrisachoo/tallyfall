This is converging into something great — a **numeric match-cascade game**: Candy Crush's clearing satisfaction, but the match logic runs on number relationships instead of matching icons, which gives you infinite procedural depth (no art assets to make, no levels to hand-design forever).

Let me break down the mechanic properly.

## Core match logic

Instead of matching identical candies, tiles match by **numeric relationship**, and you can layer in more than one rule as difficulty rises:

- **Level 1 — Equality match:** clear 3+ same-number tiles in a row/column/diagonal (like Candy Crush but honest — no color reskin needed).
- **Level 2 — Sum match:** clear any adjacent run where the numbers sum to a target (e.g., sum to 10 — Tenfold's hook, but spatial instead of pair-tap).
- **Level 3 — Sequence match:** clear ascending/descending runs (2-3-4, or 9-7-5 for "skip" patterns) — this is where "human brain loves patterns" really kicks in, because spotting a hidden sequence feels like _insight_, not just matching.
- **Level 4 — Mixed/dual-rule:** board runs two active rules at once (e.g., equality OR sum-to-10), forcing the brain to scan two patterns simultaneously — this is your "getting harder" lever without ever needing new content.

## Chain reactions (this is the addictive core)

Here's the mechanic that gives Candy Crush its dopamine spike, adapted for numbers:

1. Player clears a run → tiles above fall down (gravity) → new numbers drop in from the top.
2. If the _falling_ tiles happen to complete another valid match on landing → **auto-clear, no input needed** → combo multiplier increases.
3. Each chain link plays an escalating sound/visual pulse (pitch rises per link) — this auditory escalation is what makes an unplanned 4-chain combo feel like you _earned_ something huge, even though it was partly luck.
4. Score isn't linear per chain — make it exponential-ish (1x, 2x, 4x, 8x) so a lucky cascade feels genuinely special, not just "a bit more points." That's the variable-reward jackpot moment players chase.

Let me sketch this visually so the direction/chain logic is concrete:Now let's talk about how this scales into actual **levels** without you ever writing content by hand — since that was your core requirement.

## Level design without manual content

Levels aren't hand-built puzzles here — they're **rule-set configurations**, generated procedurally. A "level" is really just a parameter object:

| Level tier | What changes                                                                                                  | Why it feels new                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1–5        | Only equality matches, 3-in-a-row minimum, generous number range (1-5)                                        | Teaches the core gesture                                                                                                        |
| 6–10       | Diagonals unlock, minimum match drops to acceptable 3 but board shrinks slightly                              | Same rule, spatial difficulty rises                                                                                             |
| 11–15      | Sum-match rule layers in alongside equality                                                                   | Player has to hold two rule types in mind — this is the real "pattern brain" moment                                             |
| 16+        | Timed pressure or limited moves per board, chain-reaction bonus zones (special tiles that explode a 3x3 area) | Classic Candy Crush "special tile" excitement, but the special tile is just "clear a number ≥ 8" — still zero content authoring |

You can generate infinite levels by just varying: grid size, number range, active rule(s), move/time limit, and target score. That's a JSON config, not game design labor — a spreadsheet of 200 levels takes an hour to generate with a script, not months of level design.

## Making it feel "snappy" specifically (your explicit ask)

This is where most indie match games fail, so worth being precise:

- **Input-to-feedback latency under 100ms** — tile selection highlight must appear the frame you touch/click, not after validation.
- **Optimistic UI** — start the clear animation before the "was this valid?" check even finishes; number games are simple enough that validation is near-instant anyway, but architecturally treat it as if it weren't.
- **Physically-plausible fall physics** — a slight ease-in acceleration on falling tiles (not linear) reads as "real," linear reads as "cheap."
- **Qwik specifically helps here**: since it ships no JS until interaction and resumes instantly (no hydration wait), your very _first_ tap on page load feels as snappy as your 500th tap. Most web games lose the first 1-2 seconds to hydration jank — Qwik is one of the only frameworks that structurally avoids that.

One thing worth deciding before we prototype: do you want **gravity-based falling** (Candy Crush style — tiles drop from top, chain reactions cascade downward) or **static swap** (Flow Free style — you trace a connected path, tiles vanish in place, no falling)? Falling gives you the addictive cascade/chain-reaction visual, but static swap is often easier to get "snappy" on mobile since there's less to animate per move. Given you specifically want chain reactions, I'd lean falling — but wanted to flag the tradeoff before we lock the architecture.

My recommendation: **go with gravity-falling, but make the input gesture a drag/trace (like Flow Free) instead of tap-select**. This gets you the best of both worlds — the visually satisfying cascade of Candy Crush, with the tactile, continuous-touch feel of Flow Free that's genuinely superior on mobile (a drag feels more "alive" under your thumb than discrete taps, and it naturally produces the touch feedback you're asking about).

## Animation strategy — cool but cheap

The rule that matters most: **only animate `transform` and `opacity`.** Everything else (`width`, `top`, `left`, box-shadow blur, filter) forces the browser to repaint/reflow and is what makes mobile games feel janky. Every visual effect below is built entirely from those two properties, which run on the GPU compositor thread — meaning they stay smooth even while your JS is busy validating a match.

Concretely:

- **Tile fall** → `transform: translateY()` with a CSS `cubic-bezier` ease (not linear — gives that "real weight" feel), never animate `top`.
- **Tile clear** → scale to 0 + fade opacity, ~150ms. Stagger each tile in the match by ~20ms so it reads as a "pop" wave, not a simultaneous blink.
- **Chain reaction escalation** → each successive chain link gets a slightly bigger scale-punch (1.0 → 1.15 → 1.3 on the multiplier badge) — cheap to do, huge perceived-impact payoff.
- **Screen shake on big combos** → transform the whole board container by a few px in a decaying random pattern for ~200ms. Costs nothing (one element), reads as "impact."
- **Particle burst on clear** → don't use a physics library. Pre-generate 6-8 small divs/SVG circles per burst with randomized CSS custom-property offsets, animate them with a single shared `@keyframes`, and let them get removed from the DOM on `animationend`. This avoids any per-frame JS loop entirely — the browser handles it.

**Performance guardrail:** cap simultaneous animating elements (roughly 30-40 tiles + particles max on screen at once) and always wrap animation in `@media (prefers-reduced-motion: no-preference)` — free accessibility win, no cost to you.

## Mobile touch feedback

This is what makes the difference between "a game" and "a game people can't put down":

- **Haptics** — fire `navigator.vibrate(10)` (a tiny 10-15ms pulse) on tile pick-up, and a slightly longer/double pulse on a successful clear. This single feature disproportionately increases perceived "juiciness" — it's cheap and most casual games skip it.
- **Instant visual pickup feedback** — the tile under your finger should scale up slightly (1.0 → 1.08) and gain a subtle border/glow the _instant_ touch starts, before you even know if the drag will be valid. This removes any felt latency.
- **Live path preview while dragging** — draw the connecting line/highlight between tiles in real time as the finger moves, using `pointermove`, not `touchmove` (pointer events unify mouse/touch and are lighter to reason about). Update via a ref-driven imperative DOM write, not a reactive re-render per pixel moved — critical for perf.
- **Generous hit targets** — actual tap/drag hit area should be ~10-15% larger than the visual tile, so near-misses on small phone screens still register. Nothing kills "addictive" faster than a game that feels unresponsive.
- **Release feedback** — invalid drag = a quick "shake no" wobble (transform rotate ±3deg twice) + a soft haptic buzz; valid = the clear cascade. Every single input needs _some_ physical response, success or fail — that constant feedback loop is what pattern-seeking brains latch onto.

## Qwik-specific implementation note

For the drag-tracking and fall animations, don't route every pointer-move through Qwik's reactive signals — that would trigger unnecessary re-renders per frame. Instead, grab a DOM ref via `useSignal<HTMLElement>()` and mutate `style.transform` directly inside the pointermove handler (plain imperative DOM writes), only touching Qwik signals at the _end_ of a gesture (drop/match resolution) when you actually need state + UI to sync. This keeps Qwik doing what it's best at — near-zero JS shipped until interaction — while your 60fps drag-tracking stays outside its reactivity system entirely.
