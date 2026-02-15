import ProfilePageClient from '@/app/settings/profile/ProfilePageClient';
import {
  getProfileWithAvatar,
  getAssetSignedUrl,
} from '@/app/settings/profile/actions';
import { getPreferences } from '@/app/settings/appearance/actions';

export default async function ProfilePage() {
  const [profile, preferences] = await Promise.all([
    getProfileWithAvatar(),
    getPreferences(),
  ]);

  const initialAvatarUrl =
    profile?.avatar_asset_id != null
      ? await getAssetSignedUrl(profile.avatar_asset_id)
      : null;

  return (
    <ProfilePageClient
      profile={profile}
      preferences={preferences}
      initialAvatarUrl={initialAvatarUrl}
    />
  );
}
