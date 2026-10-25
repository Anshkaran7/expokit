import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// Navigation themes: from 'expo-router' on SDK 56+ (it ships its own copy, so the
// @react-navigation/native ThemeProvider would do nothing there), '@react-navigation/native' on SDK 54–55.
import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const isDark = useColorScheme() === 'dark';

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
          <Slot />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
