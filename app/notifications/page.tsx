import Link from 'next/link';
import { Bell, Inbox } from 'lucide-react';
import { listMyNotifications } from '@/app/actions/notifications';
import { getProfileOptional } from '@/app/profile/actions';
import { t, type Locale } from '@/lib/i18n';

function roleLabel(locale: Locale, role: string): string {
  const key = `roles.${role}`;
  const translated = t(locale, key);
  return translated === key ? role.replaceAll('_', ' ') : translated;
}

export default async function NotificationsPage() {
  const [notifications, profile] = await Promise.all([
    listMyNotifications(),
    getProfileOptional(),
  ]);
  const locale: Locale = profile?.locale === 'es' ? 'es' : 'en';

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Bell className="w-5 h-5" />
            {t(locale, 'notifications.title')}
          </h1>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {t(locale, 'notifications.back')}
          </Link>
        </div>

        {notifications.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <Inbox className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {t(locale, 'notifications.empty')}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {notifications.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.href}
                  className="block rounded-lg border border-border bg-card p-4 hover:bg-accent/30 transition-colors"
                >
                  <p className="text-sm font-medium text-foreground">
                    {t(locale, 'notifications.invite_title', {
                      project: n.projectName,
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t(locale, 'notifications.invite_message', {
                      role: roleLabel(locale, n.roleName),
                    })}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
