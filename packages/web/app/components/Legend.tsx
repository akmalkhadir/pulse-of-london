import { BAND_COLORS } from "../lib/colors";

const ITEMS: { band: keyof typeof BAND_COLORS; label: string }[] = [
  { band: "much_busier", label: "Much busier than usual" },
  { band: "busier", label: "Busier than usual" },
  { band: "normal", label: "About normal" },
  { band: "quieter", label: "Quieter than usual" },
  { band: "unknown", label: "No live data" },
];

export function Legend() {
  return (
    <section className="panel" aria-label="Map legend">
      <h2>What the colours mean</h2>
      <p>Stations are coloured by how busy they are <em>compared with a typical day at this time</em> — not just how busy they are.</p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {ITEMS.map((item) => (
          <li key={item.band}>
            <span className="swatch" style={{ background: BAND_COLORS[item.band] }} aria-hidden="true" />
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
