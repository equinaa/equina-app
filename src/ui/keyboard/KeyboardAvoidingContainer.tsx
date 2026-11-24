import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { createKeyboardAvoider } from "./keyboard-avoidance";

type KeyboardAvoidingContainerProps = {
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** iOS only, as before. Android measures the view itself. */
  keyboardVerticalOffset?: number;
  children: ReactNode;
};

/**
 * Keeps the bottom of a screen or sheet above the keyboard.
 *
 * iOS and the web render exactly what every screen rendered before: React
 * Native's KeyboardAvoidingView with the same props, "padding" on iOS and no
 * behavior on the web. Only Android takes the other path (keyboard-avoidance.ts
 * says why).
 */
export function KeyboardAvoidingContainer({ children, ...rest }: KeyboardAvoidingContainerProps) {
  if (Platform.OS === "android") {
    return (
      <AndroidKeyboardAvoidingView style={rest.style} testID={rest.testID}>
        {children}
      </AndroidKeyboardAvoidingView>
    );
  }
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} {...rest}>
      {children}
    </KeyboardAvoidingView>
  );
}

function AndroidKeyboardAvoidingView({
  style,
  testID,
  children
}: {
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: ReactNode;
}) {
  const viewRef = useRef<View>(null);
  const [padding, setPadding] = useState(0);
  const avoider = useMemo(
    () =>
      createKeyboardAvoider(
        // measure, not measureInWindow: in React Native 0.83 measureInWindow
        // adds the root's viewport offset, which edge to edge is minus the
        // status bar in the main window and nothing inside a Modal. pageY is
        // measured from the root view, which edge to edge starts at the top of
        // the screen in both, like the keyboard's screenY.
        (done) =>
          viewRef.current?.measure((_x, _y, _width, height, _pageX, pageY) => done({ y: pageY, height })),
        setPadding
      ),
    []
  );

  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", (event) => avoider.show(event.endCoordinates.screenY));
    const hidden = Keyboard.addListener("keyboardDidHide", () => avoider.hide());
    // Mounted with the keyboard already open.
    const open = Keyboard.isVisible() ? Keyboard.metrics() : undefined;
    if (open) avoider.show(open.screenY);
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [avoider]);

  return (
    <View
      ref={viewRef}
      testID={testID}
      onLayout={() => avoider.layout()}
      style={padding > 0 ? [style, { paddingBottom: padding }] : style}
    >
      {children}
    </View>
  );
}
