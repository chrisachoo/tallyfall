import { component$ } from "@builder.io/qwik";
import { VALUE_COLORS, type Tile as TileT } from "./types";

interface TileProps {
  tile: TileT;
  tileSize: number;
  bombsActive: boolean;
  hinted?: boolean;
}

export const TileView = component$<TileProps>(
  ({ tile, tileSize, bombsActive, hinted = false }) => {
    const x = tile.col * tileSize;
    const y = tile.row * tileSize;
    const color = VALUE_COLORS[tile.value];
    const isSelected = tile.state === "selected";
    const isClearing = tile.state === "clearing";
    const isBomb = bombsActive && tile.value >= 8;
    const scale = isClearing ? 0 : isSelected ? 1.08 : 1;

    return (
      <div
        class={`tile ${isSelected ? "tile-selected" : ""} ${
          isClearing ? "tile-clearing" : ""
        } ${isBomb ? "tile-bomb" : ""} ${hinted ? "tile-hint" : ""}`}
        data-tile-id={tile.id}
        style={{
          transform: `translate(${x}px, ${y}px) scale(${scale})`,
          opacity: isClearing ? 0 : 1,
          width: `${tileSize - 4}px`,
          height: `${tileSize - 4}px`,
          background: color,
          transitionDuration: `${tile.fallMs}ms, 160ms`,
          transitionDelay: `${tile.delayMs}ms`,
        }}
      >
        <span class="tile-value">{tile.value}</span>
      </div>
    );
  }
);
