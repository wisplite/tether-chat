import AccountLayout from './AccountLayout'
import { useState, useEffect } from 'react'
import { useMutation, useTether } from '@tetherdb/react'
import { Link, useNavigate } from 'react-router'

function Register() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const { mutate: register, isPending: isRegisterPending, error: registerError } = useMutation('createAccount')
  const { mutate: login, isPending: isLoginPending, error: loginError } = useMutation('login')
  const { setToken } = useTether()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  useEffect(() => {
    if (registerError) {
      setError(registerError.message)
    }
  }, [registerError])
  const handleRegister = async () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    const { userID } = await register({ username, password })
    if (userID) {
      const response = await login({ username, password })
      if (response.token) {
        localStorage.setItem('token', response.token)
        setToken(response.token)
        navigate('/')
      }
    }
  }
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <h2 className="text-2xl font-bold text-foreground">Register</h2>
      <div className="flex w-full px-4 md:w-1/3 flex-col gap-4">
        <label className="flex flex-col gap-2 text-[13px] font-medium">Username
          <input autoComplete="username" className="w-full rounded-[2px] border border-background-tertiary bg-background-secondary px-3 py-2.5 text-[13px] leading-5 outline-none placeholder:text-foreground-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20" type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2 text-[13px] font-medium">Password
          <input autoComplete="new-password" className="w-full rounded-[2px] border border-background-tertiary bg-background-secondary px-3 py-2.5 text-[13px] leading-5 outline-none placeholder:text-foreground-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2 text-[13px] font-medium">Confirm Password
          <input autoComplete="new-password" className="w-full rounded-[2px] border border-background-tertiary bg-background-secondary px-3 py-2.5 text-[13px] leading-5 outline-none placeholder:text-foreground-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20" type="password" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </label>
        <button className="w-full rounded-[2px] bg-brand-primary px-4 py-2.5 text-[13px] font-medium leading-5 text-white cursor-pointer transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={isRegisterPending || isLoginPending} onClick={() => {
          handleRegister()
        }}>Register</button>
        {(error || loginError) && <p role="alert" className="text-[13px] leading-5 text-error">{error || loginError?.message}</p>}
        <Link to="/login" className="self-start rounded-[2px] text-[13px] text-foreground-muted underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary">Already have an account? Login</Link>
      </div>
    </div>
  )
}

export default Register