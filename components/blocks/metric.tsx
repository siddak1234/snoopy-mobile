import React from 'react';

import { StatCard } from '@/components/nocturne/stat-card';
import { StatTileRow } from '@/components/stat-tile-button';
import { useTheme } from '@/hooks/use-theme';

import { toneColor, toneOf, type BlockOf } from './look';

/** metric: the tiles (`StatTileRow` of `StatCard`s), each value large over its label, toned by its tone. */
export function MetricBlock({ block, testID }: { block: BlockOf<'metric'>; testID: string }) {
  const { palette } = useTheme();
  return (
    <StatTileRow testID={testID}>
      {block.items.map((item, index) => (
        <StatCard
          key={`${item.label}-${index}`}
          value={item.value}
          label={item.label}
          size="sm"
          valueColor={toneOf(item.tone) === 'neutral' ? undefined : toneColor(item.tone, palette)}
        />
      ))}
    </StatTileRow>
  );
}
