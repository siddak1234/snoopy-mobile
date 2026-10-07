import RunDetailScreen from '@/app/(tabs)/(home)/run';

/**
 * A run's page, opened from Settings › Notifications (24.12): the Home tab's
 * own page, registered in the Settings stack so Back returns to the inbox it
 * was opened from — and the run it continues opens here too (Gate 24's parity
 * pass), not across in Home.
 */
export default function SettingsRunScreen() {
  return <RunDetailScreen runPath="/(tabs)/settings/run" />;
}
