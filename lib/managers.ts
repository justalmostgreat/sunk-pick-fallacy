// Sleeper roster_id → first name. Handles and team names come from Sleeper untouched.
// A missing id has no confirmed name yet; the page shows the team name alone.
export const firstNames: Partial<Record<number, string>> = {
  1: "Jag", // justalmostgreat (commissioner)
  2: "Andrew", // ATaylor999 / Revenge of the Brady
  3: "Adi", // AdiYoga
  4: "Jit", // littyjitty
  5: "Jorge", // primalJay / Pipsqueak
  6: "Kartik", // shotgunb365
  7: "Mateo", // elmateoruix / J Herbo (provisional, not yet confirmed)
  8: "Pranav", // pranavmenon08
  9: "Arjun", // squirmyearth163
  10: "Cody", // CodyJuanKenobi
};

// Other names the blurbs use, so a pasted blurb can be matched to the right game.
export const nicknames: Partial<Record<number, string[]>> = {
  1: ["Commish", "Commissioner", "Jagadesh"],
  3: ["Aditya"],
};
