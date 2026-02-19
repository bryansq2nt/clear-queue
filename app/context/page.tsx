import { redirect } from 'next/navigation';

/**
 * /context is not used: the homepage (/) is the project picker with welcome.
 * Redirect so "Volver al inicio" and any /context links go to the same place.
 */
export default async function ContextPage() {
  redirect('/');
}
