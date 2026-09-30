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
  <div className="flex flex-col items-center justify-center h-screen bg-background">
        <h2 className="text-2xl font-bold">Login</h2>
        <p className="text-sm text-foreground-muted">Please enter your username and password to login</p>
        <div className="flex flex-col items-center justify-center gap-2 mt-4 w-full max-w-md">
            <input className="w-full p-2 rounded-md border border-background-tertiary" type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input className="w-full p-2 rounext-accentded-md border border-background-tertiary" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="w-full p-2 rounded-md bg-brand-primary text-white cursor-pointer hover:bg-accent" disabled={isLoginPending} onClick={() => {
              handleLogin()
            }}>Login</button>
            {error && <p className="text-sm text-error">{error}</p>}
            <Link to="/register" className="text-sm text-foreground-muted cursor-pointer">Don't have an account? Register</Link>
        </div>
    </div>
  )
}

export default Login