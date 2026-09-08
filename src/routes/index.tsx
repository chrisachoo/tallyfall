import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { Game } from "~/components/game/game";

export default component$(() => {
  return (
    <div class="app-shell">
      <Game />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Tallyfall | Number Cascade",
  meta: [
    {
      name: "description",
      content:
        "Drag matching numbers, then watch the cascade. Built for touch.",
    },
    { name: "theme-color", content: "#07111f" },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    { name: "mobile-web-app-capable", content: "yes" },
    {
      name: "apple-mobile-web-app-status-bar-style",
      content: "black-translucent",
    },
  ],
};
