import { Authenticated, Unauthenticated, useQuery } from '@tetherdb/react'
import { Link } from 'react-router'
import AccountLayout from './pages/AccountLayout'

function UserInfo() {
  const { data: userInfo } = useQuery('getUserInfo')
  return <p className="text-[13px] text-foreground-muted">Welcome, {userInfo?.Username}</p>
}

function App() {
  return (
    <AccountLayout title="Tether Chat" description="A shared space for your team’s conversations.">
      <Authenticated>
        <div className="flex flex-col gap-4">
          <UserInfo />
          <Link to="/chat" className="inline-flex items-center justify-center rounded-[2px] bg-brand-primary px-4 py-2.5 text-[13px] font-medium leading-5 text-white transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">Enter chat</Link>
        </div>
      </Authenticated>
      <Unauthenticated>
        <div className="flex items-center gap-3">
          <Link to="/login" className="inline-flex flex-1 items-center justify-center rounded-[2px] bg-brand-primary px-4 py-2.5 text-[13px] font-medium leading-5 text-white transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">Login</Link>
          <Link to="/register" className="inline-flex flex-1 items-center justify-center rounded-[2px] border border-background-tertiary bg-background-secondary px-4 py-2.5 text-[13px] font-medium leading-5 transition-colors hover:bg-foreground-muted-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">Register</Link>
        </div>
      </Unauthenticated>
    </AccountLayout>
  )
}

export default App
