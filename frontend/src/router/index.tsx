import { createBrowserRouter } from "react-router-dom";
import { RootLayout } from "./RootLayout";
import {
  DashboardPage,
  AccountsPage,
  SettingsPage,
  TransactionsPage,
  CategoriesPage,
  ImportStatementsPage,
  NotFoundPage,
} from "../pages";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <NotFoundPage />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: "accounts",
        element: <AccountsPage />,
      },

      {
        path: "settings",
        element: <SettingsPage />,
      },
      {
        path: "import",
        element: <ImportStatementsPage />,
      },
      {
        path: "transactions",
        element: <TransactionsPage />,
      },
      {
        path: "categories",
        element: <CategoriesPage />,
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
]);



