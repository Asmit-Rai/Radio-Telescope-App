import React from 'react';
import { View, PanResponder } from 'react-native';
import styles from '../utils/styles';

interface WaveformProps {
  data: number[];
  cursorPosition: { x: number; y: number };
  cursorPanResponder: { panHandlers: any };
}

const Waveform: React.FC<WaveformProps> = ({ data, cursorPosition, cursorPanResponder }) => (
  <View style={styles.waveformContainer} {...cursorPanResponder.panHandlers}>
    {data.map((amp, i) => (
      <View
        key={i}
        style={[styles.waveBar, { height: `${2 + amp * 96}%` }]}
      />
    ))}
    <View
      style={[
        styles.cursor,
        { left: cursorPosition.x - 1.5, top: cursorPosition.y - 75 },
      ]}
    />
  </View>
);

export default Waveform;