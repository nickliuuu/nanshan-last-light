// A drag grabs the ground under the pointer, independently of camera heading.
export function dragPan(dx, dy, zoom, viewportHeight, azimuth, elevation) {
  const scale = zoom / viewportHeight;
  const vertical = dy * scale / Math.sin(elevation);
  return {
    x: -dx * scale * Math.cos(azimuth) - vertical * Math.sin(azimuth),
    z: dx * scale * Math.sin(azimuth) - vertical * Math.cos(azimuth),
  };
}
