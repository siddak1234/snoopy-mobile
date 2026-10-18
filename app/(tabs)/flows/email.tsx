import { useLocalSearchParams, useRouter } from 'expo-router';
import { EnvelopeSimple, Plus, UserCircle, X } from 'phosphor-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConnectionRow, GlyphMark, NoneMark } from '@/components/connection-row';
import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Pressable } from '@/components/pressable';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { em, fonts, iconSize, layout, radius, status, typeScale, withAlpha } from '@/constants/theme';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { useSession, workspaceIfShown } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { WORKSPACE_CHANGED } from '@/lib/content/refusals';
import {
  EMAIL_ADD,
  EMAIL_ADDING,
  EMAIL_ALSO_LABEL,
  EMAIL_ALWAYS_LABEL,
  EMAIL_ASK_ADMIN,
  EMAIL_DUPLICATE,
  EMAIL_EXTRA_LIMIT,
  EMAIL_INVALID,
  EMAIL_LIMIT_REACHED,
  EMAIL_PLACEHOLDER,
  EMAIL_REMOVING,
  EMAIL_ROLE,
  EMAIL_SAVE_FAILED,
  EMAIL_STARTER,
  EMAIL_TITLE,
  NONE_LABEL,
  errorTitleFor,
  removeAddress,
  vendorFor,
} from '@/lib/content/screen-states';
import {
  readFlowEmailRecipients,
  updateFlowEmailRecipients,
  type FlowEmailRecipients,
} from '@/lib/platform/automations';
import { readCatalog } from '@/lib/platform/catalog';
import { PlatformNotConfiguredError } from '@/lib/platform/problem';
import { readSubscriptions } from '@/lib/platform/runs';
import { addProblem } from '@/lib/view/flow-email';

/**
 * Who gets the email — one flow's run emails (Build 22, P5; spec §4; the owner's
 * build 21 item 5: "When i select this step it should take me to the page where
 * i can edit in a screen the email it should send to"). Opened from the flow
 * page's step 5 with `flow` (the subscription). Top to bottom:
 *
 * 1. Back · "Who gets the email" · "For {flow}";
 * 2. **ALWAYS** — the workspace's owners and admins, each its address and its
 *    role, then "The person who starts the run": who always gets it (the
 *    session's D1, approved by the owner 21:12Z — "It should go to the
 *    owner/admin and the person that uploaded the document");
 * 3. **ALSO SEND TO** — the flow's extra addresses, or None; for an owner or
 *    admin each with its X, then the address field and Add — "You can add up
 *    to 10." once there are ten — and for a member "Ask an owner or admin to
 *    change this." (the session's S12).
 *
 * **Each add and each remove is saved at once** (the session's S30, fewest
 * taps): Add checks the address first — not one, "Enter an email address.";
 * already listed, without case, "Already on the list." — then sends the whole
 * list and shows the platform's answer; X sends the list without it, no
 * question, its row saying "Removing…" meanwhile. A refusal or a failure says
 * "Could not save. Try again." under the section, the list unchanged.
 */
