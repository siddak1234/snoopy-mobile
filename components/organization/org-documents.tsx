import { useRouter } from 'expo-router';
import { CaretRight, FileText } from 'phosphor-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SectionTitle } from '@/components/nocturne/section-label';
import { SurfaceCard } from '@/components/nocturne/surface-card';
import { SettingsRow } from '@/components/settings/settings-row';
import { Text } from '@/components/text';
import { fonts, space, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DOCUMENTS_LABEL, NO_DOCUMENTS, acceptedBy, documentTitle } from '@/lib/content/health-agreement';
import type { WorkspaceDocument } from '@/lib/platform/agreements';
import { calendarDate } from '@/lib/view/format';

/**
 * The organization's DOCUMENTS (Round 21 stage 2, C3; backend ADR-0049) — the
 * website's "Documents" beside Members: a row for each signed health data
 * agreement, newest first as the platform lists them (one read when the screen
 * opens, at most 50): "Business Associate Agreement · Version {n}", and under
 * it "Accepted by {name} on {date}". A row opens its read-only copy
 * (`/(tabs)/settings/documents`), read only then. None: "No documents yet." A
 * kind this build has no name for is not drawn: the health data agreement is
 * the only kind today.
 */
export function OrgDocuments({ documents }: { documents: readonly WorkspaceDocument[] }) {
  const router = useRouter();
  const { palette } = useTheme();
  const named = documents.filter((signed) => signed.kind === 'health-data');
  return (
    <View testID="organization-documents">
      <SectionTitle>{DOCUMENTS_LABEL}</SectionTitle>
      <SurfaceCard style={named.length === 0 ? styles.empty : undefined}>
        {named.length === 0 ? (
          <Text style={[styles.text, { color: palette.neutral[400] }]}>{NO_DOCUMENTS}</Text>
        ) : (
          named.map((signed, index) => (
            <SettingsRow
              key={signed.id}
              icon={FileText}
              title={documentTitle(signed.version)}
              sub={acceptedBy(signed.signerName, calendarDate(signed.acceptedAt))}
              testID={`document-${signed.id}`}
              divider={index < named.length - 1}
              onPress={() => router.push({ pathname: '/(tabs)/settings/documents', params: { document: signed.id } })}
              right={<CaretRight size={15} color={palette.neutral[500]} />}
            />
          ))
        )}
      </SurfaceCard>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { padding: space.card },
  text: { fontFamily: fonts.regular, ...typeScale.body },
});
