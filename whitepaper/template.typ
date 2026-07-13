// Theme for the BEADZ whitepaper: clean & typographic.
// Fraunces (serif/display) + IBM Plex Mono (labels/tables/identifiers).

#let ink       = rgb("#14261C")
#let ink-soft  = rgb("#3B4A40")
#let green     = rgb("#245C44")
#let green-deep = rgb("#163A2C")
#let gold      = rgb("#A6863F")
#let hairline  = rgb("#B7B9A6")

#let serif = "Fraunces"
#let mono  = "IBM Plex Mono"

// Mono uppercase tracked label (section eyebrows, metadata).
#let plabel(body) = text(
  font: mono, size: 8.5pt, weight: "semibold",
  tracking: 0.18em, fill: green,
)[#upper(body)]

// Two-column parameter table (Parameter | Value). `rows` is an array of
// (label, value) pairs.
#let param-table(rows) = table(
  columns: (1fr, 1fr),
  stroke: none,
  inset: (x: 0pt, y: 7pt),
  align: (left, right),
  table.hline(stroke: 0.75pt + green-deep),
  ..rows.map(((k, v)) => (
    text(fill: ink)[#k],
    text(font: mono, size: 9.5pt, fill: ink)[#v],
  )).flatten(),
  table.hline(stroke: 0.75pt + green-deep),
)

#let whitepaper(title: "", title-lines: none, subtitle: "", office: "", series: "", doc) = {
  set document(title: title)
  set page(
    paper: "a4",
    margin: (x: 2.4cm, top: 2.6cm, bottom: 2.6cm),
    footer: context {
      set text(font: mono, size: 7.5pt, fill: ink-soft, tracking: 0.08em)
      line(length: 100%, stroke: 0.5pt + hairline)
      v(4pt)
      grid(
        columns: (1fr, auto),
        align(left)[BEADZ · DRAFT FOR PUBLIC COMMENT],
        align(right)[#counter(page).display() / #counter(page).final().first()],
      )
    },
  )

  set text(font: serif, size: 10.5pt, fill: ink, lang: "en")
  set par(justify: true, leading: 0.68em, spacing: 1.05em)

  // Literal section numbers live in the prose (matching the source), so
  // Typst's own heading numbering is disabled.
  set heading(numbering: none)
  show heading: set text(font: serif, fill: ink)
  show heading.where(level: 1): it => {
    v(1.1em)
    block(text(size: 15pt, weight: "semibold", it.body))
    v(0.2em)
  }
  show heading.where(level: 2): it => {
    v(0.6em)
    block(text(size: 11.5pt, weight: "semibold", fill: green-deep, it.body))
  }

  show link: set text(fill: green)

  // Blockquote: green rule + italic (for the CRO / audit lines).
  show quote.where(block: true): it => block(
    inset: (left: 12pt), stroke: (left: 2pt + green),
  )[#set text(style: "italic", fill: ink-soft); #it.body]

  // Title block ------------------------------------------------------------
  {
    plabel(office)
    v(10pt)
    // Title: ragged (no justification), no hyphenation, with deliberate line
    // breaks via `title-lines` so a long title never leaves a lone syllable.
    block({
      set par(justify: false, leading: 0.34em)
      set text(font: serif, size: 22pt, weight: "semibold", hyphenate: false)
      if title-lines != none { title-lines.join(linebreak()) } else { title }
    })
    if subtitle != "" {
      v(6pt)
      block(text(font: serif, size: 13pt, style: "italic", fill: green)[#subtitle])
    }
    v(8pt)
    text(font: mono, size: 8.5pt, fill: ink-soft, tracking: 0.14em)[#upper(series)]
    v(6pt)
    line(length: 100%, stroke: 0.75pt + green-deep)
    v(14pt)
  }

  doc
}
