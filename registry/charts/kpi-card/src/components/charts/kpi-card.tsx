import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Sparkline, useChartTheme } from "expo-charts";

export interface KpiCardProps {
  label: string;
  value: string;
  /** Percentage change, e.g. 12.4 or -3.1. */
  delta?: number;
  /** Recent values for the sparkline (oldest first). */
  trend?: number[];
  style?: StyleProp<ViewStyle>;
}

/** Big number + trend badge + sparkline. Colours follow <ChartProvider>. */
export function KpiCard({ label, value, delta, trend, style }: KpiCardProps) {
  const theme = useChartTheme();
  const up = (delta ?? 0) >= 0;
  const tone = up ? theme.positive : theme.negative;
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, style]}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.mutedForeground }]}>{label}</Text>
        {delta !== undefined ? (
          <View style={[styles.badge, { borderColor: tone }]}>
            <Text style={[styles.badgeText, { color: tone }]}>
              {up ? "+" : ""}
              {delta.toFixed(1)}%
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.value, { color: theme.foreground }]}>{value}</Text>
      {trend && trend.length > 1 ? <Sparkline data={trend} height={40} color={tone} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 6 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontSize: 13, fontWeight: "400" },
  badge: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: "400", fontVariant: ["tabular-nums"] },
  value: { fontSize: 28, fontWeight: "400", letterSpacing: -0.5, fontVariant: ["tabular-nums"] },
});
