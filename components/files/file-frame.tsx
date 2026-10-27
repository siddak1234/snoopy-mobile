import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * A saved file drawn in place (build 28's review, finding 5): a WebView with
 * no JavaScript, given only `file://` addresses, that may read the folder the
 * file was saved in and nothing else (`allowingReadAccessToURL`). The file
 * page (`FileView`) and a picture's scanned page (`components/blocks/image.tsx`,
 * Round 21) draw their files with it, so both keep the same settings.
 */
export function FileFrame({
  uri,
  testID,
  accessibilityLabel,
  style,
}: {
  uri: string;
  testID: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <WebView
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      source={{ uri }}
      originWhitelist={['file://*']}
      allowFileAccess
      javaScriptEnabled={false}
      // iOS reads the file from the folder made for this view, and nothing else.
      allowingReadAccessToURL={uri.slice(0, uri.lastIndexOf('/') + 1)}
      style={style}
    />
  );
}
