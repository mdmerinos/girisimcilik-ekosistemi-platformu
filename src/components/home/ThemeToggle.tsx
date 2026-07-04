"use client";

import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";

function subscribe(callback: () => void) {
  const handleChange = () => callback();
  window.addEventListener("storage", handleChange);
  window.addEventListener("atlas-theme-change", handleChange);
  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener("atlas-theme-change", handleChange);
  };
}

function getThemeSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function getServerThemeSnapshot(): Theme {
  return "light";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribe,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("atlas-theme", next);
    window.dispatchEvent(new Event("atlas-theme-change"));
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
