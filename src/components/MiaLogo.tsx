import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/theme/tokens';

const MIA_LOGO = require('../../assets/mia.png');

export const MiaLogo: React.FC<{ size?: number; showWordmark?: boolean }> = ({
  size = 40,
  showWordmark = false,
}) => {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <Image
        source={MIA_LOGO}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel={t('common.appName')}
      />
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
  wordmark: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
    color: colors.ink,
  },
});
