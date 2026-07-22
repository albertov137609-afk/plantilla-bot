// Constantes y helpers compartidos — sin importar otros módulos del bot

const COLOR = {
  GREEN:  0x1DB954,
  BLUE:   0x5865F2,
  YELLOW: 0xFEE75C,
  RED:    0xED4245,
  GRAY:   0x747F8D,
};

function formatDuration(ms) {
  if (!ms) return '?';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

module.exports = { COLOR, formatDuration };
