/** What the visitor has picked, and where they picked it (board picks move the map; map picks don't). */
export type Selection =
  | { kind: "line"; id: string; from: "map" | "board" }
  | { kind: "station"; naptan: string; from: "map" | "board" }
  | null;

export function isLineSelected(sel: Selection, id: string): boolean {
  return sel?.kind === "line" && sel.id === id;
}

export function isStationSelected(sel: Selection, naptan: string): boolean {
  return sel?.kind === "station" && sel.naptan === naptan;
}
