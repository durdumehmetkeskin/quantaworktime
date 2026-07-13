import { Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { RequireAuth } from "./lib/auth";
import { DashboardPage } from "./pages/DashboardPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { LoginPage } from "./pages/LoginPage";
import { RecordsPage } from "./pages/RecordsPage";
import { TabletsPage } from "./pages/TabletsPage";
import { TimesheetsPage } from "./pages/TimesheetsPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/tablets" element={<TabletsPage />} />
        <Route path="/timesheets" element={<TimesheetsPage />} />
        <Route path="/records" element={<RecordsPage />} />
      </Route>
    </Routes>
  );
}
