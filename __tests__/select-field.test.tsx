import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SelectField } from '@/components/select-field';
import { nocturneDark } from '@/constants/theme';
import { renderWithProviders } from '@/test/render';

const KINDS = [
  { value: 'HR', label: 'HR' },
  { value: 'Legal', label: 'Legal' },
];

/**
 * The dropdown floats (24.12, the owner's build 9: "it should bring the drop
 * down to the front and the pop up card should be in the background"): open, its
 * list sits over what follows it — absolutely placed under the box, opaque,
 * stacked above — instead of pushing the card's fields down.
 */
describe('SelectField', () => {
  it('opens a list that floats under the box, opaque and in front, and picking an option closes it', async () => {
    const onSelect = jest.fn();
    await renderWithProviders(
      <View>
        <SelectField
          label="Kind of team"
          testID="kind"
          options={KINDS}
          selected={null}
          placeholder="Choose a kind"
          onSelect={onSelect}
        />
      </View>,
    );
    expect(screen.queryByTestId('kind-list')).toBeNull();
    // Where the box ends: the list starts just under it.
    await fireEvent(screen.getByTestId('kind'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 24, width: 320, height: 50 } },
    });
    await fireEvent.press(screen.getByTestId('kind'));

    const list = StyleSheet.flatten(screen.getByTestId('kind-list').props.style);
    expect(list.position).toBe('absolute');
    expect(list.top).toBe(78);
    expect(list.zIndex).toBe(20);
    expect(list.backgroundColor).toBe(nocturneDark.surface);
    // Raised, and not clipped on the same view (an elevated view that clips draws empty on Android).
    expect(list.overflow).toBeUndefined();

    await fireEvent.press(screen.getByTestId('kind-option-Legal'));
    expect(onSelect).toHaveBeenCalledWith('Legal');
    expect(screen.queryByTestId('kind-list')).toBeNull();
  });
});
