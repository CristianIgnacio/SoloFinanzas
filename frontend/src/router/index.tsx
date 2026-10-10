import { AuthProvider, RequireAuth } from "../auth/AuthProvider";
import {
  HomePage,
  LoginPage,
  AuthCallbackPage,
  InformationPage,
} from "../pages/Public";
import { ProfilePage } from "../pages/Profile";
import { createBrowserRouter, Navigate, useLocation } from "react-router-dom";
import { RootLayout } from "./RootLayout";
import { NotFoundPage } from "../pages/NotFound";
import { lazy, Suspense } from "react";
const DashboardPage = lazy(() =>
  import("../pages/Dashboard").then((m) => ({ default: m.DashboardPage })),
);
const AnalyticsPage = lazy(() =>
  import("../pages/Analytics").then((m) => ({ default: m.AnalyticsPage })),
);
const AccountsPage = lazy(() =>
  import("../pages/Accounts").then((m) => ({ default: m.AccountsPage })),
);
const TransactionsPage = lazy(() =>
  import("../pages/Transactions").then((m) => ({
    default: m.TransactionsPage,
  })),
);
const CategoriesPage = lazy(() =>
  import("../pages/Categories").then((m) => ({ default: m.CategoriesPage })),
);
const ImportStatementsPage = lazy(() =>
  import("../pages/ImportStatements").then((m) => ({
    default: m.ImportStatementsPage,
  })),
);

function LegacyRedirect() {
  const location = useLocation();
  return (
    <Navigate
      to={`/app${location.pathname}${location.search}${location.hash}`}
      replace
    />
  );
}

function LegacySettingsRedirect() {
  const location = useLocation();
  return (
    <Navigate
      to={`/app/accounts${location.search}${location.hash}`}
      replace
    />
  );
}

export const router = createBrowserRouter([
  {
    element: <AuthProvider />,
    errorElement: <NotFoundPage />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/auth/callback", element: <AuthCallbackPage /> },
      { path: "/privacy", element: <InformationPage privacy /> },
      { path: "/help", element: <InformationPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            path: "/app",
            element: <RootLayout />,
            children: [
              {
                index: true,
                element: (
                  <Suspense fallback={<p className="p-8">Cargando…</p>}>
                    <DashboardPage />
                  </Suspense>
                ),
              },
              {
                path: "analytics",
                element: (
                  <Suspense fallback={<p className="p-8">Cargando…</p>}>
                    <AnalyticsPage />
                  </Suspense>
                ),
              },
              {
                path: "accounts",
                element: (
                  <Suspense fallback={<p className="p-8">Cargando…</p>}>
                    <AccountsPage />
                  </Suspense>
                ),
              },
              {
                path: "accounts/manage",
                element: <LegacySettingsRedirect />,
              },
              {
                path: "settings",
                element: <LegacySettingsRedirect />,
              },
              {
                path: "import",
                element: (
                  <Suspense fallback={<p className="p-8">Cargando…</p>}>
                    <ImportStatementsPage />
                  </Suspense>
                ),
              },
              {
                path: "transactions",
                element: (
                  <Suspense fallback={<p className="p-8">Cargando…</p>}>
                    <TransactionsPage />
                  </Suspense>
                ),
              },
              {
                path: "categories",
                element: (
                  <Suspense fallback={<p className="p-8">Cargando…</p>}>
                    <CategoriesPage />
                  </Suspense>
                ),
              },
              { path: "profile", element: <ProfilePage /> },
            ],
          },
        ],
      },
      ...[
        "analytics",
        "accounts",
        "settings",
        "import",
        "transactions",
        "categories",
      ].map((path) => ({ path: `/${path}/*`, element: <LegacyRedirect /> })),
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
