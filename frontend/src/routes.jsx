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
import { PlantReportPage } from './features/ai/PlantReportPage'
import { PestGuidePage } from './features/pests/PestGuidePage'
import { PestPage } from './features/pests/PestPage'
import { PlantFormPage } from './features/plants/PlantFormPage'
import { PlantPage } from './features/plants/PlantPage'
import { GrowerReviewsPage } from './features/reviews/GrowerReviewsPage'
import { SpecialistCasePage } from './features/specialist/SpecialistCasePage'
import { SpecialistWorkspacePage } from './features/specialist/SpecialistWorkspacePage'

// Route map: Sprint 1 spec §4.2, plus the Sprint 2 pages.
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
          <Route path="pests" element={<PestGuidePage />} />
          <Route path="pests/:pestKey" element={<PestPage />} />

          <Route element={<RoleGate role="grower" />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="plants/new" element={<PlantFormPage />} />
            <Route path="plants/:plantId" element={<PlantPage />} />
            <Route path="plants/:plantId/edit" element={<PlantFormPage />} />
            <Route path="plants/:plantId/report" element={<PlantReportPage />} />
            <Route path="observations/new" element={<NewObservationPage />} />
            <Route path="observations/:observationId" element={<ObservationPage />} />
            <Route path="reviews" element={<GrowerReviewsPage />} />
          </Route>

          <Route element={<RoleGate role="specialist" />}>
            <Route path="specialist" element={<SpecialistWorkspacePage />} />
            <Route path="specialist/cases/:caseId" element={<SpecialistCasePage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
