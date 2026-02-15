import { requireAuth } from '@/lib/auth';
import ProfileLayoutClient from './ProfileLayoutClient';

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();
  return <ProfileLayoutClient>{children}</ProfileLayoutClient>;
}
