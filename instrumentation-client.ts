import * as Sentry from '@sentry/nextjs';

const isProd = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: 'https://eb3128d8591323e6879fa0193f78be35@o4510887379795968.ingest.us.sentry.io/4510887395328000',
  integrations: [Sentry.replayIntegration()],
  tracesSampleRate: isProd ? 0.2 : 1,
  enableLogs: !isProd,
  replaysSessionSampleRate: isProd ? 0.05 : 0.3,
  replaysOnErrorSampleRate: isProd ? 0.5 : 1,
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
