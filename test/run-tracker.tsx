import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import RunDetailsScreen from '@/app/(tabs)/activity/run-details';
import { TrackerStep } from '@/components/runs/tracker-step';
import { useRunDetail } from '@/hooks/use-run-detail';

/**
 * A run's steps as its steps face draws them (`toTracker` through
 * `useRunDetail`, each a `TrackerStep`), for a test of the step rules in any
 * status — a succeeded run's too, whose page shows its result and no steps since
 * builds 37 and 39, while Run details' Steps done still counts them. Drawn
 * under Run details (`RunDetailsScreen`), so a test reads the rows and the
 * tiles together, as Run details drew both until builds 37 and 39. A test
 * harness only: the app draws these rows on the run page's steps face.
 */
export function RunDetailsWithSteps() {
  const { runId } = useLocalSearchParams<{ runId?: string }>();
  const { tracker } = useRunDetail(runId);
  return (
    <>
      <RunDetailsScreen />
      <View testID="run-progress">
        {tracker.map((row, i) => (
          <TrackerStep key={row.id} row={row} divider={i < tracker.length - 1} />
        ))}
      </View>
    </>
  );
}
