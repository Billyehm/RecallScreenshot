import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useTheme } from "../../../shared/theme/ThemeContext";

type SettingsRowProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle: string;
  /** Right-hand text for read-only rows, e.g. a size or a count. */
  value?: string;
  onPress?: () => void;
  /** Renders the row in the warning colour and gives it a chevron-free hit area. */
  destructive?: boolean;
  busy?: boolean;
  disabled?: boolean;
};

/**
 * One line in a settings group.
 *
 * Pressable rows get a chevron and read-only rows do not, so whether a line does something is
 * visible before it is tapped rather than after.
 */
export function SettingsRow({
  icon,
  title,
  subtitle,
  value,
  onPress,
  destructive = false,
  busy = false,
  disabled = false
}: SettingsRowProps) {
  const { colors, styles } = useTheme();
  const accent = destructive ? colors.tertiary : colors.primary;
  const isInert = !onPress || disabled || busy;

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={{ disabled: isInert }}
      disabled={isInert}
      onPress={onPress}
      style={({ pressed }) => [styles.settingsRow, pressed && styles.settingsRowPressed, disabled && styles.buttonDisabled]}
    >
      <View style={[styles.settingsRowIcon, destructive && styles.settingsRowIconDanger]}>
        <Ionicons name={icon} size={19} color={accent} />
      </View>
      <View style={styles.flexOne}>
        <Text style={[styles.settingsRowTitle, destructive && styles.settingsRowTitleDanger]}>{title}</Text>
        <Text style={styles.bodyMuted}>{subtitle}</Text>
      </View>
      {busy ? <ActivityIndicator color={accent} size="small" /> : null}
      {!busy && value ? <Text style={styles.settingsRowValue}>{value}</Text> : null}
      {!busy && onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
    </Pressable>
  );
}

type SettingsGroupProps = {
  title: string;
  caption?: string;
  children: React.ReactNode;
};

/** A titled block of rows. The caption carries the promise the group is making, not decoration. */
export function SettingsGroup({ title, caption, children }: SettingsGroupProps) {
  const { styles } = useTheme();

  return (
    <View style={styles.settingsGroup}>
      <Text style={styles.filterSectionLabel}>{title}</Text>
      {caption ? <Text style={styles.bodyMuted}>{caption}</Text> : null}
      <View style={styles.settingsCard}>{children}</View>
    </View>
  );
}

type SettingsSwitchRowProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: () => void;
  busy?: boolean;
};

/** A row whose whole surface toggles, so the switch is not the only 44dp target on the line. */
export function SettingsSwitchRow({ icon, title, subtitle, value, onToggle, busy = false }: SettingsSwitchRowProps) {
  const { colors, styles } = useTheme();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: busy }}
      disabled={busy}
      onPress={onToggle}
      style={({ pressed }) => [styles.settingsRow, pressed && styles.settingsRowPressed]}
    >
      <View style={styles.settingsRowIcon}>
        <Ionicons name={icon} size={19} color={colors.primary} />
      </View>
      <View style={styles.flexOne}>
        <Text style={styles.settingsRowTitle}>{title}</Text>
        <Text style={styles.bodyMuted}>{subtitle}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.primary} size="small" />
      ) : (
        <View style={[styles.toggleTrack, value && styles.toggleTrackActive]}>
          <View style={[styles.toggleKnob, value && styles.toggleKnobActive]} />
        </View>
      )}
    </Pressable>
  );
}
