"use client";

import { useEffect, useState } from "react";

// The cover price, which never stays put. League lore is fair game; keep it grounded in what actually happened.
const PRICES = [
  "one sunk pick",
  "all of your FAAB",
  "a rookie Adrian Peterson card",
  "your 2027 1st (early)",
  "a 2028 3rd and a prayer",
  "two taxi-squad fliers",
  "Jorge’s 1.01",
  "Colston Loveland’s season total",
  "the commissioner’s plot armor",
  "Goedert’s 23.7 bench points",
  "one Kenneth Walker Monday",
  "a 1998 Randy Moss rookie card",
  "three $0 waiver claims",
  "a signed Jaxson Dart knee brace",
  "Adi’s tank commitment",
  "whatever Andrew left on the bench",
  "a screenshot of your KTC value",
  "your QB2’s dignity",
  "a 2029 4th (projected late)",
  "one Sunday of Josh Allen",
  "Pranav’s lineup efficiency",
  "Kartik’s religious experience",
  "Cody’s HR file",
  "a vintage Matt Stafford game",
  "four Jared Goff touchdowns",
  "DJ Moore’s −0.1",
  "a healthy Jayden Daniels",
  "Tre Tucker’s bench points",
  "Jorge’s 2027 2nd (ask Adi)",
  "Andrew’s 1.05",
  "Puka’s Week 2 zero",
  "a startup-draft do-over",
  "one more MNF comeback",
  "a trade offer left on read",
  "a 3 a.m. Sleeper notification",
  "a Barry Sanders highlight tape",
  "the 1.10 in next year’s rookie draft",
  "a laminated depth chart",
  "one playoff spot (top 6 only)",
  "a Week 15 matchup you can’t lose",
  "your fantasy-season sanity",
  "a Bijan Robinson buy-low offer",
  "one waiver claim that actually clears",
  "the group chat’s respect",
  "a signed Brett Favre Starter jacket",
];

const TYPE = 60, HOLD = 8000, ERASE = 30, GAP = 600; // ms: per letter typed, full price on screen, per letter erased, blank pause

// seed: 0–1 from the server, so the first price matches the server render. Then it erases and types the next one.
export function Price({ seed }: { seed: number }) {
  const [i, setI] = useState(Math.floor(seed * PRICES.length));
  const [shown, setShown] = useState(PRICES[i].length);
  const [erasing, setErasing] = useState(false);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const full = PRICES[i].length;
    const t = !erasing
      ? shown < full ? setTimeout(() => setShown(shown + 1), TYPE) : setTimeout(() => setErasing(true), HOLD)
      : shown > 0 ? setTimeout(() => setShown(shown - 1), ERASE)
      : setTimeout(() => { setI((i + 1 + Math.floor(Math.random() * (PRICES.length - 1))) % PRICES.length); setErasing(false); }, GAP);
    return () => clearTimeout(t);
  }, [i, shown, erasing]);
  return <>Price: <span className="sr-only">{PRICES[i]}</span><span className="price" aria-hidden="true">{PRICES[i].slice(0, shown)}</span></>;
}
