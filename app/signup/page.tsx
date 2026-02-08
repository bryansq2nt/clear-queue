import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import SignupForm from '@/components/SignupForm'

export default async function SignupPage() {
  const user = await getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Mutech Labs<br />Task Manager</h1>
          <p className="text-slate-600">Create your account</p>
        </div>
        <SignupForm />
      </div>
    </div>
  )
}
