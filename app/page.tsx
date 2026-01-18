import { redirect } from 'next/navigation'
import { checkIsAdmin } from '@/lib/auth'
import LoginForm from '@/components/LoginForm'

export default async function Home({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const isAdmin = await checkIsAdmin()

  if (isAdmin) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Mutech labs - Task Manager</h1>
          <p className="text-slate-600">Personal Task Manager</p>
        </div>
        {searchParams.error === 'unauthorized' && (
          <div className="mb-4 bg-destructive/10 text-destructive text-sm p-3 rounded-md">
            Not authorized. Only the admin email can access this application.
          </div>
        )}
        <LoginForm />
      </div>
    </div>
  )
}
