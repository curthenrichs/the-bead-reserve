#import "template.typ": whitepaper, plabel, param-table, green
#import "metadata.typ": meta

#show: whitepaper.with(
  title: "BEADZ: A Fully-Reserved Bead-Collateralized Bearer Instrument",
  subtitle: "A Technical and Monetary Whitepaper of The Bead Reserve",
  office: meta.office,
  series: meta.series,
)

= Abstract
We present #meta.symbol, a digital bearer token. Total genesis supply is
#meta.genesis. This paragraph exists to exercise justified body text, the
serif face, and #link("https://example.com")[an accent-colored link].

= 1. Introduction
A subsection follows.

== 1.1 A subsection
Body text under a level-two heading.

= 2. Token Design
#param-table((
  ("Name / Symbol", "Beadz / BEADZ"),
  ("Decimals", meta.decimals),
  ("Genesis supply", meta.genesis + " BEADZ"),
  ("Chain", meta.chain),
))

#quote(block: true)[Reserve audit complete. Jar present. Lid seated.]
