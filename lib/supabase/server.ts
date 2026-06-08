import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isLocalDataProvider } from '@/lib/data-provider/config';
import { createLocalSupabaseClient } from '@/lib/data-provider/local/client';
import { Database } from './types';

export const createClient = async () => {
  const cookieStore = await cookies();

  if (isLocalDataProvider()) {
    // Cast keeps existing server actions typed; swap DATA_PROVIDER to use Supabase again.
    return createLocalSupabaseClient(cookieStore) as unknown as ReturnType<
      typeof createServerClient<Database>
    >;
  }

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
};
