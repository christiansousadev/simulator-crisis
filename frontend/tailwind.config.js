/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      // custom breakpoint gating the topbar kpi labels, narrower than the default xl (1280px)
      screens: {
        hd: "1400px",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        heading: ["Rajdhani", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        "pop-in": {
          "0%": { transform: "scale(0.4)", opacity: "0" },
          "60%": { transform: "scale(1.1)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        // subdued dialog entrance -- pop-in's bounce reads great for a toast/badge but is too
        // playful for a settings/dilemma dialog; this is a plain, professional fade+scale-up
        "modal-in": {
          "0%": { transform: "scale(0.96)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "backdrop-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "bounce-panic": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        shake: {
          "0%, 100%": { transform: "translate(0, 0)" },
          "25%": { transform: "translate(-1.5px, 0.5px)" },
          "50%": { transform: "translate(1.5px, -0.5px)" },
          "75%": { transform: "translate(-1px, -1px)" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "float-up-fade": {
          "0%": { transform: "translateY(0)", opacity: "0" },
          "10%": { opacity: "1" },
          "80%": { opacity: "1" },
          "100%": { transform: "translateY(-28px)", opacity: "0" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.2" },
        },
        "dash-flow": {
          "0%": { strokeDashoffset: "20" },
          "100%": { strokeDashoffset: "0" },
        },
        "fan-spin": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "smoke-rise": {
          "0%": { transform: "translateY(0) scale(0.6)", opacity: "0.55" },
          "100%": { transform: "translateY(-22px) scale(1.4)", opacity: "0" },
        },
        "wrench-turn": {
          "0%, 100%": { transform: "rotate(-18deg)" },
          "50%": { transform: "rotate(18deg)" },
        },
        "worker-bob": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-1.4px)" },
        },
        "type-jitter": {
          "0%, 100%": { transform: "translateX(0)" },
          "50%": { transform: "translateX(0.8px)" },
        },
        "steam-rise": {
          "0%": { transform: "translateY(0) scaleX(1)", opacity: "0.7" },
          "100%": { transform: "translateY(-10px) scaleX(1.4)", opacity: "0" },
        },
        "spark-flicker": {
          "0%, 100%": { opacity: "0" },
          "45%": { opacity: "0" },
          "50%": { opacity: "1" },
          "65%": { opacity: "0" },
        },
        "dash-flow-stutter": {
          "0%": { strokeDashoffset: "20" },
          "100%": { strokeDashoffset: "0" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.25" },
          "50%": { opacity: "0.55" },
        },
        "beacon-flash": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "beacon-sweep": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "sprint-bounce": {
          "0%, 100%": { transform: "translateY(0) skewX(-6deg)" },
          "50%": { transform: "translateY(-4px) skewX(-6deg)" },
        },
        "sweat-drop": {
          "0%": { transform: "translateY(0)", opacity: "0.9" },
          "100%": { transform: "translateY(8px)", opacity: "0" },
        },
        "screen-glow-pulse": {
          "0%, 100%": { opacity: "0.15" },
          "50%": { opacity: "0.35" },
        },
        "ball-volley": {
          "0%, 100%": { transform: "translateX(-11px)" },
          "50%": { transform: "translateX(11px)" },
        },
        // scissor walk-cycle: each leg's own <g> is pivoted at its hip via transformOrigin, so
        // this only ever rotates that one leg -- paired with "walk-cycle-right" (opposite phase)
        // to alternate, and applied only while OfficeWorker detects it's actually mid-transition
        "walk-cycle-left": {
          "0%, 100%": { transform: "rotate(16deg)" },
          "50%": { transform: "rotate(-16deg)" },
        },
        "walk-cycle-right": {
          "0%, 100%": { transform: "rotate(-16deg)" },
          "50%": { transform: "rotate(16deg)" },
        },
        // natural, infrequent eye blink (mostly open, briefly shut) rather than a continuous
        // flutter -- each eye's own transformOrigin keeps the squash centered on itself
        "eye-blink": {
          "0%, 90%, 100%": { transform: "scaleY(1)" },
          "95%": { transform: "scaleY(0.12)" },
        },
        "drawer-slide-in": {
          "0%": { transform: "translateX(-16px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "screen-shake-light": {
          "0%, 100%": { transform: "translate(0, 0)" },
          "20%": { transform: "translate(-4px, 2px)" },
          "40%": { transform: "translate(3px, -3px)" },
          "60%": { transform: "translate(-3px, -1px)" },
          "80%": { transform: "translate(2px, 3px)" },
        },
        "screen-shake-heavy": {
          "0%, 100%": { transform: "translate(0, 0) rotate(0deg)" },
          "15%": { transform: "translate(-10px, 6px) rotate(-0.5deg)" },
          "30%": { transform: "translate(9px, -8px) rotate(0.5deg)" },
          "45%": { transform: "translate(-8px, -5px) rotate(-0.4deg)" },
          "60%": { transform: "translate(7px, 8px) rotate(0.3deg)" },
          "75%": { transform: "translate(-5px, -3px) rotate(-0.2deg)" },
          "90%": { transform: "translate(3px, 2px) rotate(0deg)" },
        },
        "impact-flash-fx": {
          "0%": { opacity: "0" },
          "12%": { opacity: "0.45" },
          "100%": { opacity: "0" },
        },
        "confetti-fall": {
          "0%": { transform: "translateY(-10vh) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translateY(110vh) rotate(540deg)", opacity: "0.4" },
        },
        "ticker-scroll": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(-100%)" },
        },
        "combat-text-pop": {
          "0%": { transform: "translateY(0) scale(0.6)", opacity: "0" },
          "15%": { transform: "translateY(0) scale(1.15)", opacity: "1" },
          "30%": { transform: "translateY(0) scale(1)", opacity: "1" },
          // slight elastic overshoot mid-flight, arcade-style, before settling into the rise
          "55%": { transform: "translateY(-8px) scale(1.05)", opacity: "1" },
          "85%": { transform: "translateY(-20px) scale(1)", opacity: "1" },
          "100%": { transform: "translateY(-28px) scale(1)", opacity: "0" },
        },
        // subtle jittery displacement for the defcon-1 hud badge, reading as a stressed video feed
        "defcon-critical-glitch": {
          "0%, 100%": { transform: "translate(0, 0)" },
          "20%": { transform: "translate(-1px, 0.5px)" },
          "40%": { transform: "translate(1px, -0.5px)" },
          "60%": { transform: "translate(-0.5px, -1px)" },
          "80%": { transform: "translate(0.5px, 1px)" },
        },
      },
      animation: {
        "pop-in": "pop-in 0.25s ease-out",
        "modal-in": "modal-in 0.18s ease-out",
        "backdrop-in": "backdrop-in 0.15s ease-out",
        "bounce-panic": "bounce-panic 0.5s ease-in-out infinite",
        shake: "shake 0.22s linear infinite",
        "spin-slow": "spin-slow 2.4s linear infinite",
        "float-up-fade": "float-up-fade 1.6s ease-out forwards",
        blink: "blink 1s ease-in-out infinite",
        "dash-flow": "dash-flow 0.8s linear infinite",
        "fan-spin": "fan-spin 1.2s linear infinite",
        "smoke-rise": "smoke-rise 1.4s ease-out infinite",
        "wrench-turn": "wrench-turn 0.4s ease-in-out infinite",
        "worker-bob": "worker-bob 1.6s ease-in-out infinite",
        "type-jitter": "type-jitter 0.18s ease-in-out infinite",
        "steam-rise": "steam-rise 1.6s ease-out infinite",
        "spark-flicker": "spark-flicker 0.6s steps(1, end) infinite",
        "dash-flow-stutter": "dash-flow-stutter 0.5s steps(3, end) infinite",
        "glow-pulse": "glow-pulse 1.8s ease-in-out infinite",
        "beacon-flash": "beacon-flash 0.7s step-start infinite",
        "beacon-sweep": "beacon-sweep 2.2s linear infinite",
        "sprint-bounce": "sprint-bounce 0.28s ease-in-out infinite",
        "sweat-drop": "sweat-drop 0.9s ease-in infinite",
        "screen-glow-pulse": "screen-glow-pulse 2.4s ease-in-out infinite",
        "ball-volley": "ball-volley 1.1s ease-in-out infinite",
        "walk-cycle-left": "walk-cycle-left 0.45s ease-in-out infinite",
        "walk-cycle-right": "walk-cycle-right 0.45s ease-in-out infinite",
        "eye-blink": "eye-blink 4s ease-in-out infinite",
        "drawer-slide-in": "drawer-slide-in 0.22s ease-out",
        "screen-shake-light": "screen-shake-light 0.4s ease-in-out",
        "screen-shake-heavy": "screen-shake-heavy 0.6s ease-in-out",
        "impact-flash-fx": "impact-flash-fx 0.5s ease-out",
        "confetti-fall": "confetti-fall 3.2s linear forwards",
        "ticker-scroll": "ticker-scroll 32s linear infinite",
        "combat-text-pop": "combat-text-pop 1.6s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        "defcon-glitch": "defcon-critical-glitch 0.3s steps(2, end) infinite",
      },
    },
  },
  plugins: [],
}
