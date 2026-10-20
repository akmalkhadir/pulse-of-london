export function AttributionFooter() {
  return (
    <footer className="footer">
      <p className="footer__about">
        How this works: each Underground station's live crowding from TfL is compared with TfL's typical level for the
        same weekday and 15-minute slot. Stations refresh about every 9 minutes; line status refreshes every minute.
      </p>
      <p className="footer__unofficial">
        <strong>Unofficial</strong> — not affiliated with or endorsed by Transport for London.
      </p>
      <p>
        Powered by TfL Open Data. Contains OS data © Crown copyright and database rights 2016
        and Geomni UK Map data © and database rights 2019.
      </p>
      <p>
        Basemap © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors,
        tiles by <a href="https://protomaps.com">Protomaps</a>.
      </p>
    </footer>
  );
}
