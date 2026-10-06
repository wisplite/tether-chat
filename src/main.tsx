import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { TetherProvider, useTether } from '@tetherdb/react'
import './index.css'
import App from './App.tsx'
import Login from './pages/Login.tsx'
import Register from './pages/Register.tsx'
import ChatSidebars from './pages/ChatSidebars.tsx'
import Chat from './pages/Chat.tsx'
import Settings from './pages/Settings.tsx'
import Profile from './pages/settings/Profile.tsx'
import Appearance from './pages/settings/Appearance.tsx'
import { AppearanceProvider } from './context/Appearance.tsx'

if (!crypto.randomUUID) {
  crypto.randomUUID = () =>
    '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
      (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
    ) as `${string}-${string}-${string}-${string}-${string}`
}

function AutoLogin() {
  const { setToken } = useTether()
  const token = localStorage.getItem('token')
  if (token) {
    setToken(token)
  }
  return null
}

const url = import.meta.env.VITE_TETHER_URL || 'http://fox:8080/tether'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TetherProvider url={url}>
      <AppearanceProvider>
      <div className="min-h-dvh bg-background font-sans text-[13px] leading-[18px] text-foreground antialiased">
      <AutoLogin />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<App />} />
          <Route element={<ChatSidebars />}>
            <Route path="/chat" element={<Chat />} />
            <Route path="/chat/:channelId" element={<Chat />} />
          </Route>
          <Route element={<Settings />}>
            <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
            <Route path="/settings/profile" element={<Profile />} />
            <Route path="/settings/appearance" element={<Appearance />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </div>
      </AppearanceProvider>
    </TetherProvider>
  </StrictMode>
)
