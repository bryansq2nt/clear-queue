'use client'

import { useState } from 'react'
import { signUp } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export default function SignupForm() {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    const result = await signUp(formData)

    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
      return
    }

    if (result?.success && result?.message) {
      setSuccess(result.message)
      setIsLoading(false)
      return
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4 bg-white p-6 rounded-lg shadow-lg">
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 text-green-800 text-sm p-3 rounded-md">
          {success}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          placeholder="••••••••"
        />
        <p className="text-xs text-muted-foreground">At least 6 characters</p>
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Creating account...' : 'Sign Up'}
      </Button>
      <p className="text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
