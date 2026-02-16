import * as Sentry from '@sentry/nextjs';

const isProd = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: 'https://eb3128d8591323e6879fa0193f78be35@o4510887379795968.ingest.us.sentry.io/4510887395328000',
  tracesSampleRate: isProd ? 0.2 : 1,
  enableLogs: !isProd,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.user) {
      event.user.email = undefined;
      event.user.ip_address = undefined;
      event.user.username = undefined;
    }
    return event;
  },
});
