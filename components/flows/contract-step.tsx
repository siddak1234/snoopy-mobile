import { ShieldCheck } from 'phosphor-react-native';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { NocToggle } from '@/components/nocturne/noc-toggle';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { TextField } from '@/components/nocturne/text-field';
import { NumberedSectionLabel, numberedName } from '@/components/setup-field';
import { SettingsRow } from '@/components/settings/settings-row';
import { Text } from '@/components/text';
import { fonts, space, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  AGREEMENT_FINALIZING,
  ASK_OWNER_TO_ACCEPT,
  CONTRACT_SECTION,
  SIGNER_NAME_LABEL,
  SIGNER_TITLE_LABEL,
  agreementAccepted,
  authorizedFor,
  signerLine,
} from '@/lib/content/health-agreement';
import { FIGURE_UNAVAILABLE } from '@/lib/content/screen-states';
import type { WorkspaceDocument } from '@/lib/platform/agreements';
import { calendarDate } from '@/lib/view/format';
import { SIGNER_FIELD_LIMIT, type ContractStep as Step } from '@/lib/view/health-agreement';

/**
 * Set up's "Contract and accept" section (builds 37 and 39, wave 2: the
 * owner's item 9, "Where is the BAA contract to view prefilled and checkmark
 * to accept below it"), numbered after the flow's own sections, for a flow
 * that carries health data. What it says in each state is `contractStep`'s
 * (`lib/view/health-agreement.ts`); Set up holds the box and the two fields,
 * and its Turn on accepts first, then turns the flow on.
 *
 * To sign: the text, filled for display (`fillForDisplay`), in a bounded box
 * that scrolls inside the page; then the agreement screen's row and fields
 * (`app/(tabs)/flows/agreement.tsx`): "I'm authorized to sign for
 * {organization}", "Full name" and "Title", each at most 120 characters.
 */
export function ContractStep({
  position,
  step,
  text,
  acceptance,
  organization,
  authorized,
  onAuthorized,
  name,
  onName,
  title,
  onTitle,
  busy,
}: {
  position: number;
  step: Exclude<Step, 'hidden'>;
  /** The filled text, while `sign`. */
  text: string | null;
  /** The acceptance, while `accepted`. */
  acceptance: WorkspaceDocument | null;
  organization: string;
  authorized: boolean;
  onAuthorized: (next: boolean) => void;
  name: string;
  onName: (next: string) => void;
  title: string;
  onTitle: (next: string) => void;
  busy: boolean;
}) {
  const { palette } = useTheme();
  const muted = { color: palette.neutral[400] };
  const line = (words: string, testID: string, color = muted) => (
    <Text testID={testID} style={[styles.text, color]}>
      {words}
    </Text>
  );
  return (
    <View testID="setup-contract">
      <NumberedSectionLabel>{numberedName(position, CONTRACT_SECTION)}</NumberedSectionLabel>
      {step === 'sign' ? (
        <View style={styles.cards}>
          <SurfaceCard style={styles.box}>
            <ScrollView nestedScrollEnabled testID="setup-contract-text" contentContainerStyle={styles.note}>
              <Text style={[styles.text, { color: palette.text }]}>{text ?? ''}</Text>
            </ScrollView>
          </SurfaceCard>
          <SurfaceCard>
            <SettingsRow
              icon={ShieldCheck}
              title={authorizedFor(organization)}
              testID="setup-contract-authorized"
              right={<NocToggle value={authorized} disabled={busy} onChange={onAuthorized} />}
            />
          </SurfaceCard>
          <TextField label={SIGNER_NAME_LABEL} value={name} onChangeText={onName} autoComplete="name" maxLength={SIGNER_FIELD_LIMIT} />
          <TextField label={SIGNER_TITLE_LABEL} value={title} onChangeText={onTitle} maxLength={SIGNER_FIELD_LIMIT} />
        </View>
      ) : (
        <SurfaceCard padded>
          {step === 'accepted' && acceptance ? (
            <>
              {line(agreementAccepted(acceptance.version, calendarDate(acceptance.acceptedAt)), 'setup-contract-line', {
                color: palette.text,
              })}
              {line(signerLine(acceptance.signerName, acceptance.signerTitle), 'setup-contract-signer')}
            </>
          ) : (
            line(
              step === 'finalizing' ? AGREEMENT_FINALIZING : step === 'ask-owner' ? ASK_OWNER_TO_ACCEPT : FIGURE_UNAVAILABLE,
              'setup-contract-line',
            )
          )}
        </SurfaceCard>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cards: { gap: space.inner },
  // Bounded: the text scrolls inside it, and the box, the fields and Turn on stay in reach under it.
  // No clip: the ScrollView clips its own text, and its padding keeps the text off the round corners;
  // a clip on the elevated card draws it empty on Android (`__tests__/android-card-overflow.test.js`).
  box: { maxHeight: 320 },
  note: { padding: space.card },
  text: { fontFamily: fonts.regular, ...typeScale.body },
});
