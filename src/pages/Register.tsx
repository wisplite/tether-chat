import { useState, useEffect } from 'react'
import { useMutation } from '@tetherdb/react'
import { Link } from 'react-router'

function Register() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const { mutate: register, isPending: isRegisterPending, error: registerError } = useMutation('createAccount')
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
    await register({ username, password })
  }
  return (
  <div className="flex flex-col items-center justify-center h-screen bg-background">
        <h2 className="text-2xl font-bold">Register</h2>
        <p className="text-sm text-foreground-muted">Please enter your username and password to register</p>
        <div className="flex flex-col items-center justify-center gap-2 mt-4 w-full max-w-md">
            <input className="w-full p-2 rounded-md border border-background-tertiary" type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input className="w-full p-2 rounext-accentded-md border border-background-tertiary" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <input className="w-full p-2 rounded-md border border-background-tertiary" type="password" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            <button className="w-full p-2 rounded-md bg-brand-primary text-white cursor-pointer hover:bg-accent" disabled={isRegisterPending} onClick={() => {
              handleRegister()
            }}>Register</button>
            {error && <p className="text-sm text-error">{error}</p>}
            <Link to="/login" className="text-sm text-foreground-muted cursor-pointer">Already have an account? Login</Link>
        </div>
    </div>
  )
}

export default Register