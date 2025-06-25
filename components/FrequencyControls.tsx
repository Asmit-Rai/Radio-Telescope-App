import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import styles from '../utils/styles';
import { FINE_FREQUENCY_STEP, COARSE_FREQUENCY_STEP } from '../utils/constants';


interface FrequencyControlsProps {
  adjustFrequency: (delta: number) => void;
}

const FrequencyControls: React.FC<FrequencyControlsProps> = ({ adjustFrequency }) => {
  const startLongPress = (delta: number) => {
    adjustFrequency(delta);
    const interval = setInterval(() => adjustFrequency(delta), 100);
    return () => clearInterval(interval);
  };

  const stopLongPress = (clear: () => void) => clear();

  return (
    <View style={styles.freqControls}>
      <TouchableOpacity
        style={styles.freqButton}
        onPress={() => adjustFrequency(-COARSE_FREQUENCY_STEP)}
        onLongPress={() => startLongPress(-COARSE_FREQUENCY_STEP)}
        onPressOut={() => stopLongPress}
      >
        <Text style={styles.freqButtonText}>--</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.freqButton}
        onPress={() => adjustFrequency(-FINE_FREQUENCY_STEP)}
        onLongPress={() => startLongPress(-FINE_FREQUENCY_STEP)}
        onPressOut={() => stopLongPress}
      >
        <Text style={styles.freqButtonText}>-</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.freqButton}
        onPress={() => adjustFrequency(FINE_FREQUENCY_STEP)}
        onLongPress={() => startLongPress(FINE_FREQUENCY_STEP)}
        onPressOut={() => stopLongPress}
      >
        <Text style={styles.freqButtonText}>+</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.freqButton}
        onPress={() => adjustFrequency(COARSE_FREQUENCY_STEP)}
        onLongPress={() => startLongPress(COARSE_FREQUENCY_STEP)}
        onPressOut={() => stopLongPress}
      >
        <Text style={styles.freqButtonText}>++</Text>
      </TouchableOpacity>
    </View>
  );
};

export default FrequencyControls;