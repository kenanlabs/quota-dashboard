/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/index.html', './public/app.js'],
  darkMode: ['class', '[data-appearance="dark"]'],
  theme: {
    extend: {
      transitionDuration: { 120: '120ms', 180: '180ms', 250: '250ms' },
    },
  },
  plugins: []
};
