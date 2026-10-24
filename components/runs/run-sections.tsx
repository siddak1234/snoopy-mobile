import { CaretDown } from 'phosphor-react-native';
import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { SurfaceCard } from '@/components/nocturne/surface-card';
import { Pressable, pressed } from '@/components/pressable';
import { Text } from '@/components/text';
import { fonts, iconSize, typeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { RunSection } from '@/lib/platform/automations';

/** Whether an address may be opened: `http:` or `https:` only, as the platform stores no other. */
export function opensOutside(url: string | undefined): url is string {
  return typeof url === 'string' && /^https?:\/\//iu.test(url);
}

/**
 * What a run read, as its automation wrote it for people (backend ADR-0046;
 * Round 19, plan §5.4): titled sections, each a row that
 * opens and closes in place, as a document card does. An entry is its title in
 * bold, its subtitle muted, its text, and its address as a link that opens
 * outside the app (http and https only). `firstOpen`: the run page opens the
 * first; the item page's "What AI read" opens none.
 */
export function RunSections({
  sections,
  firstOpen,
  testID,
}: {
  sections: readonly RunSection[];
  firstOpen: boolean;
  testID: string;
}) {
  const { palette } = useTheme();
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set(firstOpen ? [0] : []));
  const toggle = (index: number) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  return (
    <View testID={testID}>
      <SurfaceCard>
        {sections.map((section, index) => {
          const shown = open.has(index);
          return (
            <View
              key={`${section.title}-${index}`}
              style={index < sections.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.divider }}>
              <Pressable
                testID={`${testID}-${index}`}
                accessibilityRole="button"
                accessibilityState={{ expanded: shown }}
                accessibilityLabel={section.title}
                onPress={() => toggle(index)}
                style={({ pressed: down }) => [styles.toggle, down && { opacity: 0.7 }]}>
                <Text style={[styles.title, { color: palette.text }]}>{section.title}</Text>
                <CaretDown
                  size={iconSize.button}
                  color={palette.neutral[400]}
                  style={{ transform: [{ rotate: shown ? '180deg' : '0deg' }] }}
                />
              </Pressable>
              {shown ? (
                <View testID={`${testID}-${index}-body`} style={styles.body}>
                  {section.entries.map((entry, at) => (
                    <View key={`${entry.title}-${at}`} style={styles.entry}>
                      <Text selectable style={[styles.entryTitle, { color: palette.text }]}>
                        {entry.title}
                      </Text>
                      {entry.subtitle ? (
                        <Text style={[styles.small, { color: palette.neutral[400] }]}>{entry.subtitle}</Text>
                      ) : null}
                      {entry.text ? (
                        <Text selectable style={[styles.text, { color: palette.text }]}>
                          {entry.text}
                        </Text>
                      ) : null}
                      {opensOutside(entry.url) ? (
                        <Text
                          testID={`${testID}-${index}-link-${at}`}
                          accessibilityRole="link"
                          onPress={pressed(() => void Linking.openURL(entry.url!))}
                          suppressHighlighting
                          style={[styles.small, { color: palette.accentRamp[300] }]}>
                          {entry.url}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </SurfaceCard>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  title: { flex: 1, fontFamily: fonts.medium, ...typeScale.label },
  body: { gap: 12, paddingHorizontal: 14, paddingBottom: 14 },
  entry: { gap: 2 },
  entryTitle: { fontFamily: fonts.medium, ...typeScale.body },
  text: { fontFamily: fonts.regular, ...typeScale.body },
  small: { fontFamily: fonts.regular, ...typeScale.small },
});
