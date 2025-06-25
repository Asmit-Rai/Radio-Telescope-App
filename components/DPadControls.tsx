import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import  styles  from '../utils/styles';
import { ALTITUDE_STEP, AZIMUTH_STEP } from '../utils/constants';

interface DPadControlsProps {
  adjustAltitude: (delta: number) => void;
  adjustAzimuth: (delta: number) => void;
}

const DPadControls: React.FC<DPadControlsProps> = ({ adjustAltitude, adjustAzimuth }) => {
  const startLongPress = (adjustFn: (delta: number) => void, delta: number) => {
    adjustFn(delta);
    const interval = setInterval(() => adjustFn(delta), 100);
    return () => clearInterval(interval);
  };

  const stopLongPress = (clear: () => void) => clear();

  return (
    <View style={styles.dpadContainer}>
      <View style={[styles.dpadArm, styles.dpadHorizontalOutline]} />
      <View style={[styles.dpadArm, styles.dpadVerticalOutline]} />
      <View style={[styles.dpadArm, styles.dpadHorizontal]} />
      <View style={[styles.dpadArm, styles.dpadVertical]} />
      <TouchableOpacity
        style={[styles.dpadButton, styles.dpadButtonUp]}
        onPress={() => adjustAltitude(ALTITUDE_STEP)}
        onLongPress={() => startLongPress(adjustAltitude, ALTITUDE_STEP)}
        onPressOut={() => stopLongPress}
      >
        <FontAwesome5 name="chevron-up" size={24} color="white" />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.dpadButton, styles.dpadButtonDown]}
        onPress={() => adjustAltitude(-ALTITUDE_STEP)}
        onLongPress={() => startLongPress(adjustAltitude, -ALTITUDE_STEP)}
        onPressOut={() => stopLongPress}
      >
        <FontAwesome5 name="chevron-down" size={24} color="white" />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.dpadButton, styles.dpadButtonLeft]}
        onPress={() => adjustAzimuth(-AZIMUTH_STEP)}
        onLongPress={() => startLongPress(adjustAzimuth, -AZIMUTH_STEP)}
        onPressOut={() => stopLongPress}
      >
        <FontAwesome5 name="undo" size={20} color="white" />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.dpadButton, styles.dpadButtonRight]}
        onPress={() => adjustAzimuth(AZIMUTH_STEP)}
        onLongPress={() => startLongPress(adjustAzimuth, AZIMUTH_STEP)}
        onPressOut={() => stopLongPress}
      >
        <FontAwesome5 name="redo" size={20} color="white" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.centerButton}>
        <View style={styles.centerButtonGlow}>
          <View style={styles.centerButtonCore} />
        </View>
      </TouchableOpacity>
    </View>
  );
};

export default DPadControls;