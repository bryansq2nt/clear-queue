import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import LoginForm from '@/components/LoginForm'
import AuthCallbackHandler from '@/components/AuthCallbackHandler'

export default async function Home({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const user = await getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <>
      <Suspense fallback={null}>
        <AuthCallbackHandler />
      </Suspense>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="w-full max-w-md p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Mutech Labs<br />Task Manager</h1>
            <p className="text-slate-600">Sign in to your account</p>
          </div>
          {searchParams.error === 'unauthorized' && (
            <div className="mb-4 bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              Please sign in to continue.
            </div>
          )}
          <LoginForm />
        </div>
      </div>
    </>
  )
}
