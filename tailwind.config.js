/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./src/**/*.{astro,html,js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        appColor: "#faffa4",
        darkGrey: "#212121",
        darkGrey2: "#424242",
        black: "#000000",
        white: "#ffffff",
        secondary: '#424242',
        light: {
          primary: '#f3f3f3',
          accent: '#bcccdc',
        },
        dark: {
          primary: '#212121',
          accent: '#0f172a',
        },
      },
      fontFamily: {
        merriweather: ['"Merriweather"', 'serif'],
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(100px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        teleport: {
          '0%': { transform: 'translate(0, 0)', opacity: 1 },
          '49%': { transform: 'translate(8px, -8px)', opacity: 0 },
          '50%': { transform: 'translate(-8px, 8px)', opacity: 0 },
          '100%': { transform: 'translate(0, 0)', opacity: 1 },
        },
        arrowLoop: {
          '0%': { transform: 'translateX(0)', opacity: 1 },
          '40%': { transform: 'translateX(100%)', opacity: 0 },
          '41%': { transform: 'translateX(-100%)', opacity: 0 },
          '100%': { transform: 'translateX(0)', opacity: 1 },
        },
        wave: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'slide-up': 'slideUp 1s ease-out forwards',
        'slide-up-delayed': 'slideUp 1s ease-out 0.5s forwards',
        'arrow-loop': 'arrowLoop 0.8s ease-in-out',
        'teleport': 'teleport .8s ease-in-out',
        'wave': 'wave 0.3s ease-in-out forwards',
        'fade-in-up': 'fadeInUp 0.6s ease-out forwards',
      }
    },
  },
  plugins: [],
}
