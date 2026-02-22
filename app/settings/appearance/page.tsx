import { getPreferences } from './actions';
import { getAssetSignedUrl } from '@/app/profile/actions';
import AppearancePageClient from './AppearancePageClient';

export default async function AppearanceSettingsPage() {
  const prefs = await getPreferences();
  const companyLogoUrl =
    prefs?.company_logo_asset_id != null
      ? await getAssetSignedUrl(prefs.company_logo_asset_id)
      : null;
  const coverImageUrl =
    prefs?.cover_image_asset_id != null
      ? await getAssetSignedUrl(prefs.cover_image_asset_id)
      : null;

  return (
    <AppearancePageClient
      initialPrefs={prefs}
      initialCompanyLogoUrl={companyLogoUrl}
      initialCoverImageUrl={coverImageUrl}
    />
  );
}
