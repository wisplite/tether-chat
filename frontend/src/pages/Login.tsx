import { useState, useEffect } from 'react'
import { useMutation, useTether } from '@tetherdb/react'
import { Link, useNavigate } from 'react-router'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const { mutate: login, isPending: isLoginPending, error: loginError } = useMutation('login')
  const { setToken } = useTether()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  useEffect(() => {
    if (loginError) {
      setError(loginError.message)
    }
  }, [loginError])
  const handleLogin = async () => {
    const response = await login({ username, password })
    if (response.error) {
        setError(response.error.message)
        return
    }
    if (response.token) {
        localStorage.setItem('token', response.token)
        setToken(response.token)
        navigate('/')
    }
  }
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <h2 className="text-2xl font-bold text-foreground">Log In</h2>
      <div className="flex w-full px-4 md:w-1/3 flex-col gap-4">
          <label className="flex flex-col gap-2 text-[13px] font-medium">Username
            <input autoComplete="username" className="w-full rounded-[2px] border border-background-tertiary bg-background-secondary px-3 py-2.5 text-[13px] leading-5 outline-none placeholder:text-foreground-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20" type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="flex flex-col gap-2 text-[13px] font-medium">Password
            <input autoComplete="current-password" className="w-full rounded-[2px] border border-background-tertiary bg-background-secondary px-3 py-2.5 text-[13px] leading-5 outline-none placeholder:text-foreground-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="w-full rounded-[2px] bg-brand-primary px-4 py-2.5 text-[13px] font-medium leading-5 text-white cursor-pointer transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={isLoginPending} onClick={() => {
            handleLogin()
          }}>Log In</button>
          {error && <p role="alert" className="text-[13px] leading-5 text-error">{error}</p>}
          <Link to="/register" className="self-start rounded-[2px] text-[13px] text-foreground-muted underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary">Don't have an account? Register</Link>
      </div>
    </div>
  )
}

export default Login