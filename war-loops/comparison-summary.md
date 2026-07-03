# War Loops Comparison Summary

Generated: 2026-07-02T06:04:14.739Z

| Build  | Viewport | Pass | Overall | Visual | Layout | Content | Motion |
| ------ | -------- | ---: | ------: | -----: | -----: | ------: | -----: |
| pencil | desktop  |  yes |      97 |     96 |     97 |     100 |    100 |
| pencil | tablet   |  yes |      96 |     94 |     97 |     100 |    100 |
| pencil | mobile   |  yes |      96 |     94 |     98 |     100 |    100 |
| forge  | desktop  |  yes |      97 |     96 |     97 |     100 |    100 |
| forge  | tablet   |  yes |      96 |     94 |     97 |     100 |    100 |
| forge  | mobile   |  yes |      95 |     94 |     98 |     100 |     85 |

Weakest signal: forge mobile overall 95 (visual 94, layout 98).

Notes:

- Visual score is a normalized full-page pixel-stat comparison against the source render.
- Layout score is based on document width/height drift against the captured source dimensions.
- Content score checks required dashboard strings.
- Motion score expects Pencil to be still and Forge to animate at start while retaining ambient Dev Mode motion.
