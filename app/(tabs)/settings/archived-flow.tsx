import React from 'react';

import { WorkflowDetail } from '@/app/(tabs)/flows/detail';

/**
 * An archived flow's page, opened from Settings' Archived flows (24.12): the
 * Flows tab's own page, registered in the Settings stack so Back returns to the
 * list it was opened from. Its live twin, where it has one, opens here too
 * (build 11, D3), so Back still returns to Settings.
 */
export default function SettingsArchivedFlowScreen() {
  return <WorkflowDetail detailPath="/(tabs)/settings/archived-flow" />;
}
