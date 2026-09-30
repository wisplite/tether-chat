import { Authenticated, Unauthenticated, useQuery } from '@tetherdb/react'
import { useNavigate } from 'react-router'
import './App.css'

function UserInfo() {
  const { data: userInfo } = useQuery('getUserInfo')
  return (
    <p className="text-sm text-foreground-muted">
      Welcome, {userInfo?.Username}
    </p>
  )
}

function App() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-background">
      <Authenticated>
        <div className="flex flex-col items-center justify-center h-screen bg-background">
          <h2 className="text-2xl font-bold">Welcome to Tether Chat</h2>
          <p className="text-sm text-foreground-muted">Please enter your username and password to login</p>
          <div className="flex flex-col items-center justify-center gap-4 mt-4">
            <UserInfo />
            <button className="bg-brand-primary text-white px-4 py-2 rounded-md cursor-pointer hover:bg-accent" onClick={() => {
              navigate('/chat')
            }}>Enter Chat</button>
          </div>
        </div>
      </Authenticated>
      <Unauthenticated>
        <div className="flex flex-col items-center justify-center h-screen bg-background">
          <h2 className="text-2xl font-bold">Welcome to Tether Chat</h2>
          <p className="text-sm text-foreground-muted">Please register or login to continue</p>
          <div className="flex flex-row items-center justify-center gap-4 mt-4">
            <button className="bg-brand-primary text-white px-4 py-2 rounded-md cursor-pointer hover:bg-accent" onClick={() => {
              navigate('/register')
            }}>Register</button>
            <button className="bg-brand-primary text-white px-4 py-2 rounded-md cursor-pointer hover:bg-accent" onClick={() => {
              navigate('/login')
            }}>Login</button>
          </div>
        </div>
      </Unauthenticated>
    </div>
  )
}

export default App
