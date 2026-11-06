import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import axios from 'axios'
import './index.css'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AuthGate from './AuthGate.tsx'
import PlatformGate from './platform/PlatformGate.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 3;
      },
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/platform/*" element={<PlatformGate />} />
          <Route path="/*" element={<AuthGate />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
