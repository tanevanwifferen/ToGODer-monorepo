import { Drawer } from "expo-router/drawer";
import { DrawerContentScrollView, DrawerItemList, DrawerContentComponentProps } from "@react-navigation/drawer";
import React from "react";
import { Platform } from 'react-native';

import { IconSymbol } from "../../components/ui/IconSymbol";
import { Colors } from "../../constants/Colors";
import { useColorScheme } from "../../hooks/useColorScheme";
import { useSelector } from "react-redux";
import {
  selectDonateOptions,
  selectShowLogin,
} from "../../redux/slices/globalConfigSlice";
import { usePasscode } from "../../hooks/usePasscode";
import { EditPasscodeModal } from "../../components/passcode/PasscodeModal";
import { LockScreen } from "../../components/passcode/LockScreen";
import { ExternalDrawerLink } from "../../components/drawer/ExternalDrawerLink";
import { ProjectSelector } from "../../components/drawer/ProjectSelector";
import { useMemoryCheck } from "../../hooks/useMemoryCheck";
import { DreamingView } from "../../components/DreamingView";

export default function DrawerLayout() {
  const colorScheme = useColorScheme();
  const donateOptions = useSelector(selectDonateOptions);
  const showLogin = useSelector(selectShowLogin);
  const { showPasscodeModal, setShowPasscodeModal, isLocked } = usePasscode();
  const { isDreaming } = useMemoryCheck();

  // Skip passcode check on web platform
  if (Platform.OS !== 'web' && isLocked) {
    return <LockScreen />;
  }

  return (
    <>
      <Drawer
        screenOptions={({ route }) => ({
          headerShown: true,
          drawerActiveTintColor: Colors[colorScheme ?? "light"].tint,
          headerTintColor: Colors[colorScheme ?? "light"].tint,
          drawerType: "front",
          drawerItemStyle: {
            // Hide any routes that start with chat/, shared/, or projects/ except the main routes
            // Also hide the standalone 'chat' route
            display: route.name === 'chat' ||
                     route.name.startsWith('chat/') ||
                     (route.name.startsWith('shared/') && route.name !== 'shared') ||
                     (route.name.startsWith('projects/') && route.name !== 'projects')
              ? 'none'
              : undefined
          }
        })}
        drawerContent={(props: DrawerContentComponentProps) => (
          <DrawerContentScrollView {...props}>
            <ProjectSelector />
            <DrawerItemList {...props} />
            <ExternalDrawerLink
              href="https://github.com/tanevanwifferen/ToGODer"
              title="GitHub"
              iconName="link"
            />
            <ExternalDrawerLink
              href="https://t.me/togoder"
              title="Telegram"
              iconName="message.fill"
            />
          </DrawerContentScrollView>
        )}
      >
        <Drawer.Screen
          name="index"
          options={{
            title: "Chat",
            drawerIcon: ({ color }: { color: string }) => (
              <IconSymbol size={28} name="house.fill" color={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="projects"
          options={{
            title: "Projects",
            drawerIcon: ({ color }: { color: string }) => (
              <IconSymbol size={28} name="folder.fill" color={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="shared"
          options={{
            title: "Shared",
            drawerIcon: ({ color }: { color: string }) => (
              <IconSymbol size={28} name="share" color={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="settings"
          options={{
            title: "Settings",
            drawerIcon: ({ color }: { color: string }) => (
              <IconSymbol size={28} name="gear" color={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="login"
          options={{
            title: "Profile",
            drawerIcon: ({ color }: { color: string }) => (
              <IconSymbol size={28} name="person.fill" color={color} />
            ),
            drawerItemStyle: { display: showLogin ? "flex" : "none" },
          }}
        />
        <Drawer.Screen
          name="donate"
          options={{
            title: "Support ToGODer",
            drawerIcon: ({ color }: { color: string }) => (
              <IconSymbol size={28} name="heart.fill" color={color} />
            ),
            drawerItemStyle: {
              display: donateOptions.length > 0 ? "flex" : "none",
            },
          }}
        />
      </Drawer>

      <EditPasscodeModal
        visible={showPasscodeModal}
        onClose={() => setShowPasscodeModal(false)}
      />
      {isDreaming && !isLocked && <DreamingView isDreaming={isDreaming} />}
    </>
  );
}
