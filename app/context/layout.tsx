import { ContextDataCacheProvider } from './ContextDataCache';

/**
 * Provider lives here so it stays mounted when switching between projects.
 * Cache persists across /context/projectA → /context/projectB → /context/projectA.
 */
export default function ContextLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ContextDataCacheProvider>{children}</ContextDataCacheProvider>;
}
