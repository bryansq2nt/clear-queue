import ResetPasswordClient from './ResetPasswordClient';

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Mutech Labs
            <br />
            Task Manager
          </h1>
          <p className="text-slate-600">Set your new password</p>
        </div>
        <ResetPasswordClient />
      </div>
    </div>
  );
}
