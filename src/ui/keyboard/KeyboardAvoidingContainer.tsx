import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  View,
  type LayoutAnimationType,
  type StyleProp,
  type ViewStyle
} from "react-native";
import {
  androidKeyboardEvents,
  createKeyboardAvoider,
  followKeyboard,
  iosKeyboardEvents,
  keyboardLayoutAnimation,
  type KeyboardEventLike,
  type KeyboardEvents
} from "./keyboard-avoidance";

type KeyboardAvoidingContainerProps = {
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: ReactNode;
};

/**
 * Keeps the bottom of a screen or sheet above the keyboard.
 *
 * iOS and Android measure where the view ends on screen and pad it by the
 * part the keyboard covers (keyboard-avoidance.ts says why React Native's
 * KeyboardAvoidingView falls short on both). The web renders what every
 * screen rendered before: KeyboardAvoidingView with no behavior.
 */
export function KeyboardAvoidingContainer({ children, style, testID }: KeyboardAvoidingContainerProps) {
  if (Platform.OS === "ios" || Platform.OS === "android") {
    return (
      <MeasuredKeyboardAvoidingView
        style={style}
        testID={testID}
        events={Platform.OS === "ios" ? iosKeyboardEvents : androidKeyboardEvents}
        animate={Platform.OS === "ios"}
      >
        {children}
      </MeasuredKeyboardAvoidingView>
    );
  }
  return (
    <KeyboardAvoidingView style={style} testID={testID}>
      {children}
    </KeyboardAvoidingView>
  );
}

function MeasuredKeyboardAvoidingView({
  style,
  testID,
  events,
  animate,
  children
}: {
  style?: StyleProp<ViewStyle>;
  testID?: string;
  events: KeyboardEvents;
  /** iOS: move the content with the keyboard, as KeyboardAvoidingView did. */
  animate: boolean;
  children: ReactNode;
}) {
  const viewRef = useRef<View>(null);
  // The keyboard event whose padding change is still to come, for its timing.
  const keyboardEvent = useRef<KeyboardEventLike | null>(null);
  const [padding, setPadding] = useState(0);
  const avoider = useMemo(
    () =>
      createKeyboardAvoider(
        // measure, not measureInWindow: in React Native 0.83 measureInWindow
        // adds the root's viewport offset on Android, which edge to edge is
        // minus the status bar in the main window and nothing inside a Modal.
        // pageY is measured from the root view, which on both platforms starts
        // at the top of the screen, in a Modal too, like the keyboard's screenY.
        (done) =>
          viewRef.current?.measure((_x, _y, _width, height, _pageX, pageY) => done({ y: pageY, height })),
        (next) => {
          const animation = animate ? keyboardLayoutAnimation(keyboardEvent.current) : null;
          keyboardEvent.current = null;
          if (animation) {
            const type = animation.update.type as LayoutAnimationType;
            LayoutAnimation.configureNext({
              duration: animation.duration,
              update: { duration: animation.update.duration, type: LayoutAnimation.Types[type] ?? LayoutAnimation.Types.keyboard }
            });
          }
          setPadding(next);
        }
      ),
    [animate]
  );

  useEffect(
    () => followKeyboard(Keyboard, avoider, events, (event) => {
      keyboardEvent.current = event;
    }),
    [avoider, events]
  );

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
