# Store images: icon, promo tiles, and how they follow the extension

The icon, the two promo tiles and the screenshots should look like one product. The order is
always: **read the UI, read what the extension does, then draw.** Colours, font and corners come
only from the extension's own pages (`style`); the hero of each image comes only from what the
code really does.

## Folder

```
<extension folder>-store-assets/          on the Desktop (or next to the extension if it's already there)
├── upload-files/                         everything the dashboard receives — all 24-bit, no alpha
│   ├── store-icon-128.png
│   ├── promo-small-440x280.png
│   ├── promo-marquee-1400x560.png
│   ├── screenshots/01-….png … 05-….png   (+ 00-contact-sheet.png, not for upload)
│   └── locales/<locale>/…                tiles/screenshots of other listing languages
└── working/visuals/                      inputs and drafts, never uploaded
    ├── style.json  tokens.css  ui-light.png  ui-dark.png
    ├── brief.md
    ├── icon.svg  icons/ (16/32/48/128, icon-preview.png)
    ├── promo-small.html  promo-marquee.html  hero-*.png  raw/
    └── 00-visual-board.png
```

## 1. Read the UI — `style`

`xxd-chrome-publish style <dir>` opens the side panel / popup / options page with stand-ins for
`chrome.*`, reads the browser's computed style in light and dark, and analyses the current icon
(tile colour, glyph colour, inset, corner radius, transparent corners). It writes `style.json` and
`tokens.css`. Look at `ui-light.png`: a sign-in page still gives true colours, but use real
screenshots (step 4) for imagery. `system: xxd-ui` means the 小小东 UI Kit — ink emphasis,
warm-black dark theme, square corners, weights 400/500/600.

## 2. Read what it does — `brief.md`

Six lines, each with a source, written before any HTML:

```
Does:      <one sentence, verb first, a feature that exists in the code>
Where:     <the site it works on (content_scripts.matches, host_permissions) or "standalone">
Hero:      <from the table below, and which image file>
Moment:    <when someone opens it>
UI style:  <system, paper/ink/accent, square/rounded, weights — copied from style>
Avoid:     <the wrong turns this extension invites, e.g. "no AI glow", "not WeChat green">
```

Read the code for "Does": what the main button does, what the background handles, what file comes
out. README and old store copy help, but the code wins when they disagree.

### Choosing the hero

| Kind of extension (from the code) | Hero | Material |
|---|---|---|
| Makes something: image, cover, document, QR code, export | **the made thing**, large and clear; the UI shrinks to "where it came from" | produce it in a scenario shot, crop it with `elements` |
| Works on a site: editor helper, bulk action, injected buttons | **the site plus the side panel** | the framed 1280×800 screenshot |
| Organises: links, bookmarks, history, to-dos | **the organised list**, with believable demo data, never empty | unframed panel capture from `--raw-dir` |
| One-shot action: clear cache, remove watermark, swap image | **before and after**, same demo picture, position shows order — no arrow effects | two captures side by side |
| Settings / toggles | **the effect once switched on**, not the settings page | effect capture + a sliver of settings |

Demo material: `demo-images`, or material the user gives you that may be public. Never real
accounts, e-mail addresses, order numbers or other people's articles.

### Following the UI

- **Colour**: background `--paper`, text `--ink`, secondary `--muted`, lines `--line`. `--accent`
  at most once per image, on something the UI itself accents (main button, selection). If the UI
  emphasises with ink (xxd-ui does), so do the tiles.
- **Light or dark**: with `darkSupported: true` either works; a dark icon with a light UI is safest
  with light tiles. One choice for the whole set.
- **Corners**: square UI → every box square; rounded UI → `--radius`, no invented numbers.
- **Type**: `--font`, no web fonts, no serif, only weights the UI uses (`tile` checks this).
- **Lines and shadow**: separate with space first; one 1px `--line` around a capture is enough;
  no shadows on cards or captures, no gradients.
- **Words**: name + one line of value + (marquee) three facts. Facts are features, not adjectives
  ("12 layouts, drag to reorder" ✓, "powerful and easy" ✗).
