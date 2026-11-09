import { ScanSearch, Sprout } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { LeafScene } from '../../components/brand/LeafScene'
import { ButtonLink } from '../../components/ui/Button'
import { LogoLink } from '../../components/ui/Logo'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

const STEPS = ['plant', 'photo', 'history']

/** The public home page for signed-out visitors. */
export function LandingPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('landing.title'))

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <LogoLink to="/" />
          <nav className="flex items-center gap-1 sm:gap-2">
            <ButtonLink to="/sign-in" variant="ghost" size="sm">
              {t('landing.signIn')}
            </ButtonLink>
            <ButtonLink to="/register?as=grower" size="sm">
              {t('landing.createAccount')}
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main id="main">
        <Hero />
        <Steps />
        <Roles />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="flex items-center gap-3 text-muted">
            <img src="/logo-mark.png" alt="" className="size-7" />
            {t('landing.footer')}
          </p>
          <nav className="flex gap-5">
            <Link to="/sign-in" className="text-forest-700 hover:underline">
              {t('landing.signIn')}
            </Link>
            <Link to="/register?as=grower" className="text-forest-700 hover:underline">
              {t('landing.createAccount')}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

function Hero() {
  const { t } = useTranslation()
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden="true" className="absolute inset-y-0 end-0 hidden w-1/2 bg-field-grid opacity-70 lg:block" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pt-12 pb-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8 lg:pt-20 lg:pb-28">
        <div>
          <h1 className="animate-rise text-[clamp(2.6rem,1.5rem+4.2vw,4.75rem)] leading-[1.02] font-light tracking-[-0.035em] text-balance text-forest-800">
            {t('landing.headline')}
          </h1>
          <p className="mt-7 max-w-xl animate-rise text-lg leading-relaxed text-pretty text-muted [animation-delay:140ms]">
            {t('landing.intro')}
          </p>
          <div className="mt-10 flex animate-rise flex-wrap gap-3 [animation-delay:280ms]">
            <ButtonLink to="/register?as=grower" size="lg">
              {t('landing.startGrower')}
            </ButtonLink>
            <ButtonLink to="/sign-in" variant="secondary" size="lg">
              {t('landing.signIn')}
            </ButtonLink>
          </div>
        </div>
        <LeafScene variant="grower" className="mx-auto w-full max-w-[36rem]" />
      </div>
    </section>
  )
}

function Steps() {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="steps-heading" className="border-t border-line bg-white">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
        <h2 id="steps-heading" className="text-3xl font-medium tracking-tight text-forest-800 sm:text-4xl">
          {t('landing.stepsTitle')}
        </h2>
        {/* A real sequence, so the steps are numbered. */}
        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, index) => (
            <li
              key={step}
              className="relative md:pe-6 md:not-last:after:absolute md:not-last:after:start-14 md:not-last:after:end-0 md:not-last:after:top-[1.35rem] md:not-last:after:h-px md:not-last:after:bg-forest-200"
            >
              <span
                aria-hidden="true"
                className="flex size-11 items-center justify-center rounded-full border border-forest-300 bg-paper text-lg font-medium text-forest-700 tabular-nums"
              >
                {index + 1}
              </span>
              <h3 className="mt-5 text-lg font-semibold text-ink">{t(`landing.steps.${step}.title`)}</h3>
              <p className="mt-2 max-w-xs leading-relaxed text-muted">{t(`landing.steps.${step}.body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Roles() {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="roles-heading" className="border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
        <h2 id="roles-heading" className="text-3xl font-medium tracking-tight text-forest-800 sm:text-4xl">
          {t('landing.rolesTitle')}
        </h2>
        {/* One panel in two halves, like facing pages of a notebook. */}
        <div className="mt-10 grid overflow-hidden rounded-3xl border border-line md:grid-cols-2">
          <RolePanel
            Icon={Sprout}
            title={t('landing.growerTitle')}
            body={t('landing.growerBody')}
            action={
              <ButtonLink to="/register?as=grower" size="lg">
                {t('landing.startGrower')}
              </ButtonLink>
            }
            className="bg-white"
          />
          <RolePanel
            Icon={ScanSearch}
            title={t('landing.specialistTitle')}
            body={t('landing.specialistBody')}
            action={
              <ButtonLink to="/register?as=specialist" variant="secondary" size="lg">
                {t('landing.joinSpecialist')}
              </ButtonLink>
            }
            className="border-t border-line bg-wash bg-field-grid md:border-t-0 md:border-s"
          />
        </div>
      </div>
    </section>
  )
}

function RolePanel({ Icon, title, body, action, className }) {
  return (
    <div className={`flex flex-col p-8 sm:p-12 ${className}`}>
      <span className="flex size-12 items-center justify-center rounded-full bg-forest-700 text-white">
        <Icon className="size-6" />
      </span>
      <h3 className="mt-6 text-2xl font-medium tracking-tight text-forest-800">{title}</h3>
      <p className="mt-3 max-w-md flex-1 leading-relaxed text-muted">{body}</p>
      <div className="mt-8">{action}</div>
    </div>
  )
}
