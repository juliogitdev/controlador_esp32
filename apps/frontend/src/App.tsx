import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { DashboardPage } from "./pages/DashboardPage";
import { RegistrationsPage } from "./pages/RegistrationsPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RoomDetailsPage } from "./pages/RoomDetailsPage";
import { RoomsPage } from "./pages/RoomsPage";

export function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedRoute />}><Route element={<AppLayout />}>
      <Route index element={<DashboardPage />} />
      <Route path="ambientes" element={<RoomsPage />} />
      <Route path="ambientes/:roomId" element={<RoomDetailsPage />} />
      <Route path="cadastros" element={<RegistrationsPage />} />
    </Route></Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes></AuthProvider></BrowserRouter>;
}