export default function FlowEmailScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  // The platform's latest answer to a change made here, over what was read.
  const [answered, setAnswered] = useState<FlowEmailRecipients | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resource = useWorkspaceResource(
    async (workspaceId) => {
      if (!flow) throw new PlatformNotConfiguredError();
      const [recipients, subscriptions, catalog] = await Promise.all([
        readFlowEmailRecipients(workspaceId, flow),
        readSubscriptions(workspaceId),
        readCatalog(workspaceId),
      ]);
      const subscription = subscriptions.subscriptions.find((item) => item.id === flow);
      const entry = subscription
        ? catalog.automations.find((item) => item.templateId === subscription.templateId)
        : undefined;
      // A re-read replaces what a change here answered: it is as new or newer.
      setAnswered(null);
      return { recipients, name: subscription?.name ?? entry?.name ?? subscription?.templateId ?? null };
    },
    [flow],
  );

  if (resource.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (resource.status === 'offline') {
    return <ScreenOffline onRetry={() => resource.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (resource.status === 'unconfigured') {
    return <ScreenUnavailable title={errorTitleFor('detail')} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (resource.status === 'error' || !flow) {
    return (
      <ScreenError
        title={errorTitleFor('detail')}
        onRetry={() => resource.reload()}
        body={busyBody(resource)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const recipients = answered ?? resource.data.recipients;
  const { people, extra, canEdit } = recipients;
  const writing = adding || removing !== null;

  /** Send the whole list; show the platform's answer, or say it was not saved and keep the list. */
  const save = async (next: string[]): Promise<boolean> => {
    const workspaceId = workspaceIfShown(session, resource.loadedFor);
    if (!workspaceId) {
      setError(WORKSPACE_CHANGED);
      return false;
    }
    try {
      setAnswered(await updateFlowEmailRecipients(workspaceId, flow, next));
      return true;
    } catch {
      setError(EMAIL_SAVE_FAILED);
      return false;
    }
  };

  const add = async () => {
    if (writing) return;
    const problem = addProblem(draft, recipients);
    if (problem) {
      setError(problem === 'invalid' ? EMAIL_INVALID : EMAIL_DUPLICATE);
      return;
    }
    setAdding(true);
    setError(null);
    try {
      if (await save([...extra, draft.trim()])) setDraft('');
    } finally {
      setAdding(false);
    }
  };

  const remove = async (address: string) => {
    if (writing) return;
    setRemoving(address);
    setError(null);
    try {
      await save(extra.filter((listed) => listed !== address));
    } finally {
      setRemoving(null);
    }
  };

  const full = extra.length >= EMAIL_EXTRA_LIMIT;
  const lineStyle = [styles.line, { color: palette.neutral[400] }];

  return (
    <ScrollView
      testID="email-screen"
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      keyboardShouldPersistTaps="handled"
      // The field sits under the lists, below where the keyboard opens on a phone
      // once a few addresses are listed: the page makes room for the keyboard and
      // brings the field into view, so what is typed is seen (the Build 22 review).
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>{EMAIL_TITLE}</Text>
          {resource.data.name ? (
            <Text style={[styles.subtitle, { color: palette.neutral[400] }]}>{vendorFor(resource.data.name)}</Text>
          ) : null}
        </View>
      </View>

      <View testID="email-always">
        <SectionLabel>{EMAIL_ALWAYS_LABEL}</SectionLabel>
        <SurfaceCard style={styles.underLabel}>
          {people.map((person) => (
            <ConnectionRow
              key={person.email}
              testID={`email-person-${person.email}`}
              mark={<GlyphMark icon={UserCircle} />}
              name={person.email}
              line={EMAIL_ROLE[person.role]}
              divider
            />
          ))}
          <ConnectionRow testID="email-starter" mark={<GlyphMark icon={UserCircle} />} name={EMAIL_STARTER} />
        </SurfaceCard>
      </View>

      <View testID="email-also">
        <SectionLabel>{EMAIL_ALSO_LABEL}</SectionLabel>
        <SurfaceCard style={styles.underLabel}>
          {extra.length === 0 ? <ConnectionRow testID="email-extra-none" mark={<NoneMark />} name={NONE_LABEL} /> : null}
          {extra.map((address, index) => (
            <ConnectionRow
              key={address}
              testID={`email-extra-${address}`}
              mark={<GlyphMark icon={EnvelopeSimple} />}
              name={address}
              line={removing === address ? EMAIL_REMOVING : null}
              divider={index < extra.length - 1}
              right={
                canEdit ? (
                  <Pressable
                    testID={`email-remove-${address}`}
                    accessibilityRole="button"
                    accessibilityLabel={removeAddress(address)}
                    accessibilityState={writing ? { disabled: true } : undefined}
                    disabled={writing}
                    hitSlop={8}
                    onPress={() => void remove(address)}
                    style={({ pressed }) => [
                      styles.remove,
                      pressed && !writing && { backgroundColor: withAlpha(palette.text, 0.07) },
                    ]}>
                    <X size={iconSize.button} color={palette.neutral[400]} />
                  </Pressable>
                ) : null
              }
            />
          ))}
        </SurfaceCard>
        {canEdit ? (
          full ? (
            <Text testID="email-limit" style={lineStyle}>
              {EMAIL_LIMIT_REACHED}
            </Text>
          ) : (
            <View style={styles.addRow}>
              <TextInput
                testID="email-input"
                // Said aloud once it holds an address too, when its placeholder is gone (the website's label).
                accessibilityLabel={EMAIL_PLACEHOLDER}
                value={draft}
                onChangeText={(text) => {
                  setDraft(text);
                  setError(null);
                }}
                onSubmitEditing={() => void add()}
                placeholder={EMAIL_PLACEHOLDER}
                placeholderTextColor={palette.neutral[500]}
                selectionColor={palette.accent}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                editable={!adding}
                style={[
                  styles.input,
                  {
                    color: palette.text,
                    borderColor: palette.neutral[800],
                    backgroundColor: withAlpha(palette.surface, 0.6),
                  },
                ]}
              />
              <PillButton
                testID="email-add"
                label={adding ? EMAIL_ADDING : EMAIL_ADD}
                variant="primary"
                height={44}
                fontSize={typeScale.label.fontSize}
                icon={Plus}
                iconSize={iconSize.button}
                disabled={writing}
                onPress={() => void add()}
                style={styles.addButton}
              />
            </View>
          )
        ) : (
          <Text testID="email-ask-admin" style={lineStyle}>
            {EMAIL_ASK_ADMIN}
          </Text>
        )}
        {error ? (
          <Text testID="email-error" accessibilityRole="alert" style={[styles.line, { color: status.err }]}>
            {error}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: 24, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1 },
  title: {
    fontFamily: fonts.medium,
    fontSize: typeScale.heading.fontSize,
    letterSpacing: em(-0.01, typeScale.heading.fontSize),
  },
  subtitle: { marginTop: 1, fontFamily: fonts.regular, fontSize: typeScale.small.fontSize },
  underLabel: { marginTop: 9 },
  remove: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    height: 44,
    borderRadius: radius.input,
    borderWidth: 1,
    paddingHorizontal: 13,
    fontFamily: fonts.regular,
    fontSize: typeScale.label.fontSize,
  },
  addButton: { paddingHorizontal: 16 },
  line: { marginTop: 10, fontFamily: fonts.regular, ...typeScale.small },
});
