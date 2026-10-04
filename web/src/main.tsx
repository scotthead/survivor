import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './hooks/useAuth'
import { ProtectedRoute } from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NewGroup from './pages/NewGroup'
import JoinGroup from './pages/JoinGroup'
import GroupPage from './pages/GroupPage'
import GamePage from './pages/GamePage'
import Contestants from './pages/Contestants'
import ContestantDetail from './pages/ContestantDetail'
import History from './pages/History'
import './index.css'

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/groups/new" element={<NewGroup />} />
              <Route path="/groups/join/:code" element={<JoinGroup />} />
              <Route path="/groups/:id" element={<GroupPage />} />
              <Route path="/games/:id" element={<GamePage />} />
              <Route path="/games/:id/pick" element={<Contestants />} />
              <Route path="/contestants" element={<Contestants />} />
              <Route path="/contestants/:id" element={<ContestantDetail />} />
              <Route path="/history" element={<History />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
