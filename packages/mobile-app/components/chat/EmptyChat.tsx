import React from 'react';
import { StyleSheet, View, Text, Button } from 'react-native';
import { useSelector } from 'react-redux';
import { selectQuote } from '../../redux/slices/globalConfigSlice';
import { useExperienceContext } from '../providers/ExperienceProvider';

export function EmptyChat({setInputText}: {setInputText: (text: string) => void}) {
  const quote = useSelector(selectQuote);
  const { showLanguageInput } = useExperienceContext();

  const startFiveMinuteCheckin = ()=>{
    setInputText('/fiveMinuteCheckin');
  }

  const startFifteenMinuteCheckin = ()=>{
    setInputText('/fifteenMinuteCheckin');
  }

  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>{quote}</Text>
      <Button onPress={() => showLanguageInput(true)} title="Start Experience" />
      <Button onPress={startFiveMinuteCheckin} title="5 minute checkin" />
      <Button onPress={startFifteenMinuteCheckin} title="15 minute checkin" />
    </View>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ scaleY: -1 }],
    padding: 25
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginBottom: 50,
  }
});
