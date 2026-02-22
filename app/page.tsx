import { Suspense } from 'react';
import { getUser } from '@/lib/auth';
import { getProjectsList } from '@/app/actions/projects';
import { getProfileOptional } from '@/app/profile/actions';
import LoginForm from '@/components/auth/LoginForm';
import AuthCallbackHandler from '@/components/auth/AuthCallbackHandler';
import ContextProjectPicker from '@/app/context/ContextProjectPicker';
import { SkeletonProjectPicker } from '@/components/skeletons/SkeletonProjectPicker';

async function HomeProjectsContent({
  user,
  searchParams,
}: {
  user: { id: string; email?: string | null };
  searchParams: { error?: string; from?: string };
}) {
  const [projects, profile] = await Promise.all([
    getProjectsList(),
    getProfileOptional(),
  ]);
  const userDisplayName =
    profile?.display_name?.trim() || user.email?.split('@')[0] || 'User';
  const returningFromProject = searchParams.from === 'project';
  return (
    <ContextProjectPicker
      initialProjects={projects}
      showBackButton={false}
      userDisplayName={userDisplayName}
      returningFromProject={returningFromProject}
    />
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: { error?: string; from?: string };
}) {
  const user = await getUser();

  if (user) {
    return (
      <Suspense fallback={<SkeletonProjectPicker />}>
        <HomeProjectsContent user={user} searchParams={searchParams} />
      </Suspense>
    );
  }

  return (
    <>
      <Suspense fallback={null}>
        <AuthCallbackHandler />
      </Suspense>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="w-full max-w-md p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              Mutech Labs
              <br />
              Task Manager
            </h1>
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
  );
}
