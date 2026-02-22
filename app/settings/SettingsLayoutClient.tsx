'use client';

import { useI18n } from '@/components/shared/I18nProvider';
import TopBar from '@/components/shared/TopBar';
import { signOut } from '@/app/actions/auth';

export default function SettingsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar
        backHref="/"
        projectName={t('settings.title')}
        onSignOut={() => signOut()}
        minimal
      />
      <main className="flex-1 overflow-y-auto flex flex-col">{children}</main>
    </div>
  );
}
