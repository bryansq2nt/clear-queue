'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useI18n } from '@/components/shared/I18nProvider';
import { ContextTabBar } from './ContextTabBar';
import ContextProjectPicker from '@/app/context/ContextProjectPicker';
import { getHomePageData } from '@/app/actions/home';
import { LogOut } from 'lucide-react';

const EXIT_TRANSITION_MS = 280;

export interface ContextShellProps {
  projectId: string;
  projectName: string;
  children: React.ReactNode;
}

/**
 * Context navigation shell: header + tab bar (Salir + Etapas + ...) + content.
 * "Salir" pre-renders the home with fetched data, then slides project left and home in from the right
 * so the user sees content during the transition (no blank load). URL is updated without a full navigation.
 */
export function ContextShell({
  projectId,
  projectName,
  children,
}: ContextShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const [isEntering, setIsEntering] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const [homeData, setHomeData] =
    useState<Awaited<ReturnType<typeof getHomePageData>>>(null);
  const exitFromPathRef = useRef<string | null>(null);

  // Entry animation: project view slides in from the right when first opening a project.
  useEffect(() => {
    const t = setTimeout(() => setIsEntering(false), 0);
    return () => clearTimeout(t);
  }, []);

  // Pre-render home data so Salir can show it sliding in (user can't change projects from here).
  useEffect(() => {
    getHomePageData().then(setHomeData);
  }, []);

  useEffect(() => {
    if (!isExiting) return;
    const t = setTimeout(() => {
      window.history.replaceState(null, '', '/?from=project');
    }, EXIT_TRANSITION_MS);
    return () => clearTimeout(t);
  }, [isExiting]);

  const handleExitStart = () => {
    if (homeData) {
      exitFromPathRef.current = pathname ?? null;
      setIsExiting(true);
    } else {
      router.push('/?from=project');
    }
  };

  const handleBackToProject = () => {
    setIsExiting(false);
    const returnPath = exitFromPathRef.current;
    if (returnPath) {
      setTimeout(() => {
        window.history.replaceState(null, '', returnPath);
      }, EXIT_TRANSITION_MS);
    }
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      {/* Project layer: enters from right on mount, slides left on exit */}
      <div
        className="flex h-full w-full flex-col bg-background transition-transform duration-[280ms] ease-out"
        style={{
          transform: isEntering
            ? 'translateX(100%)'
            : isExiting
              ? 'translateX(-100%)'
              : undefined,
        }}
      >
        <header className="bg-primary text-primary-foreground shadow flex-shrink-0">
          <div className="px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3 min-w-0">
            <div className="flex-1 min-w-0" aria-hidden />
            <h1 className="text-base md:text-xl font-bold truncate min-w-0 text-center px-2 flex-shrink-0">
              {projectName}
            </h1>
            <div className="flex flex-1 justify-end min-w-0 flex-shrink-0">
              <Link
                href="/?from=project"
                onClick={(e) => {
                  if (homeData) {
                    e.preventDefault();
                    handleExitStart();
                  }
                }}
                className="flex items-center gap-2 py-2 px-3 rounded-md text-primary-foreground hover:bg-primary-foreground/10 transition-colors min-h-[44px]"
                aria-label={t('context.exit')}
              >
                <LogOut className="w-5 h-5 flex-shrink-0" aria-hidden />
                <span className="hidden sm:inline font-medium">
                  {t('context.exit')}
                </span>
              </Link>
            </div>
          </div>
        </header>
        <ContextTabBar projectId={projectId} />
        <main
          id="context-tab-content"
          className="relative flex-1 overflow-auto min-h-0"
        >
          {children}
        </main>
      </div>

      {/* Home layer: pre-rendered, slides in from the right when exiting */}
      {homeData && (
        <div
          className="fixed inset-0 z-10 flex flex-col bg-background transition-transform duration-[280ms] ease-out"
          style={{
            transform: isExiting ? 'translateX(0)' : 'translateX(100%)',
          }}
        >
          <ContextProjectPicker
            initialProjects={homeData.projects}
            showBackButton={false}
            userDisplayName={homeData.userDisplayName}
            returningFromProject={true}
            onBackToProject={handleBackToProject}
            backToProjectId={projectId}
          />
        </div>
      )}
    </div>
  );
}
