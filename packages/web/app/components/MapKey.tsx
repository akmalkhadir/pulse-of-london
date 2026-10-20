import type { AnomalyBand } from "@pulse/shared";

const STATION_ITEMS: { band: AnomalyBand; label: string }[] = [
  { band: "much_busier", label: "Much busier" },
  { band: "busier", label: "Busier" },
  { band: "normal", label: "Normal" },
  { band: "quieter", label: "Quieter" },
  { band: "much_quieter", label: "Much quieter" },
];

const BAND_VAR: Record<AnomalyBand, string> = {
  much_busier: "var(--band-much-busier)",
  busier: "var(--band-busier)",
  normal: "var(--band-normal)",
  quieter: "var(--band-quieter)",
  much_quieter: "var(--band-much-quieter)",
  unknown: "var(--band-unknown)",
};

export function bandVar(band: AnomalyBand): string {
  return BAND_VAR[band];
}

export function MapKey() {
  return (
    <div className="mapkey" role="group" aria-label="Map key">
      <ul className="mapkey__row mapkey__compact">
        <li className="mapkey__label">Stations</li>
        <li className="mapkey__item">
          Busier
          <span className="mapkey__scale" aria-hidden="true">
            {STATION_ITEMS.map((item) => (
              <span key={item.band} className="dot" style={{ "--c": BAND_VAR[item.band] } as React.CSSProperties} />
            ))}
          </span>
          <span className="visually-hidden">(red, through grey for normal, to blue)</span>
          Quieter
        </li>
        <li className="mapkey__item">
          <span className="dot dot--ring" aria-hidden="true" />
          No data
        </li>
      </ul>
      <ul className="mapkey__row mapkey__full">
        <li className="mapkey__label">Stations vs a typical day at this time</li>
        {STATION_ITEMS.map((item) => (
          <li key={item.band} className="mapkey__item">
            <span className="dot" style={{ "--c": BAND_VAR[item.band] } as React.CSSProperties} aria-hidden="true" />
            {item.label}
          </li>
        ))}
        <li className="mapkey__item">
          <span className="dot dot--ring" aria-hidden="true" />
          No live data
        </li>
      </ul>
      <ul className="mapkey__row">
        <li className="mapkey__label">Lines</li>
        <li className="mapkey__item"><span className="stroke" aria-hidden="true" /><span>Good<span className="mapkey__full"> service</span></span></li>
        <li className="mapkey__item"><span className="stroke stroke--minor" aria-hidden="true" /><span>Minor<span className="mapkey__full"> delays</span></span></li>
        <li className="mapkey__item"><span className="stroke stroke--severe" aria-hidden="true" /><span>Severe<span className="mapkey__full"> or suspended</span></span></li>
      </ul>
    </div>
  );
}
