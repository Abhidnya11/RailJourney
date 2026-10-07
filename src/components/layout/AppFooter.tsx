export function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="container app-footer__inner type-body-sm">
        <div className="app-footer__group">
          <span className="type-headline-sm app-footer__title">RailJourney</span>
          <span>· Live Indian Railways tracking</span>
        </div>
        <div className="app-footer__group app-footer__group--end">
          <span className="type-data-md">Data: RailRadar · OpenWeather · OpenTopography · MapTiler</span>
          <span>© {new Date().getFullYear()} RailJourney</span>
        </div>
      </div>
    </footer>
  );
}
