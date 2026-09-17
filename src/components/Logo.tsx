import React from 'react';
import { Image, StyleProp, ImageStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

const MIA_LOGO = require('../../assets/mia.png');

export function Logo({ size = 120, style }: { size?: number; style?: StyleProp<ImageStyle> }) {
  const { t } = useTranslation();
  return (
    <Image
      source={MIA_LOGO}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityLabel={t('common.appName')}
    />
  );
}
