import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import { TetherProvider, useTether } from '@tetherdb/react'
import './index.css'
import App from './App.tsx'
import Login from './pages/Login.tsx'
import Register from './pages/Register.tsx'
import ChatSidebars from './pages/ChatSidebars.tsx'
import Chat from './pages/Chat.tsx'

function AutoLogin() {
  const { setToken } = useTether()
  const token = localStorage.getItem('token')
  if (token) {
    setToken(token)
  }
  return null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TetherProvider url="http://localhost:8080/tether">
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
        </Routes>
      </BrowserRouter>
    </TetherProvider>
  </StrictMode>
)
