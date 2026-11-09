import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cx } from '../../lib/cx'

// Drawn in a 600×600 box, echoing the logo: a forest leaf, a sage leaf behind
// it, and an insect cut out of the leaf. Animation lives in styles/scene.css.
const MAIN_LEAF = 'M205 518 C 95 400, 170 150, 470 78 C 455 300, 370 470, 205 518 Z'
const MIDRIB = 'M208 512 C 255 410, 340 240, 466 84'
const VEINS = [
  'M250 424 Q 200 395 148 382',
  'M250 424 Q 292 418 332 440',
  'M295 340 Q 240 300 186 268',
  'M295 340 Q 345 332 392 350',
  'M340 263 Q 290 215 246 178',
  'M340 263 Q 390 250 430 262',
  'M389 188 Q 360 150 332 118',
  'M389 188 Q 420 178 450 186',
]
const BACK_LEAF = 'M215 515 C 290 400, 430 330, 548 300 C 500 455, 350 545, 215 515 Z'
const BACK_MIDRIB = 'M222 510 Q 390 430 540 306'
const STEM = 'M205 518 C 200 545, 192 566, 178 590'

// Where the insect stops: halfway up the midrib, facing along it.
const INSECT_AT = 'translate(307 318) rotate(30)'
const MAGNIFY = 'translate(307 318) scale(1.45) translate(-307 -318)'

function Insect({ id }) {
  const paper = '#F6F8F3'
  return (
    <g id={id}>
      <ellipse cx="0" cy="8" rx="15" ry="24" fill={paper} />
      <ellipse cx="0" cy="-19" rx="10" ry="9" fill={paper} />
      <g stroke={paper} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M-12 -4 L-28 -14 L-33 -25" />
        <path d="M-14 8 L-32 6 L-40 13" />
        <path d="M-12 20 L-26 32 L-29 45" />
        <path d="M12 -4 L28 -14 L33 -25" />
        <path d="M14 8 L32 6 L40 13" />
        <path d="M12 20 L26 32 L29 45" />
        <path d="M-4 -27 Q -9 -44 -22 -53" />
        <path d="M4 -27 Q 9 -44 22 -53" />
      </g>
    </g>
  )
}

/**
 * The home page's hero illustration, reused on the sign-in screens. `variant`
 * picks the label's wording for a grower or a specialist; `pace` below 1 plays
 * the entrance faster.
 */
export function LeafScene({ variant = 'grower', pace = 1, className }) {
  const { t } = useTranslation()
  const uid = useId()
  const insectId = `${uid}insect`
  const lensId = `${uid}lens`

  // The label animates with the entrance the first time, and straight away after a role change.
  const [firstVariant] = useState(variant)
  const [switched, setSwitched] = useState(false)
  if (!switched && variant !== firstVariant) setSwitched(true)

  return (
    <figure className={cx('leaf-scene relative', className)} style={{ '--pace': pace }}>
      <svg
        viewBox="0 0 600 600"
        role="img"
        aria-label={t('landing.sceneLabel')}
        className="block h-auto w-full overflow-visible"
      >
        <defs>
          <clipPath id={lensId}>
            <circle cx="307" cy="318" r="52" />
          </clipPath>
        </defs>

        <circle className="scene-halo" cx="330" cy="320" r="240" fill="var(--scene-halo, var(--color-wash))" />

        <g className="scene-leaf-back">
          <path d={BACK_LEAF} fill="#83996A" />
          <path
            className="scene-vein"
            style={{ '--d': '1.1s' }}
            d={BACK_MIDRIB}
            pathLength="1"
            fill="none"
            stroke="#A9BB94"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>

        <path
          className="scene-stem"
          d={STEM}
          pathLength="1"
          strokeDasharray="1"
          fill="none"
          stroke="#1C3F28"
          strokeWidth="12"
          strokeLinecap="round"
        />

        <g className="scene-leaf-main">
          <path d={MAIN_LEAF} fill="#1C3F28" />
          <path
            className="scene-vein"
            style={{ '--d': '0.7s' }}
            d={MIDRIB}
            pathLength="1"
            fill="none"
            stroke="#3A714C"
            strokeWidth="5"
            strokeLinecap="round"
          />
          {VEINS.map((d, index) => (
            <path
              key={d}
              className="scene-vein"
              style={{ '--d': `${0.95 + index * 0.07}s` }}
              d={d}
              pathLength="1"
              fill="none"
              stroke="#3A714C"
              strokeWidth="3"
              strokeLinecap="round"
            />
          ))}
        </g>

        <g className="scene-insect">
          <g transform={INSECT_AT}>
            <g className="scene-wobble">
              <Insect id={insectId} />
            </g>
          </g>
        </g>

        <g className="scene-loupe">
          <g className="scene-magnified" clipPath={`url(#${lensId})`}>
            <circle cx="307" cy="318" r="52" fill="#2C5A3B" />
            <path
              d={MIDRIB}
              transform={MAGNIFY}
              fill="none"
              stroke="#3A714C"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <g transform="translate(307 318) scale(1.45) rotate(30)">
              <use href={`#${insectId}`} />
            </g>
          </g>
          <circle cx="307" cy="318" r="58" fill="none" stroke="var(--color-pollen)" strokeWidth="9" />
          <path
            d="M273 292 A 42 42 0 0 1 297 272"
            fill="none"
            stroke="#fff"
            strokeOpacity="0.55"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M349 360 L 408 419"
            stroke="var(--color-pollen)"
            strokeWidth="16"
            strokeLinecap="round"
          />
        </g>
      </svg>

      <figcaption
        key={variant}
        data-replay={switched || undefined}
        className="scene-label absolute start-0 bottom-[7%] w-[min(17rem,62%)] rounded-md border border-forest-200 bg-white px-4 pt-3.5 pb-3 text-sm shadow-raised"
      >
        {/* A pinned specimen label: the observation record the scene describes. */}
        <span
          aria-hidden="true"
          className="absolute -top-1.5 start-5 size-3 rounded-full bg-[var(--color-pollen)] ring-2 ring-white"
        />
        <span className="block font-semibold text-forest-800">{t(`scene.${variant}.line1`)}</span>
        <span className="mt-0.5 block text-muted">{t(`scene.${variant}.line2`)}</span>
        <span className="mt-2 block border-t border-line pt-2 text-ink italic">
          {t(`scene.${variant}.note`)}
        </span>
      </figcaption>
    </figure>
  )
}
