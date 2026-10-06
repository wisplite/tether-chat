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

function AutoLogin() {
  const { setToken } = useTether()
  const token = localStorage.getItem('token')
  if (token) {
    setToken(token)
  }
  return null
}

const url = import.meta.env.VITE_TETHER_URL || 'http://localhost:8080/tether'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TetherProvider url={url}>
      <div className="min-h-dvh bg-background font-sans text-[13px] leading-[18px] text-foreground antialiased [--color-background:light-dark(#ffffff,#141415)] [--color-background-secondary:light-dark(#f7f7f8,#1d1e20)] [--color-background-tertiary:light-dark(#e5e5e9,#2b2c30)] [--color-foreground:light-dark(#232429,#f2f2f3)] [--color-foreground-muted:light-dark(#666873,#c8c9d0)] [--color-foreground-ultra-muted:light-dark(#e5e5e9,#2b2c30)] [--color-foreground-muted-hover:light-dark(#eeeef2,#26272b)] [--color-brand-primary:#4972d7] [--color-accent:light-dark(#3d60bb,#6477f3)] [--color-accent-light:light-dark(#eeeef2,#26272b)] [--color-error:light-dark(#b93636,#d85454)] [--color-success:light-dark(#087f5b,#1acb91)] [--color-warning:light-dark(#916000,#e5a334)] [--font-sans:Plus_Jakarta_Sans,Arial,sans-serif] [--font-mono:JetBrains_Mono,monospace]">
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
          </Route>
        </Routes>
      </BrowserRouter>
      </div>
    </TetherProvider>
  </StrictMode>
)
