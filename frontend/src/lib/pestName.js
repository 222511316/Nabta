/**
 * A pest's name in the interface language. Results and reviews carry the English name
 * from the server; the key picks the translation, and the server's name is the fallback.
 */
export function pestName(t, pest) {
  if (!pest) return null
  return pest.key ? t(`pestNames.${pest.key}`, { defaultValue: pest.name }) : pest.name
}
