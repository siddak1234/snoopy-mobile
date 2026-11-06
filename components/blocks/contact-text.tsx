import * as Clipboard from 'expo-clipboard';
import { presentFormAsync, type Contact } from 'expo-contacts/legacy';
import React, { useState } from 'react';
import { Linking, Platform, type StyleProp, type TextStyle } from 'react-native';

import { Dialog, DialogButton } from '@/components/dialog';
import { pressed } from '@/components/pressable';
import { Text } from '@/components/text';
import { useTheme } from '@/hooks/use-theme';
import {
  CONTACT_CALL,
  CONTACT_CANCEL,
  CONTACT_COPY,
  CONTACT_EMAIL,
  CONTACT_MESSAGE,
} from '@/lib/content/screen-states';
import { dialable, type ContactValue } from '@/lib/view/contact-value';

/**
 * Apple's own card for a phone number or email the person did not save yet:
 * `presentFormAsync` from `expo-contacts/legacy` with no id and the value
 * filled (node_modules/expo-contacts/ios/ContactsModule.swift, "presentFormAsync":
 * no id and `isNew` unset → `ContactsViewController.init(forUnknownContact:)`;
 * `allowsActions` keeps its call, message, FaceTime and mail buttons, and its
 * `contactStore` set offers Create New Contact and Add to Existing Contact).
 * The SDK 57 `presentFormAsync` from "expo-contacts" throws at runtime
 * (its `legacyWarnings`); the legacy import is the one the docs name.
 */
export function unknownContact(contact: ContactValue): Contact {
  return {
    contactType: 'person',
    // No name is known: the card is titled by the value.
    name: '',
    // An empty label is the native default (`decodeLabel`, ios/Serialization.swift).
    ...(contact.kind === 'phone'
      ? { phoneNumbers: [{ label: '', number: contact.value }] }
      : { emails: [{ label: '', email: contact.value }] }),
  };
}

/**
 * A row's text that is one phone number or one email (`contactValue`; the
 * owner's build 39 item 11: "For number when i click or email it should pop up
 * the call or save contact apple card thing"), drawn as a link: a tap opens
 * Apple's card on iOS (`unknownContact`). Where it cannot — Android, or the card
 * failed — a sheet (`Dialog`) titled by the value: a number's Call (`tel:`),
 * Message (`sms:`) and Copy, an email's Email (`mailto:`) and Copy, then
 * Cancel. Copy puts the value on the clipboard (`expo-clipboard`'s
 * `setStringAsync`).
 *
 * testIDs: the text `${testID}`, the sheet `${testID}-sheet`, its buttons
 * `${testID}-call`, `-message`, `-email`, `-copy`, `-cancel`.
 */
export function ContactText({
  contact,
  testID,
  style,
}: {
  contact: ContactValue;
  testID: string;
  style?: StyleProp<TextStyle>;
}) {
  const { palette } = useTheme();
  const [sheet, setSheet] = useState(false);
  const open = async () => {
    if (Platform.OS !== 'ios') {
      setSheet(true);
      return;
    }
    try {
      await presentFormAsync(null, unknownContact(contact), { allowsActions: true });
    } catch {
      setSheet(true);
    }
  };
  const act = (run: () => Promise<unknown>) => () => {
    setSheet(false);
    void run().catch(() => undefined);
  };
  const phone = contact.kind === 'phone';
  return (
    <>
      <Text
        testID={testID}
        accessibilityRole="link"
        onPress={pressed(() => void open())}
        suppressHighlighting
        style={[style, { color: palette.accentRamp[300] }]}>
        {contact.value}
      </Text>
      <Dialog
        visible={sheet}
        testID={`${testID}-sheet`}
        onRequestClose={() => setSheet(false)}
        title={contact.value}
        actionsLayout="stack"
        actions={
          <>
            {phone ? (
              <>
                <DialogButton
                  testID={`${testID}-call`}
                  label={CONTACT_CALL}
                  tone="accent"
                  onPress={act(() => Linking.openURL(`tel:${dialable(contact.value)}`))}
                />
                <DialogButton
                  testID={`${testID}-message`}
                  label={CONTACT_MESSAGE}
                  onPress={act(() => Linking.openURL(`sms:${dialable(contact.value)}`))}
                />
              </>
            ) : (
              <DialogButton
                testID={`${testID}-email`}
                label={CONTACT_EMAIL}
                tone="accent"
                onPress={act(() => Linking.openURL(`mailto:${contact.value}`))}
              />
            )}
            <DialogButton
              testID={`${testID}-copy`}
              label={CONTACT_COPY}
              onPress={act(() => Clipboard.setStringAsync(contact.value))}
            />
            <DialogButton testID={`${testID}-cancel`} label={CONTACT_CANCEL} onPress={() => setSheet(false)} />
          </>
        }
      />
    </>
  );
}
