import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from '@headlessui/react'
import {
  BookOpen,
  Camera,
  ChevronDown,
  Inbox,
  LayoutGrid,
  LogOut,
  Menu as MenuIcon,
  MessagesSquare,
  UserRound,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, useNavigate } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { homePathFor } from '../../auth/homePath'
import { cx } from '../../lib/cx'
import { LogoLink } from '../ui/Logo'
import { NotificationsMenu } from './NotificationsMenu'

// `end`: active only on that exact page, not on the pages below it.
function navLinksFor(role, t) {
  const pestGuide = { to: '/pests', label: t('nav.pestGuide'), Icon: BookOpen, end: false }
  if (role === 'specialist') {
    return [{ to: '/specialist', label: t('nav.reviewQueue'), Icon: Inbox, end: false }, pestGuide]
  }
  return [
    { to: '/dashboard', label: t('nav.dashboard'), Icon: LayoutGrid, end: true },
    { to: '/observations/new', label: t('nav.newObservation'), Icon: Camera, end: true },
    { to: '/reviews', label: t('nav.reviews'), Icon: MessagesSquare, end: true },
    pestGuide,
  ]
}

export function Header() {
  const { t } = useTranslation()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const links = navLinksFor(user.role, t)

  const handleSignOut = async () => {
    await signOut()
    navigate('/sign-in', { replace: true })
  }

  return (
    <Disclosure as="header" className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur-md print:hidden">
      {({ open, close }) => (
        <>
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6 lg:gap-8">
            <LogoLink to={homePathFor(user)} />

            <nav aria-label={t('nav.main')} className="hidden items-center gap-1 lg:flex">
              {links.map(({ to, label, Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cx(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-[0.95rem] font-medium transition-colors',
                      isActive
                        ? 'bg-forest-50 text-forest-800'
                        : 'text-muted hover:bg-sage-50 hover:text-forest-800',
                    )
                  }
                >
                  <Icon className="size-4.5" />
                  {label}
                </NavLink>
              ))}
            </nav>

            <div className="ms-auto flex items-center gap-1 sm:gap-2">
              <NotificationsMenu />
              <AccountMenu user={user} onSignOut={handleSignOut} />
              <DisclosureButton
                aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
                className="flex size-10 items-center justify-center rounded-lg text-forest-800 hover:bg-forest-50 lg:hidden"
              >
                {open ? <X className="size-6" /> : <MenuIcon className="size-6" />}
              </DisclosureButton>
            </div>
          </div>

          <DisclosurePanel className="border-t border-line bg-white lg:hidden">
            <nav aria-label={t('nav.main')} className="mx-auto max-w-6xl space-y-1 px-4 py-3">
              {links.map(({ to, label, Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => close()}
                  className={({ isActive }) =>
                    cx(
                      'flex items-center gap-3 rounded-lg px-3 py-3 font-medium',
                      isActive ? 'bg-forest-50 text-forest-800' : 'text-ink hover:bg-sage-50',
                    )
                  }
                >
                  <Icon className="size-5" />
                  {label}
                </NavLink>
              ))}
            </nav>
          </DisclosurePanel>
        </>
      )}
    </Disclosure>
  )
}

function initialsOf(name) {
  const parts = name.trim().split(/\s+/)
  return (parts[0][0] + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase()
}

function AccountMenu({ user, onSignOut }) {
  const { t } = useTranslation()
  const itemClasses =
    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm text-ink data-focus:bg-forest-50 data-focus:text-forest-800'

  return (
    <Menu>
      <MenuButton
        aria-label={t('nav.accountMenu', { name: user.full_name })}
        className="flex items-center gap-2 rounded-full py-1 ps-1 pe-2 text-sm font-medium text-ink hover:bg-sage-50 data-open:bg-sage-50"
      >
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-forest-700 text-xs font-semibold text-white"
        >
          {initialsOf(user.full_name)}
        </span>
        <span className="hidden max-w-40 truncate sm:block lg:hidden xl:block">{user.full_name}</span>
        <ChevronDown className="size-4 text-muted" />
      </MenuButton>
      <MenuItems
        anchor="bottom end"
        className="z-40 w-64 rounded-xl border border-line bg-white p-1.5 shadow-raised [--anchor-gap:0.5rem] focus:outline-none"
      >
        <div className="px-3 py-2.5">
          <p className="truncate font-medium text-ink">{user.full_name}</p>
          <p className="truncate text-sm text-muted">{user.email}</p>
          <p className="mt-2 inline-flex rounded-full bg-sage-100 px-2.5 py-0.5 text-xs font-medium text-sage-800">
            {t(`nav.roles.${user.role}`)}
          </p>
        </div>
        <div className="my-1 h-px bg-line" />
        <MenuItem>
          <Link to="/account" className={itemClasses}>
            <UserRound className="size-4.5 text-muted" />
            {t('nav.account')}
          </Link>
        </MenuItem>
        <MenuItem>
          <button type="button" onClick={onSignOut} className={itemClasses}>
            <LogOut className="size-4.5 text-muted" />
            {t('nav.signOut')}
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  )
}
