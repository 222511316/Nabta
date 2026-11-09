/** Plant type and location, e.g. "Lemon · Back garden". Empty when neither is set. */
export function plantMeta(plant) {
  return [plant.plant_type, plant.location].filter(Boolean).join(' · ')
}
