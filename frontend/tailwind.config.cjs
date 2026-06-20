/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#fbf9f1",
        "paper-soft": "#f5f4eb",
        "paper-strong": "#ffffff",
        ink: "#1b1c17",
        muted: "#5f645b",
        outline: "#d9d6cc",
        primary: "#344b2e",
        "primary-soft": "#cfebc3",
        "primary-mist": "#e8f2e2",
        secondary: "#545f73",
        clay: "#7a4a2c",
        danger: "#d45143",
        "danger-soft": "#ffe1dc",
        income: "#bfe5b4",
        expense: "#f6cbc4",
      },
      boxShadow: {
        paper: "0 4px 20px rgba(0, 0, 0, 0.04)",
      },
      fontFamily: {
        sans: ['"Geist"', '"Aptos"', '"Segoe UI"', "sans-serif"],
      },
    },
  },
  plugins: [],
};
