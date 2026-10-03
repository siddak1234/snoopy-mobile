import { useRouter } from 'expo-router';
import { FileText, ShieldCheck } from 'phosphor-react-native';
import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackCircle } from '@/components/nocturne/back-circle';
import { PillButton } from '@/components/nocturne/pill-button';
import { SectionLabel } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { TextField } from '@/components/nocturne/text-field';
import { SettingsRow } from '@/components/settings/settings-row';
import { em, fonts, layout, status, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { refusalMessage } from '@/lib/content/refusals';
import { websiteOrigin } from '@/lib/platform/native-auth';
import { sendContactRequest, type ContactRequest } from '@/lib/platform/support';

const FIELDS: readonly { key: keyof ContactRequest; label: string; placeholder: string }[] = [
  { key: 'industry', label: 'Your industry and team function', placeholder: 'Healthcare, patient intake' },
  { key: 'workflow', label: 'The workflow you want to automate', placeholder: 'Invoices arrive by email, keyed into the ERP' },
  { key: 'tools', label: 'Current tools involved', placeholder: 'CRM, ticketing, internal tools' },
  { key: 'volume', label: 'Volume / frequency', placeholder: '400 invoices a month' },
  { key: 'email', label: 'Your email', placeholder: 'you@company.com' },
  { key: 'success', label: 'What success looks like in 60 days', placeholder: 'Zero manual keying' },
];

/**
 * Settings → Support (BUILD-PLAN 24.6.4) — the website's contact form, on the
 * same public operation and in its words, and the Privacy and Terms pages,
 * opened on the website rather than copied into the app.
 */
export default function SupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const [values, setValues] = useState<Partial<ContactRequest>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const site = websiteOrigin();

  const send = async () => {
    if (busy) return;
    const email = values.email?.trim() ?? '';
    // The website's form requires these two; the platform requires the email.
    if (!values.workflow?.trim() || !email) {
      setError('Add the workflow you want to automate, and your email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: ContactRequest = { email };
      for (const field of FIELDS) {
        const value = values[field.key]?.trim();
        if (value && field.key !== 'email') body[field.key] = value;
      }
      await sendContactRequest(body);
      setSent(true);
    } catch (caught) {
      setError(refusalMessage(caught, {}, 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const muted = { color: palette.neutral[400] };
  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + (layout.designTop.app - layout.statusArea) }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <BackCircle onPress={() => router.back()} />
        <Text style={[styles.title, { color: palette.text }]}>Support</Text>
      </View>

      <View>
        <SectionLabel>CONTACT US</SectionLabel>
        <SurfaceCard style={[styles.card, styles.pad]}>
          {sent ? (
            <Text style={[styles.text, { color: palette.text }]}>
              Thanks — we&apos;ve got it. We review every workflow and reply within two business days.
            </Text>
          ) : (
            <>
              {FIELDS.map((field) => (
                <TextField
                  key={field.key}
                  label={field.label}
                  value={values[field.key] ?? ''}
                  onChangeText={(next) => setValues((current) => ({ ...current, [field.key]: next }))}
                  placeholder={field.placeholder}
                  {...(field.key === 'email' ? { keyboardType: 'email-address' as const, autoComplete: 'email' as const } : {})}
                />
              ))}
              {error ? <Text style={[styles.text, { color: status.err }]}>{error}</Text> : null}
              <PillButton label={busy ? 'Sending…' : 'Send'} variant="primary" height={46} disabled={busy} onPress={send} />
            </>
          )}
        </SurfaceCard>
      </View>

      <View>
        <SectionLabel>LEGAL</SectionLabel>
        <SurfaceCard style={styles.card}>
          {site ? (
            <>
              <SettingsRow icon={ShieldCheck} title="Privacy policy" divider testID="support-privacy" onPress={() => void Linking.openURL(`${site}/privacy`)} right={null} />
              <SettingsRow icon={FileText} title="Terms of service" testID="support-terms" onPress={() => void Linking.openURL(`${site}/terms`)} right={null} />
            </>
          ) : (
            <Text style={[styles.text, styles.pad, muted]}>The website is not configured in this build.</Text>
          )}
        </SurfaceCard>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingBottom: 32, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: fonts.medium, fontSize: typeScale.heading.fontSize, letterSpacing: em(-0.01, typeScale.heading.fontSize) },
  card: { marginTop: 9 },
  pad: { padding: 14, gap: 12 },
  text: { fontFamily: fonts.regular, ...typeScale.body },
});
