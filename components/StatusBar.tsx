import React from 'react';
import { View, Text } from 'react-native';
import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import styles from '../utils/styles';

interface StatusBarProps {
  status: string;
  signal: number | null;
  battery: number;
}

const StatusBar: React.FC<StatusBarProps> = ({ status, signal, battery }) => (
  <View style={styles.statusBar}>
    <View style={styles.statusItem}>
      <View style={styles.statusIconBG}>
        <View style={styles.statusIconInner} />
      </View>
      <Text style={styles.statusLabel}>STATUS</Text>
      <Text style={styles.statusValueGreen}>{status}</Text>
    </View>
    <View style={styles.statusItem}>
      <FontAwesome5 name="wifi" size={20} color="white" />
      <Text style={styles.statusLabel}>SIGNAL</Text>
      <Text style={styles.statusValueGreen}>{signal ?? 'N/A'}</Text>
    </View>
    <View style={styles.statusItem}>
      <MaterialIcons name="battery-full" size={24} color="#34C759" />
      <Text style={styles.statusLabel}>BATTERY</Text>
      <Text style={styles.statusValue}>{battery}%</Text>
    </View>
  </View>
);

export default StatusBar;