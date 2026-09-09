import { Children, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { equinaTheme } from "../theme/theme";

export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <View style={styles.wrapper}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={styles.group}>
        {rows.map((row, index) => (
          <View key={index}>
            {row}
            {index < rows.length - 1 ? <View style={styles.separator} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8
  },
  title: {
    color: equinaTheme.text.tertiary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    textTransform: "uppercase"
  },
  group: {
    overflow: "hidden",
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.surfaces.raised
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 48,
    backgroundColor: equinaTheme.material.separator
  }
});
