/* font.js — a 4x5 bitmap font, drawn straight into the low-res buffer so text
   stays as crunchy as everything else. */
(function () {
  'use strict';
  var TD = window.TD;

  var GLYPHS = {
    'A': '.##.|#..#|####|#..#|#..#',
    'B': '###.|#..#|###.|#..#|###.',
    'C': '.###|#...|#...|#...|.###',
    'D': '###.|#..#|#..#|#..#|###.',
    'E': '####|#...|###.|#...|####',
    'F': '####|#...|###.|#...|#...',
    'G': '.###|#...|#.##|#..#|.###',
    'H': '#..#|#..#|####|#..#|#..#',
    'I': '###.|.#..|.#..|.#..|###.',
    'J': '..##|...#|...#|#..#|.##.',
    'K': '#..#|#.#.|##..|#.#.|#..#',
    'L': '#...|#...|#...|#...|####',
    'M': '#..#|####|#.##|#..#|#..#',
    'N': '#..#|##.#|#.##|#..#|#..#',
    'O': '.##.|#..#|#..#|#..#|.##.',
    'P': '###.|#..#|###.|#...|#...',
    'Q': '.##.|#..#|#..#|#.#.|.#.#',
    'R': '###.|#..#|###.|#.#.|#..#',
    'S': '.###|#...|.##.|...#|###.',
    'T': '####|.#..|.#..|.#..|.#..',
    'U': '#..#|#..#|#..#|#..#|.##.',
    'V': '#..#|#..#|#..#|.##.|.##.',
    'W': '#..#|#..#|##.#|####|#..#',
    'X': '#..#|.##.|.##.|.##.|#..#',
    'Y': '#..#|#..#|.##.|.#..|.#..',
    'Z': '####|...#|.##.|#...|####',
    '0': '.##.|#.##|##.#|#..#|.##.',
    '1': '.#..|##..|.#..|.#..|###.',
    '2': '###.|...#|.##.|#...|####',
    '3': '###.|...#|.##.|...#|###.',
    '4': '#..#|#..#|####|...#|...#',
    '5': '####|#...|###.|...#|###.',
    '6': '.###|#...|###.|#..#|.##.',
    '7': '####|...#|..#.|.#..|.#..',
    '8': '.##.|#..#|.##.|#..#|.##.',
    '9': '.##.|#..#|.###|...#|###.',
    ' ': '....|....|....|....|....',
    '.': '....|....|....|....|.#..',
    ',': '....|....|....|.#..|#...',
    ':': '....|.#..|....|.#..|....',
    '!': '.#..|.#..|.#..|....|.#..',
    '?': '###.|...#|.##.|....|.#..',
    '-': '....|....|####|....|....',
    '+': '....|.#..|###.|.#..|....',
    '/': '...#|..#.|.#..|#...|#...',
    "'": '.#..|.#..|....|....|....',
    '(': '..#.|.#..|.#..|.#..|..#.',
    ')': '.#..|..#.|..#.|..#.|.#..',
    '<': '..#.|.#..|#...|.#..|..#.',
    '>': '.#..|..#.|...#|..#.|.#..',
    '*': '#.#.|.#..|###.|.#..|#.#.',
    '%': '#..#|...#|.##.|#...|#..#'
  };

  /* Pre-expand each glyph to a column-of-bits array for fast blitting. */
  var CACHE = {};
  for (var k in GLYPHS) {
    var rows = GLYPHS[k].split('|'), bits = [];
    for (var y = 0; y < 5; y++) for (var x = 0; x < 4; x++) if (rows[y][x] === '#') bits.push(x, y);
    CACHE[k] = bits;
  }

  var GW = 4, GH = 5;

  function width(text, scale, tracking) {
    scale = scale || 1;
    tracking = tracking == null ? 1 : tracking;
    return text.length > 0 ? (text.length * (GW + tracking) - tracking) * scale : 0;
  }

  /* Draw into a Uint32 buffer. align: -1 left, 0 centre, 1 right. */
  function text(buf, bw, bh, str, x, y, color, scale, align, tracking) {
    scale = scale || 1;
    tracking = tracking == null ? 1 : tracking;
    str = String(str).toUpperCase();
    var w = width(str, scale, tracking);
    if (align === 0) x -= w / 2; else if (align === 1) x -= w;
    x = Math.round(x); y = Math.round(y);
    var step = (GW + tracking) * scale;
    for (var i = 0; i < str.length; i++) {
      var bits = CACHE[str[i]];
      if (!bits) continue;
      var gx = x + i * step;
      for (var b = 0; b < bits.length; b += 2) {
        var px = gx + bits[b] * scale, py = y + bits[b + 1] * scale;
        for (var sy = 0; sy < scale; sy++) {
          var ry = py + sy;
          if (ry < 0 || ry >= bh) continue;
          var off = ry * bw;
          for (var sx = 0; sx < scale; sx++) {
            var rx = px + sx;
            if (rx >= 0 && rx < bw) buf[off + rx] = color;
          }
        }
      }
    }
    return w;
  }

  TD.font = { text: text, width: width, GW: GW, GH: GH };
})();
