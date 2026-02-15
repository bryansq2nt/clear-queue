import { requireAuth } from '@/lib/auth';
import SettingsLayoutClient from './SettingsLayoutClient';

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();
  return <SettingsLayoutClient>{children}</SettingsLayoutClient>;
}
