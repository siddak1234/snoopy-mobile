import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Page } from '@/components/page';
import { PageHeader } from '@/components/page-header';
import { ScreenError, ScreenLoading, ScreenOffline, ScreenUnavailable } from '@/components/screen-state';
import { Text } from '@/components/text';
import { fonts, space, typeScale } from '@/constants/theme';
import { busyBody, useWorkspaceResource } from '@/hooks/use-resource';
import { useTheme } from '@/hooks/use-theme';
import { acceptedBy, documentTitle } from '@/lib/content/health-agreement';
import { errorTitleFor } from '@/lib/content/screen-states';
import { readWorkspaceDocument } from '@/lib/platform/agreements';
import { PlatformNotConfiguredError } from '@/lib/platform/problem';
import { calendarDate } from '@/lib/view/format';

/**
 * One signed document, read only (Round 21 stage 2, C3; backend ADR-0049) —
 * the website's page for one copy: opened from a row of the organization's
 * DOCUMENTS (`document`), and read only then (`GET …/documents/{documentId}`).
 * Its title and "Accepted by {name} on {date}" as its row says them, then the
 * signed copy: the agreement as accepted, with the organization and the day
 * filled in and its signature section. Nothing to change. A kind this build
 * has no name for is not drawn, as the list draws none.
 */
export default function DocumentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { document } = useLocalSearchParams<{ document?: string }>();

  const resource = useWorkspaceResource(
    async (workspaceId) => {
      if (!document) throw new PlatformNotConfiguredError();
      return readWorkspaceDocument(workspaceId, document);
    },
    [document],
  );

  if (resource.status === 'loading') return <ScreenLoading topInset={insets.top} />;
  if (resource.status === 'offline') {
    return <ScreenOffline onRetry={() => resource.reload()} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (resource.status === 'unconfigured' || (resource.status === 'ready' && resource.data.kind !== 'health-data')) {
    return <ScreenUnavailable title={errorTitleFor(undefined)} onBack={() => router.back()} topInset={insets.top} />;
  }
  if (resource.status === 'error') {
    return (
      <ScreenError
        title={errorTitleFor(undefined)}
        onRetry={() => resource.reload()}
        body={busyBody(resource)}
        onBack={() => router.back()}
        topInset={insets.top}
      />
    );
  }

  const copy = resource.data;
  return (
    <Page testID="document-screen">
      <PageHeader
        onBack={() => router.back()}
        title={documentTitle(copy.version)}
        subtitle={acceptedBy(copy.signerName, calendarDate(copy.acceptedAt))}
        subtitleTestID="document-accepted"
      />
      <SurfaceCard style={styles.note}>
        <Text testID="document-text" style={[styles.text, { color: palette.text }]}>
          {copy.text}
        </Text>
      </SurfaceCard>
    </Page>
  );
}

const styles = StyleSheet.create({
  note: { padding: space.card },
  text: { fontFamily: fonts.regular, ...typeScale.body },
});
