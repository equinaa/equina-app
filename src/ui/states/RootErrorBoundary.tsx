import { Component, Fragment, type ReactNode } from "react";
import { Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { equinaTheme } from "../theme/theme";
import { installedVersionLine } from "./installed-version";
import { errorDetailLine, failedAgain, rootErrorCopy as copy } from "./root-error";

type Failure = { error: unknown; at: number };
type State = {
  failure: Failure | null;
  /** When "Try again" was last pressed, to tell a repeat from a new failure. */
  retriedAt: number | null;
  /** Bumped by "Try again": the app under it mounts as new, with no state kept. */
  generation: number;
};

/**
 * The last line of defence around the whole app. Without it a release build
 * closes on any error thrown while drawing, and nobody learns why.
 *
 * It hides nothing in development: React reports an error a boundary caught
 * like any other, and React Native opens it in the full-screen red box. This
 * screen is what is underneath once the box is dismissed.
 *
 * Nothing here retries by itself. "Try again" is the only way back in, so an
 * error that repeats shows this screen again and stops there.
 *
 * Only React, React Native, the theme and two plain modules are imported: the
 * screen shown when something broke must not depend on what may have broken.
 */
export class RootErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failure: null, retriedAt: null, generation: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { failure: { error, at: Date.now() } };
  }

  private retry = () => {
    this.setState((previous) => ({
      failure: null,
      retriedAt: Date.now(),
      generation: previous.generation + 1
    }));
  };

  render() {
    const { failure, retriedAt, generation } = this.state;
    if (!failure) return <Fragment key={generation}>{this.props.children}</Fragment>;
    return (
      <RootErrorScreen
        repeated={failedAgain(failure.at, retriedAt)}
        detail={errorDetailLine(failure.error)}
        onRetry={this.retry}
      />
    );
  }
}

function RootErrorScreen({
  repeated,
  detail,
  onRetry
}: {
  repeated: boolean;
  detail: string;
  onRetry: () => void;
}) {
  return (
    <View testID="root-error" style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={styles.message}>
        <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
        <Text accessibilityRole="alert" style={styles.body}>{repeated ? copy.repeatBody : copy.body}</Text>
        <Pressable
          testID="root-error-retry"
          accessibilityRole="button"
          accessibilityLabel={copy.retry}
          onPress={onRetry}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>{copy.retry}</Text>
        </Pressable>
      </View>
      <View style={styles.footer}>
        {installedVersionLine ? <Text selectable style={styles.meta}>{installedVersionLine}</Text> : null}
        {detail ? <Text selectable numberOfLines={3} style={styles.meta}>{detail}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: equinaTheme.surfaces.canvas,
    paddingHorizontal: 28,
    // No safe-area provider is above this screen. The message sits in the
    // middle, and the footer keeps clear of the home indicator by its own margin.
    paddingTop: 64,
    paddingBottom: 48
  },
  message: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12
  },
  title: {
    ...equinaTheme.typography.title,
    color: equinaTheme.text.primary,
    textAlign: "center"
  },
  body: {
    color: equinaTheme.text.secondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
    textAlign: "center",
    maxWidth: 320
  },
  button: {
    minHeight: 56,
    minWidth: 200,
    marginTop: 12,
    paddingHorizontal: 24,
    borderRadius: equinaTheme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.brass
  },
  buttonPressed: {
    opacity: 0.85
  },
  buttonText: {
    color: equinaTheme.colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600"
  },
  footer: {
    alignItems: "center",
    gap: 4
  },
  meta: {
    color: equinaTheme.text.tertiary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    textAlign: "center"
  }
});
