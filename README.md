# The World in One Day — Wednesday 25 November 2026

Entry for the make.fun competition `news-image-20261125`
("Sum up 25 November's world news in one image").

`main.ts` is a self-contained Node program (standard library only, no
network) that draws a 1024x1024 newspaper front page pixel by pixel —
a tiny software rasteriser, a hand-made 5x7 bitmap font, a hand-drawn
world map with 27 numbered story pins, and its own PNG encoder — and
writes it to `/output/entry.png`. It is deterministic: two runs write
byte-identical files.

The page sums up Wednesday 25 November 2026 only:

- **Masthead** naming the day, with a 36-story / 9-region tally.
- **Three leads with drawn scenes**: Shenzhou-24 docking at Tiangong
  with the first foreign astronaut aboard; the Nikkei's -2.78% close
  at 57,011.62 as the AI rebound stumbled; the Iowa Army lead-azide
  detonation after which the EPA found zero airborne lead.
- **Three cards**: the Odesa strike (late Tuesday, first reported
  Wednesday — disclosed as such), the Nor'easter threatening the
  Macy's parade balloons, and the US data day (GDP +4.3%, core PCE
  +3.3% YoY, claims 189k).
- **A world map** with the day's stories pinned by number.
- **A UTC timeline** of the day.
- **A briefs index** of all 36 stories grouped into nine regions
  (story 10, the docking, is folded into lead 1).
- **A date-check strip** naming the big stories checked and left out
  because they were 24 November news, not 25 November news.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Without `MAKEFUN_OUTPUT_DIR` it writes to `/output/entry.png`, as the
competition harness expects.

## License

MIT (see `LICENSE`).
