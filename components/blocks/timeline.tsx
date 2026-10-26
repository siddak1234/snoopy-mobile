import React from 'react';
import { View } from 'react-native';

import { SurfaceCard } from '@/components/nocturne/surface-card';
import { TrackerStep } from '@/components/runs/tracker-step';
import { trackerLook } from '@/lib/view/runs';

import type { BlockOf } from './look';

/** timeline: the steps (`TrackerStep`, Run details' rows), each its state's look; one this build does not know, "unknown"'s. */
export function TimelineBlock({ block, testID, nested }: { block: BlockOf<'timeline'>; testID: string; nested: boolean }) {
  const steps = (
    <View testID={testID}>
      {block.items.map((item, index) => (
        <TrackerStep
          key={`${item.title}-${index}`}
          row={{ id: `${testID}-${index}`, title: item.title, sub: item.sub ?? '', ...trackerLook(item.state) }}
          divider={index < block.items.length - 1}
        />
      ))}
    </View>
  );
  return nested ? steps : <SurfaceCard>{steps}</SurfaceCard>;
}
