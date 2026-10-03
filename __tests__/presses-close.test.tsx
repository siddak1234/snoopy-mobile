import { fireEvent, screen } from '@testing-library/react-native';
import React, { useState } from 'react';
import { Text } from 'react-native';

import { PickerDialog } from '@/components/picker-dialog';
import { renderWithProviders } from '@/test/render';

/**
 * The button audit's last press (build 13, B9): PickerDialog's row
 * (`components/picker-dialog.tsx:39`). No screen has drawn PickerDialog since
 * build 8 — `bda1136` removed its two callers, Settings › Team's person picker
 * and the project's team picker — so no screen test can press it. This holds the
 * component's own contract, as its comment states it ("Choose one from a list
 * that may be long … Mounted only while open; picking closes it"), through a
 * caller wired as Settings › Team's was (`bda1136^`,
 * `app/(tabs)/settings/team.tsx:246-258`). Deleting the component, which
 * nothing draws, takes this press and this test with it.
 */

const PEOPLE = [
  { value: 'u-alice', label: 'Alice Ames', sub: 'alice@acme.test' },
  { value: 'u-bob', label: 'Bob Baker', sub: 'bob@acme.test' },
  { value: 'u-carol', label: 'Carol Diaz' },
];

/** Settings › Team's person field until build 8: the choice it holds, and the picker only while picking. */
function PersonField() {
  const [userId, setUserId] = useState<string | undefined>('u-bob');
  const [picking, setPicking] = useState(true);
  return (
    <>
      <Text testID="person">{userId}</Text>
      {picking ? (
        <PickerDialog
          title="Person"
          options={PEOPLE}
          selected={userId}
          empty="This workspace has no one else to add."
          onPick={(value) => {
            setUserId(value);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </>
  );
}

describe('PickerDialog, a component no screen draws since build 8', () => {
  it('a row picks that row — its value, not its label or the one already chosen — and picking closes the picker', async () => {
    await renderWithProviders(<PersonField />);
    expect(screen.getByTestId('person')).toHaveTextContent('u-bob');

    await fireEvent.press(screen.getByText('Carol Diaz'));

    expect(screen.getByTestId('person')).toHaveTextContent('u-carol');
    expect(screen.queryByTestId('picker-dialog')).toBeNull();
  });
});
