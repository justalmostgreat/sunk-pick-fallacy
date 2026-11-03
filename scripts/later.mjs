// Notes the commissioner asked to see again in a later week. Each one sits at the top of the Tuesday
// "Week N is final" issue for the weeks listed. Delete an entry once it's handled or dropped.
export const LATER = [
  {
    weeks: [11, 12], // the league's trade deadline is Week 11 (Sleeper settings.trade_deadline)
    lines: [
      "**Later: a site change you asked to revisit once the Week 11 trade deadline passed.**",
      "While planning the Game of Thrones reskin in early November, you chose to keep the live standings clean: landmarks only, meaning the Iron Throne on 1st place and The Wall as the playoff line under 6th. Every-row titles went to the dynasty power rankings instead. You wanted to decide after the deadline whether each live-standings row should get a court title too.",
      "The ladder proposed then (never confirmed): 2 Hand of the King · 3 Master of Coin · 4 Master of Whisperers · 5 Master of Laws · 6 Grand Maester · 7 Hedge Knight · 8 Sellsword · 9 Flea Bottom · 10 Night's Watch.",
      "To do it, paste this note to Claude or Codex and ask for a court title on every live-standings row. If the reskin isn't live yet, this waits for it. To drop the idea, ignore this: it only appears in the Week 11 and 12 issues (it lives in `scripts/later.mjs`).",
    ],
  },
];

/** The notes due in this week's issue, as Markdown block quotes; empty when nothing is due. */
export const laterNotes = (week, notes = LATER) =>
  notes.filter(n => n.weeks.includes(week)).map(n => n.lines.map(l => `> ${l}`).join("\n>\n")).join("\n\n");
