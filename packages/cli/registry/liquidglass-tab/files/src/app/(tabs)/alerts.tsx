import { TabScreenFromConfig } from '@/components/TabScreen';

export default function AlertsScreen() {
  // The button is pinned with useTabBarInset(), so it clears the floating bar on every OS.
  return <TabScreenFromConfig tabName="alerts" action="Mark all as read" />;
}
