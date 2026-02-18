/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                "primary": "#f4c025",
                "background-light": "#f8f8f5",
                "background-dark": "#0a0a0a",
                "emerald-deep": "#062010",
                "matte-black": "#141414",
                "felt-green": "#1a3a2a",
            },
            fontFamily: {
                "display": ["Manrope", "sans-serif"]
            },
            animation: {
                pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                ping: "ping 1s cubic-bezier(0, 0, 0.2, 1) infinite",
            },
            keyframes: {
                shimmer: {
                    "100%": {
                        transform: "translateX(100%)",
                    },
                },
            },
        },
    },
    plugins: [],
}
