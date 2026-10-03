import React from 'react';

import { ArchivedFlows } from '@/components/flows/archived-flows';

/**
 * Settings › Workspace › Archived flows (24.12): the Flows tab's list, in the
 * Settings stack. Its flows open in Settings too, so Back returns to Settings —
 * the owner's build 9 found the old row switching to the Flows tab.
 */
export default function SettingsArchivedFlowsScreen() {
  return <ArchivedFlows detailPath="/(tabs)/settings/archived-flow" />;
}
