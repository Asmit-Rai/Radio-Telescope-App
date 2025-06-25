import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import { router } from 'expo-router';
import styles  from '../utils/styles';

interface HeaderProps {
  deviceName: string;
}

const Header: React.FC<HeaderProps> = ({ deviceName }) => (
  <View style={styles.header}>
    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
      <View style={styles.backCircle}>
        <AntDesign name="arrowleft" size={20} color="white" />
      </View>
    </TouchableOpacity>
    <View style={styles.titleContainer}>
      <Text style={styles.subtitle}>{deviceName || 'Radio Telescope'}</Text>
    </View>
  </View>
);

export default Header;