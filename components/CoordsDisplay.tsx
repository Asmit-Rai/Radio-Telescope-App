import React from 'react';
import { View, Text } from 'react-native';
import  styles  from '../utils/styles';

interface CoordsDisplayProps {
  altitude: number;
  azimuth: number;
}

const CoordsDisplay: React.FC<CoordsDisplayProps> = ({ altitude, azimuth }) => (
  <View style={styles.coordsContainer}>
    <Text style={styles.coordsText}>ALTITUDE: {altitude.toFixed(1)}°</Text>
    <Text style={styles.coordsText}>AZIMUTH: {azimuth.toFixed(1)}°</Text>
  </View>
);

export default CoordsDisplay;