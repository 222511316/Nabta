/** The logo's two leaves, without the insect: a quiet stand-in where a photo is missing. */
export function LeafMark({ className }) {
  return (
    <svg viewBox="130 60 440 540" aria-hidden="true" className={className}>
      <path d="M215 515 C 290 400, 430 330, 548 300 C 500 455, 350 545, 215 515 Z" fill="currentColor" opacity="0.55" />
      <path d="M205 518 C 95 400, 170 150, 470 78 C 455 300, 370 470, 205 518 Z" fill="currentColor" />
      <path d="M205 518 C 200 545, 192 566, 178 590" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
    </svg>
  )
}
