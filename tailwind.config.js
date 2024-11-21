import forms from "@tailwindcss/forms";
import daisyui from "daisyui";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./main.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [forms, daisyui],
  daisyui: {
    themes: [
      "light",
      "dark",
    ],
    darkTheme: "dark",
  },
};
