import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/theme/tokens';

export const MiaLogo: React.FC<{ size?: number; showWordmark?: boolean }> = ({
  size = 40,
  showWordmark = false,
}) => {
  return (
    <View style={styles.row}>
      <View
        style={[
          styles.mark,
          { width: size, height: size, borderRadius: size * 0.3 },
        ]}
      >
        <Text style={[styles.letter, { fontSize: size * 0.5 }]}>M</Text>
      </View>
      {showWordmark ? <Text style={styles.wordmark}>MIA</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mark: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  letter: {
    fontWeight: '800',
    color: '#fff',
  },
  wordmark: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
    color: colors.ink,
  },
});
