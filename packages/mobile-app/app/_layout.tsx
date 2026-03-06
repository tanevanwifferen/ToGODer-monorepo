import '../polyfills';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { getShareUrl } from '../constants/Env';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { store, persistor } from '../redux/store';
import { QueryProvider } from '../components/providers/QueryProvider';
import { ExperienceProvider } from '../components/providers/ExperienceProvider';
import { RouteProvider } from '../components/providers/RouteProvider';
import { useColorScheme } from '../hooks/useColorScheme';
import { useInitialization } from '../hooks/useInitialization';
import { useInitialize } from '../hooks/useInitialize';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Component to handle initialization after RouteProvider is mounted
function InitializationWrapper({ children }: { children: React.ReactNode }) {
  useInitialization();
  return <>{children}</>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    MaterialIcons: require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf"),
    Feather: require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ttf"),
    AntDesign: require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/AntDesign.ttf"),
  });

  const _init = useInitialize();

  // Handle deep linking
  useEffect(() => {
    // Parse and handle the deep link URL
    const handleDeepLink = (url: string) => {
      const { hostname, path } = Linking.parse(url);
      
      // Get hostname from config (app.json -> expo.extra.shareUrl)
      const shareUrl = getShareUrl();
      const validHostname = shareUrl ? new URL(shareUrl).hostname : null;
      
      // Check if it's a shared chat URL from either the app scheme or web URL
      if (path) {
        // Handle both app scheme and web URL formats
        const match = path.match(/^shared\/([^\/]+)$/) || path.match(/^\/shared\/([^\/]+)$/);
        if (match && (!hostname || hostname === validHostname)) {
          const chatId = match[1];
          router.push(`/shared/${chatId}`);
        }
      }
    };

    // Handle URLs when app is already running
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    // Handle URLs when app is not running and is opened via URL
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <QueryProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <RouteProvider>
              <InitializationWrapper>
                <ExperienceProvider>
                    <GestureHandlerRootView style={styles.container}>
                    <Stack>
                      <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
                      <Stack.Screen name="+not-found" />
                    </Stack>
                    <StatusBar style="auto" />
                    </GestureHandlerRootView>
                </ExperienceProvider>
              </InitializationWrapper>
            </RouteProvider>
          </ThemeProvider>
        </QueryProvider>
      </PersistGate>
    </Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
