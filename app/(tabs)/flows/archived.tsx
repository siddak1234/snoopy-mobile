import React from 'react';

import { ArchivedFlows } from '@/components/flows/archived-flows';

/**
 * Flows › Archived flows (BUILD-PLAN 24.11.8; renamed from Removed flows by the
 * owner's decision 4 of 2026-10-02, 24.12). A flow opens in the Flows stack.
 */
export default function ArchivedFlowsScreen() {
  return <ArchivedFlows detailPath="/(tabs)/flows/detail" />;
}
