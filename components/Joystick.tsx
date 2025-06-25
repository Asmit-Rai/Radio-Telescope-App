import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';

interface Props {
  onDirection: (dir: 'up' | 'down' | 'left' | 'right') => void;
}

const Joystick: React.FC<Props> = ({ onDirection }) => (
  <View style={styles.container}>
    <TouchableOpacity onPress={() => onDirection('up')} style={styles.button}><Text>↑</Text></TouchableOpacity>
    <View style={styles.row}>
      <TouchableOpacity onPress={() => onDirection('left')} style={styles.button}><Text>←</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.center]}><Text>●</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => onDirection('right')} style={styles.button}><Text>→</Text></TouchableOpacity>
    </View>
    <TouchableOpacity onPress={() => onDirection('down')} style={styles.button}><Text>↓</Text></TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  container: { alignItems: 'center', marginVertical: 20 },
  row: { flexDirection: 'row', justifyContent: 'center' },
  button: {
    margin: 8,
    padding: 16,
    backgroundColor: '#ffa500',
    borderRadius: 10,
  },
  center: { backgroundColor: '#333' },
});

export default Joystick;
