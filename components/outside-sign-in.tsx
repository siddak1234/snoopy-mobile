import React, { useState } from 'react';
import { StyleSheet } from 'react-native';

import { PillButton } from '@/components/nocturne/pill-button';
import { Page } from '@/components/page';
import { Text } from '@/components/text';
import { fonts, status, typeScale } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import {
  JOIN_REFUSALS,
  OUTSIDE_SIGN_IN_NEXT,
  removeSignIn,
  unlinkRefusal,
  type OutsideSignIn as SignIn,
} from '@/lib/content/refusals';
import { SIGN_OUT_FAILED } from '@/lib/content/screen-states';
import { unlinkIdentity } from '@/lib/platform/account';

/**
 * A domain-only organization's workspace refused the person, at session
 * resolve, for a sign-in outside its verified domains (the stage 1 spec's
 * S1-11; backend §12.1 #221, option b′): drawn by the tabs' layout in the
 * tabs' place. "This organization admits only people who sign in with
 * addresses at its verified domains.", "Remove your other sign-in to
 * continue." and "Remove {provider} sign-in" for each sign-in the refusal
 * names (the danger pill: it removes), which unlinks it as Settings › Account
 * does (`unlinkIdentity`, its refusal in `unlinkRefusal`'s words); once every
 * one is gone the session is read again and the tabs come back. Sign out stays
 * offered, so a sign-in the platform will not unlink never strands the person.
 */
export function OutsideSignIn({ providers, onCleared }: { providers: readonly SignIn[]; onCleared: () => void }) {
  const { palette } = useTheme();
  const session = useSession();
  const [left, setLeft] = useState<readonly SignIn[]>(providers);
  const [busy, setBusy] = useState<SignIn | 'sign-out' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (provider: SignIn) => {
    setBusy(provider);
    setError(null);
    try {
      await unlinkIdentity(provider);
      const rest = left.filter((each) => each !== provider);
      setLeft(rest);
      if (rest.length === 0) {
        void session.reload();
        onCleared();
      }
    } catch (caught) {
      setError(unlinkRefusal(caught));
    } finally {
      setBusy(null);
    }
  };

  const signOut = async () => {
    setBusy('sign-out');
    setError(null);
    const { revoked } = await session.signOut();
    setBusy(null);
    if (!revoked) setError(SIGN_OUT_FAILED);
  };

  return (
    <Page testID="outside-sign-in">
      <Text style={[styles.lead, { color: palette.text }]}>{JOIN_REFUSALS.outside_org_domain}</Text>
      <Text style={[styles.body, { color: palette.neutral[400] }]}>{OUTSIDE_SIGN_IN_NEXT}</Text>
      {left.map((provider) => (
        <PillButton
          key={provider}
          testID={`outside-remove-${provider}`}
          label={removeSignIn(provider)}
          variant="danger"
          disabled={busy !== null}
          onPress={() => void remove(provider)}
        />
      ))}
      {error ? (
        <Text accessibilityRole="alert" style={[styles.body, { color: status.err }]}>
          {error}
        </Text>
      ) : null}
      <PillButton
        testID="outside-sign-out"
        label="Sign out"
        variant="secondary"
        disabled={busy !== null}
        onPress={() => void signOut()}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: fonts.medium, ...typeScale.body },
  body: { fontFamily: fonts.regular, ...typeScale.small },
});
