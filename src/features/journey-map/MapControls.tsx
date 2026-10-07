import { Icon } from '@/components/ui/Icon';

interface Props {
  following: boolean;
  onToggleFollow: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetNorth: () => void;
  onLocateUser: () => void;
}

/** Floating map controls (top right): auto-pan lock, zoom, north, locate-me. */
export function MapControls({ following, onToggleFollow, onZoomIn, onZoomOut, onResetNorth, onLocateUser }: Props) {
  return (
    <div className="map-controls">
      <button type="button" className="map-lock type-label-md" aria-pressed={following} onClick={onToggleFollow}>
        <Icon name="gps_fixed" size={18} className="text-primary" />
        <span>{following ? 'Locking Train · Auto-pan' : 'Auto-pan off'}</span>
      </button>
      <div className="map-control-group">
        <button type="button" className="map-control" aria-label="Zoom in" onClick={onZoomIn}>
          <Icon name="add" size={20} />
        </button>
        <hr />
        <button type="button" className="map-control" aria-label="Zoom out" onClick={onZoomOut}>
          <Icon name="remove" size={20} />
        </button>
      </div>
      <button type="button" className="map-control" aria-label="Recenter north" onClick={onResetNorth}>
        <Icon name="explore" size={20} className="text-error" />
      </button>
      <button type="button" className="map-control" aria-label="Locate user" onClick={onLocateUser}>
        <Icon name="my_location" size={20} />
      </button>
    </div>
  );
}
