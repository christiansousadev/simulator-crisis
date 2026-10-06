import { memo } from "react";
import { useLightScope } from "./lightingBus";

// night and dusk sky layers behind the skyline; their opacity follows --night / --twilight from the
// light scope on this wrapper (see index.css .office-sky-night), so the sky eases with the clock
function SkyLayers() {
  const scope = useLightScope();
  return (
    <div ref={scope} className="absolute inset-0 pointer-events-none" style={{ zIndex: -1 }} aria-hidden="true">
      <div className="office-sky-night" />
      <div className="office-sky-dusk" />
    </div>
  );
}

export default memo(SkyLayers);
