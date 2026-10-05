import { Authenticated, Unauthenticated, useQuery } from '@tetherdb/react'
import { Link, useNavigate } from 'react-router'
import AccountLayout from './pages/AccountLayout'
import { useEffect } from 'react'

function UserInfo() {
  const { data: userInfo } = useQuery('getUserInfo')
  return <p className="text-[13px] text-foreground-muted">Welcome, {userInfo?.Username}</p>
}

function RedirectToChat() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate('/chat')
  }, [])
  return null
}

function App() {
  return (
    <>
      <Authenticated>
        <RedirectToChat />
      </Authenticated>
      <Unauthenticated>
        <div className="flex flex-col items-center justify-center h-screen gap-4">
          <h2 className="text-2xl font-bold text-foreground">Tether Chat</h2>
          <div className="flex items-center gap-3 w-full px-4 md:w-1/3">
            <Link to="/register" className="inline-flex flex-1 items-center justify-center rounded-[2px] border border-background-tertiary bg-background-secondary px-4 py-2.5 text-[13px] font-medium leading-5 transition-colors hover:bg-foreground-muted-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">Register</Link>
            <Link to="/login" className="inline-flex flex-1 items-center justify-center rounded-[2px] bg-brand-primary px-4 py-2.5 text-[13px] font-medium leading-5 text-white transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">Login</Link>
          </div>
        </div>
      </Unauthenticated>
    </>
  )
}

export default App