- **Never**: gradient backgrounds, neon, AI glow, tilted 3D device mock-ups, stickers, emoji,
  big flat brand-colour blocks, unrelated illustration, grain or "vintage" texture.

### Languages

Tiles carry text, so every listing language gets its own: name and value line from that
language's `_locales/<locale>/messages.json`, facts translated with the same features and the
same numbers. If the UI isn't translated into that language, the hero stays the default-language
UI — don't pretend it is. Files go to `upload-files/locales/<locale>/`; `images` says when a
language is borrowing the default-language tile.

## 3. Icon — `icon`

### Keep, unify or redraw

| Situation | Do |
|---|---|
| Icon already belongs with the UI (tile ≈ the UI's ink or accent, clear glyph) | **keep**: `--svg` its source, or `--png icons/icon128.png` just for the store icon and the review sheet |
| Recognisable, but not of the UI's family (colours, corners, gradients, 3D don't match) | **unify**: keep the idea of the glyph, redraw it by the rules below |
| No icon, a placeholder, or the user asks for a new one | **redraw** from what the extension does |

Writing icons into the extension (`--install`) changes source: only when the user wants the icon
replaced. Originals are backed up to `icons/icons-backup/`.

### The 小小东 family (UI is xxd-ui)

- 128 canvas, **12px transparent margin**, a 104×104 tile, corner **r = 22** (an icon, not a control).
- Tile `--icon-tile` (warm black `#171612`), glyph `--icon-glyph` (paper `#F3F0EA`).
- The glyph is **solid shapes or one bold letter**, not line art; at most two tones (paper 100 % and 50 %).
- At most **one** small accent mark; no third colour. No gradient, shadow, highlight, bevel, outline or hairline.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect x="12" y="12" width="104" height="104" rx="22" fill="#171612"/>
  <!-- glyph inside 32–96, optical centre slightly above the middle -->
</svg>
```

Other UIs: the same structure with their colours — tile = accent (or ink), glyph = paper; square
UI → r ≈ 16, rounded UI → r ≈ 22–24.

### The glyph

- Draw the **action or the product**, not a tool: cover collage → three panels side by side;
  link sorter → four cells; clipping → one letter.
- One shape, recognised in three seconds, still true at 16px. If it isn't, remove parts — don't add detail.
- Icon libraries help with the idea, but turn their 1.5px line icons into solid shapes; lines blur at 16px.
- If `icon-preview.png` shows mush at "16 ×4", pass a simplified `--svg-small` for 16/32:
  fewer parts, heavier shapes, gaps of at least 16 units on the 128 canvas.

### Transparency

Extension icons (16/32/48/128) keep their transparent margin so they sit well on light and dark
toolbars. `store-icon-128.png` is flattened onto white. Tiles and screenshots are 24-bit, no alpha.

## 4. Promo tiles — `tile`

Copy `assets/templates/promo-small.html` and `promo-marquee.html` next to `tokens.css`, put
`icon128.png` and the hero images beside them, then write the copy and arrange the hero per the
brief — the templates are a start, rearrange freely (big product, before/after, list), but take
colours, font and corners only from `tokens.css`. Mark text that must stay on one line (name,
labels) with `data-one-line`.

```bash
xxd-chrome-publish tile working/visuals/promo-small.html   --size 440x280  --out upload-files/promo-small-440x280.png
xxd-chrome-publish tile working/visuals/promo-marquee.html --size 1400x560 --out upload-files/promo-marquee-1400x560.png
```

Fix every `problem` line (out of frame, clipped, text under 14px / 16px, image not loaded, a font
weight the UI never uses, a `data-one-line` element wrapping) and **open the PNG** — the checks
don't judge taste.

## 5. All together — `images`

`xxd-chrome-publish images <dir>` checks sizes and alpha of everything in `upload-files/` and
builds `working/visuals/00-visual-board.png`: marquee, icon, small tile and screenshots per
language, as on a store page. Look at it:

- At a third of the size, the name and the hero still read.
- Icon, tiles and screenshots share one set of colours and corners — one product.
- The hero belongs to this extension only: cover the name; if another extension could claim the
  picture, choose another hero.
