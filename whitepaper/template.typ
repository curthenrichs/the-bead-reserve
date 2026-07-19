// Theme for the BEADZ whitepaper: clean & typographic, tuned to match the
// half-built-robots.com blog (amber accent, Roboto Mono) while staying a
// readable, printable light document.
// Roboto Serif (body) + Roboto Mono (headings/labels/tables/identifiers) —
// a single type family, matching the blog and reading cleanly at text sizes.

#let ink        = rgb("#1B140C")  // warm dark brown-black (blog background hue)
#let ink-soft   = rgb("#6B5541")  // warm brown, secondary text
#let amber      = rgb("#FFAA3C")  // blog primary — used for rules/accents
#let amber-dark = rgb("#A8650F")  // darkened amber, legible on light for text
#let paper      = rgb("#FAF7F1")  // warm near-white page background
#let hairline   = rgb("#DDD3C4")  // subtle warm rule (footer)

#let serif = "Roboto Serif"
#let mono  = "Roboto Mono"

// Mono uppercase tracked label (section eyebrows, metadata).
#let plabel(body) = text(
  font: mono, size: 8pt, weight: "medium",
  tracking: 0.18em, fill: amber-dark,
)[#upper(body)]

// Two-column parameter table (Parameter | Value). `rows` is an array of
// (label, value) pairs.
#let param-table(rows) = table(
  columns: (0.8fr, 1.2fr),
  stroke: none,
  inset: (x: 0pt, y: 7pt),
  align: (left, right),
  table.hline(stroke: 1pt + amber),
  // Semantic header row: tagged as TH in the PDF so screen readers announce
  // column context for each cell; styled as the standard mono eyebrow label.
  table.header(repeat: false, plabel[Parameter], plabel[Value]),
  ..rows.map(((k, v)) => (
    text(fill: ink)[#k],
    text(font: mono, size: 9pt, fill: ink, hyphenate: false)[#v],
  )).flatten(),
  table.hline(stroke: 1pt + amber),
)

// Diagonal "DRAFT / DO NOT DISTRIBUTE" watermark, sat behind the text on
// every page. Faint amber so it reads as a stamp without fighting the body.
#let draft-watermark = place(center + horizon, rotate(-30deg, align(center,
  stack(
    spacing: 10pt,
    text(font: mono, size: 96pt, weight: "bold", tracking: 0.05em,
      fill: amber.transparentize(88%))[DRAFT],
    text(font: mono, size: 20pt, weight: "bold", tracking: 0.32em,
      fill: amber-dark.transparentize(80%))[DO NOT DISTRIBUTE],
  ),
)))

#let whitepaper(title: "", title-lines: none, subtitle: "", office: "", series: "", draft: false, doc) = {
  set document(title: title, author: "The Bead Reserve", description: subtitle)
  set page(
    paper: "a4",
    fill: paper,
    margin: (x: 2.4cm, top: 2.6cm, bottom: 2.6cm),
    background: if draft { draft-watermark },
    footer: context {
      set text(font: mono, size: 7pt, fill: ink-soft, tracking: 0.08em)
      line(length: 100%, stroke: 0.5pt + hairline)
      v(4pt)
      grid(
        columns: (1fr, auto),
        align(left)[BEADZ · DRAFT FOR PUBLIC COMMENT],
        align(right)[#counter(page).display() / #counter(page).final().first()],
      )
    },
  )

  // Strongly penalize "runts" (a last line holding a single short word) so
  // the justified line-breaker pulls the trailing word up onto the prior line.
  set text(font: serif, size: 10.5pt, fill: ink, lang: "en", costs: (runt: 800%))
  set par(justify: true, leading: 0.68em, spacing: 1.05em)

  // Literal section numbers live in the prose (matching the source), so
  // Typst's own heading numbering is disabled.
  set heading(numbering: none)
  // Headings in Roboto Mono (the blog's face) — level 1 gets a short amber
  // underline for the terminal accent; level 2 is set in darkened amber.
  show heading: set text(font: mono, fill: ink)
  show heading.where(level: 1): it => {
    v(1.2em)
    block(text(size: 13pt, weight: "bold", it.body))
    v(3.5pt)
    line(length: 2.4em, stroke: 1.5pt + amber)
    v(0.3em)
  }
  show heading.where(level: 2): it => {
    v(0.7em)
    block(text(size: 10.5pt, weight: "bold", fill: amber-dark, it.body))
  }

  show link: set text(fill: amber-dark)

  // Blockquote: amber rule + italic (for the CRO / audit lines).
  show quote.where(block: true): it => block(
    inset: (left: 12pt), stroke: (left: 2pt + amber),
  )[#set text(style: "italic", fill: ink-soft); #it.body]

  // Title block ------------------------------------------------------------
  {
    plabel(office)
    v(10pt)
    // Title: ragged (no justification), no hyphenation, with deliberate line
    // breaks via `title-lines` so a long title never leaves a lone syllable.
    block({
      set par(justify: false, leading: 0.4em)
      set text(font: mono, size: 17pt, weight: "bold", hyphenate: false)
      if title-lines != none { title-lines.join(linebreak()) } else { title }
    })
    if subtitle != "" {
      v(7pt)
      block(text(font: serif, size: 13pt, style: "italic", fill: amber-dark)[#subtitle])
    }
    v(9pt)
    text(font: mono, size: 8pt, fill: ink-soft, tracking: 0.14em)[#upper(series)]
    v(7pt)
    line(length: 100%, stroke: 1pt + amber)
    v(14pt)
  }

  doc
}
