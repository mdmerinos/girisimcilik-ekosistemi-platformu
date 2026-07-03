"use client";

import { useState } from "react";

type Theme = "dark" | "light";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("atlas-theme", next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="atlas-control inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold"
      aria-label={theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
    >
      <span aria-hidden="true">{theme === "dark" ? "☾" : "☀"}</span>
      {theme === "dark" ? "Koyu" : "Açık"}
    </button>
  );
}
