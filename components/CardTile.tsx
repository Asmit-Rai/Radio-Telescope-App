import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ImageSourcePropType,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  title: string;
  icon: ImageSourcePropType;
  color: string;
  onPress?: () => void;
}

const CardTile: React.FC<Props> = ({ title, icon, color, onPress }) => {
  return (
    <TouchableOpacity style={[styles.card]} onPress={onPress}>
      {/* 3D icon popping out */}
      <View style={styles.iconWrapper}>
        <Image source={icon} style={styles.icon} />
      </View>

      {/* Bottom Row: Text and Arrow */}
      <View style={styles.bottomRow}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <View style={styles.arrowCircle}>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '48%',
    height: 180,
    borderRadius: 20,
    padding: 16,
    paddingTop: 40,
    justifyContent: 'flex-end',
    marginBottom: 30,
    overflow: 'visible',
    paddingVertical: 30,
    paddingHorizontal: 20,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "rgba(0, 0, 0, 0.4)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    alignItems: "center",
  },
  iconWrapper: {
    alignSelf: 'center',
    position: 'absolute',
    top: -45,
    zIndex: 2,
   
    padding: 40,
    borderRadius: 100,
    elevation: 10,
 
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "rgba(0, 0, 0, 0.4)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    overflow: "hidden",
    justifyContent: "space-between",
    alignItems: "center",
  },
  icon: {
    width: 70,
    height: 70,
    resizeMode: 'contain',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontSize: 12,
    color: 'white',
    fontWeight: '600',
    fontFamily: 'Shantell',
    paddingRight: 8,
  },
  arrowCircle: {
    backgroundColor: '#FF833A',
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CardTile;
