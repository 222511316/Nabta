import { Route, Routes } from 'react-router'
import { PublicOnlyRoute, RequireAuth, RoleGate, RootRedirect } from './auth/guards'
import { AppLayout } from './components/layout/AppLayout'
import { AuthLayout } from './components/layout/AuthLayout'
import { AccountPage } from './features/account/AccountPage'
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { ResetPasswordPage } from './features/auth/ResetPasswordPage'
import { SignInPage } from './features/auth/SignInPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { NotFoundPage } from './features/errors/NotFoundPage'
import { NewObservationPage } from './features/observations/NewObservationPage'
import { ObservationPage } from './features/observations/ObservationPage'
import { PlantFormPage } from './features/plants/PlantFormPage'
import { PlantPage } from './features/plants/PlantPage'
import { SpecialistWorkspacePage } from './features/specialist/SpecialistWorkspacePage'

// Route map: spec §4.2.
export function AppRoutes() {
  return (
    <Routes>
      <Route index element={<RootRedirect />} />

      <Route element={<AuthLayout />}>
        <Route element={<PublicOnlyRoute />}>
          <Route path="sign-in" element={<SignInPage />} />
          <Route path="register" element={<RegisterPage />} />
        </Route>
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="account" element={<AccountPage />} />

          <Route element={<RoleGate role="grower" />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="plants/new" element={<PlantFormPage />} />
            <Route path="plants/:plantId" element={<PlantPage />} />
            <Route path="plants/:plantId/edit" element={<PlantFormPage />} />
            <Route path="observations/new" element={<NewObservationPage />} />
            <Route path="observations/:observationId" element={<ObservationPage />} />
          </Route>

          <Route element={<RoleGate role="specialist" />}>
            <Route path="specialist" element={<SpecialistWorkspacePage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
