import React, { useState } from "react";
import {
  StyleSheet,
  View,
  TouchableOpacity,
  useColorScheme,
} from "react-native";
import { useSelector } from "react-redux";
import { useRouter } from "expo-router";
import { selectIsAuthenticated } from "../redux/slices/authSlice";
import { ThemedText } from "./ThemedText";
import { Colors } from "../constants/Colors";

export function UnauthenticatedBanner() {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isDark = colorScheme !== "light";

  // Don't render if authenticated or dismissed
  if (isAuthenticated || dismissed) return null;

  const handleSignUp = () => {
    router.push("/login");
  };

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: isDark ? "#1a1a24" : "#faf6ed",
          borderColor: colors.tint,
        },
      ]}
    >
      {/* Dismiss button */}
      <TouchableOpacity
        style={styles.dismissButton}
        onPress={() => setDismissed(true)}
      >
        <ThemedText style={styles.dismissText}>✕</ThemedText>
      </TouchableOpacity>

      {/* Heading */}
      <ThemedText type="subtitle" style={styles.heading}>
        Welcome to ToGODer
      </ThemedText>

      <ThemedText style={styles.subheading}>
        Create a free account to unlock the full experience.
      </ThemedText>

      {/* Benefits */}
      <View style={styles.benefits}>
        <View style={styles.benefitRow}>
          <ThemedText style={styles.benefitIcon}>📚</ThemedText>
          <ThemedText style={styles.benefitText}>
            Access the prompt library
          </ThemedText>
        </View>
        <View style={styles.benefitRow}>
          <ThemedText style={styles.benefitIcon}>🧠</ThemedText>
          <ThemedText style={styles.benefitText}>
            Persistent chat memories
          </ThemedText>
        </View>
        <View style={styles.benefitRow}>
          <ThemedText style={styles.benefitIcon}>✨</ThemedText>
          <ThemedText style={styles.benefitText}>
            Access to better AI models
          </ThemedText>
        </View>
      </View>

      {/* CTA Button */}
      <TouchableOpacity
        style={[
          styles.cta,
          {
            backgroundColor: colors.tint,
          },
        ]}
        onPress={handleSignUp}
      >
        <ThemedText
          style={[
            styles.ctaText,
            { color: isDark ? "#0f0f14" : "#faf8f2" },
          ]}
        >
          Sign Up Free
        </ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    position: "relative",
  },
  dismissButton: {
    position: "absolute",
    top: 8,
    right: 12,
    padding: 4,
    zIndex: 1,
  },
  dismissText: {
    fontSize: 16,
    opacity: 0.5,
  },
  heading: {
    marginBottom: 4,
    paddingRight: 24,
  },
  subheading: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 14,
  },
  benefits: {
    marginBottom: 16,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  benefitIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  benefitText: {
    fontSize: 14,
    opacity: 0.85,
  },
  cta: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "700",
  },
});