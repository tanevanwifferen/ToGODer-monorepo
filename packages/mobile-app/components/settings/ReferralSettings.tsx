import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
  Platform,
} from 'react-native';
import { useSelector } from 'react-redux';
import { selectIsAuthenticated } from '../../redux/slices/authSlice';
import { GlobalApiClient } from '../../apiClients/GlobalApiClient';
import { Colors } from '../../constants/Colors';

const ReferralSettings = () => {
  const colorScheme = useColorScheme();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [creditsBalance, setCreditsBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const theme = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    if (isAuthenticated) {
      setLoading(true);
      GlobalApiClient.getReferralCode()
        .then((data) => {
          setReferralCode(data.referralCode);
          setReferralLink(data.referralLink);
          setCreditsBalance(Number(data.creditsBalance));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isAuthenticated]);

  const handleCopy = () => {
    if (!referralLink) return;
    if (Platform.OS === 'web') {
      navigator.clipboard.writeText(referralLink);
    } else {
      // React Native — use Clipboard
      const Clipboard = require('expo-clipboard');
      Clipboard.setStringAsync(referralLink);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isAuthenticated) return null;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="small" color={theme.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.label, { color: theme.text }]}>Earn Credits</Text>

      <View style={[styles.balanceRow, { borderColor: theme.icon }]}>
        <Text style={[styles.balanceLabel, { color: theme.text }]}>
          Referral Credits:
        </Text>
        <Text style={[styles.balanceValue, { color: theme.tint }]}>
          ${creditsBalance.toFixed(2)}
        </Text>
      </View>

      {referralCode && referralLink ? (
        <View style={styles.linkContainer}>
          <Text style={[styles.sublabel, { color: theme.icon }]}>
            Share this link to earn{' '}
            <Text style={{ fontWeight: '700', color: theme.tint }}>
              2% commission
            </Text>{' '}
            on every supporter signup:
          </Text>
          <View style={[styles.linkBox, { borderColor: theme.icon, backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.05)' : '#f8f9fa' }]}>
            <Text style={[styles.linkText, { color: theme.text }]} numberOfLines={1} selectable>
              {referralLink}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.copyButton, { backgroundColor: theme.tint }]}
            onPress={handleCopy}
          >
            <Text style={styles.copyButtonText}>
              {copied ? '✓ Copied!' : 'Copy Link'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={[styles.sublabel, { color: theme.icon }]}>
          Unable to load referral link.
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  sublabel: {
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 18,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  balanceLabel: {
    fontSize: 14,
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  linkContainer: {
    marginTop: 4,
  },
  linkBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  linkText: {
    fontSize: 13,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
  },
  copyButton: {
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ReferralSettings;
