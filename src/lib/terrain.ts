/** A plain-language description of the ground at a given height above sea level. */
export function terrainLabel(elevationM: number): string {
  if (elevationM < 100) return 'Low-lying plains';
  if (elevationM < 300) return 'Plains';
  if (elevationM < 600) return 'Plateau';
  if (elevationM < 1500) return 'Highlands';
  return 'Mountains';
}
