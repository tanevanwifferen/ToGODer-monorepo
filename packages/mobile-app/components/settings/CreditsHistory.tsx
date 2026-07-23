import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  useColorScheme,
  FlatList,
} from 'react-native';
import { useSelector } from 'react-redux';
import { selectIsAuthenticated } from '../../redux/slices/authSlice';
import { GlobalApiClient } from '../../apiClients/GlobalApiClient';
import { Colors } from '../../constants/Colors';

interface Transaction {
  id: string;
  amount: string;
  type: 'credit' | 'debit';
  source: string;
  description: string | null;
  createdAt: string;
}

const CreditsHistory = () => {
  const colorScheme = useColorScheme();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const theme = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    if (isAuthenticated) {
      setLoading(true);
      setError(null);
      GlobalApiClient.getCreditTransactions(1, 50)
        .then((data) => {
          setTransactions(data.transactions);
        })
        .catch((err) => {
          setError('Failed to load transaction history');
        })
        .finally(() => setLoading(false));
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="small" color={theme.tint} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: 'red' }]}>{error}</Text>
      </View>
    );
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatAmount = (transaction: Transaction) => {
    const sign = transaction.type === 'credit' ? '+' : '-';
    const num = Number(transaction.amount).toFixed(2);
    return `${sign}$${num}`;
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'referral':
        return 'Referral';
      case 'deposit':
        return 'Deposit';
      case 'redemption':
        return 'Redemption';
      case 'admin':
        return 'Admin';
      default:
        return source;
    }
  };

  const renderItem = ({ item }: { item: Transaction }) => (
    <View style={[styles.row, { borderColor: theme.icon }]}>
      <View style={styles.rowLeft}>
        <Text style={[styles.source, { color: theme.text }]}>
          {getSourceLabel(item.source)}
        </Text>
        {item.description ? (
          <Text style={[styles.description, { color: theme.icon }]} numberOfLines={1}>
            {item.description}
          </Text>
        ) : null}
        <Text style={[styles.date, { color: theme.icon }]}>
          {formatDate(item.createdAt)}
        </Text>
      </View>
      <Text
        style={[
          styles.amount,
          {
            color: item.type === 'credit' ? '#22c55e' : '#ef4444',
          },
        ]}
      >
        {formatAmount(item)}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.label, { color: theme.text }]}>
        Transaction History
      </Text>

      {transactions.length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.icon }]}>
          No transactions yet.
        </Text>
      ) : (
        transactions.map((item) => (
          <View key={item.id}>
            {renderItem({ item })}
          </View>
        ))
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
  errorText: {
    fontSize: 14,
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: {
    flex: 1,
    marginRight: 12,
  },
  source: {
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    fontSize: 12,
    marginTop: 2,
  },
  date: {
    fontSize: 11,
    marginTop: 2,
  },
  amount: {
    fontSize: 15,
    fontWeight: '600',
  },
});

export default CreditsHistory;
