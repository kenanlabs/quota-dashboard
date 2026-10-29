/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/index.html', './public/app.js'],
  darkMode: ['class', '[data-appearance="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '仓耳今楷',
          'TsangerJinKai',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"Noto Sans CJK SC"',
          'sans-serif'
        ],
      },
      transitionDuration: { 120: '120ms', 180: '180ms', 250: '250ms' },
    },
  },
  plugins: []
};
