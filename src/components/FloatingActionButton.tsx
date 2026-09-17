import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadows } from '@/theme/tokens';

interface FABAction {
  label: string;
  description?: string;
  icon: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}

interface FloatingActionButtonProps {
  actions: FABAction[];
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  mainIcon?: string;
  mainColor?: string;
  tooltip?: string;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  actions,
  position = 'bottom-right',
  mainIcon = 'add',
  mainColor = colors.primary,
  tooltip,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const rotateAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: expanded ? 1 : 0, duration: expanded ? 200 : 150, useNativeDriver: true }),
      Animated.timing(rotateAnim, { toValue: expanded ? 1 : 0, duration: expanded ? 200 : 150, useNativeDriver: true }),
    ]).start();
  }, [expanded, rotateAnim, scaleAnim]);

  const closeAndAction = (action: FABAction) => {
    setExpanded(false);
    setTimeout(() => action.onPress(), 120);
  };

  const onMainPress = () => {
    if (actions.length === 1) {
      actions[0].onPress();
      return;
    }
    setExpanded((v) => !v);
  };

  const positionStyles = {
    'bottom-right': { bottom: 24, right: 24 },
    'bottom-left': { bottom: 24, left: 24 },
    'top-right': { top: 24, right: 24 },
    'top-left': { top: 24, left: 24 },
  };

  return (
    <View style={StyleSheet.flatten([styles.container, positionStyles[position]])} pointerEvents="box-none">
      {expanded ? <Pressable style={styles.backdrop} onPress={() => setExpanded(false)} /> : null}

      {expanded
        ? actions.map((action) => (
            <Animated.View
              key={action.label}
              style={StyleSheet.flatten([
                styles.actionWrapper,
                {
                  opacity: scaleAnim,
                  transform: [
                    {
                      translateY: scaleAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [24, 0],
                      }),
                    },
                  ],
                },
              ])}
            >
              <View style={styles.actionLabelContainer}>
                <Text style={styles.actionLabel}>{action.label}</Text>
                {action.description ? (
                  <Text style={styles.actionDescription}>{action.description}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={StyleSheet.flatten([
                  styles.actionButton,
                  action.variant === 'secondary' ? styles.actionButtonSecondary : null,
                ])}
                onPress={() => closeAndAction(action)}
                activeOpacity={0.85}
                accessibilityLabel={action.label}
              >
                <Ionicons
                  name={action.icon as any}
                  size={20}
                  color={action.variant === 'secondary' ? colors.ink : colors.white}
                />
              </TouchableOpacity>
            </Animated.View>
          ))
        : null}

      {!expanded && actions.length === 1 ? (
        <View style={styles.hintBubble}>
          <Text style={styles.hintText}>{actions[0].label}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={StyleSheet.flatten([styles.mainButton, { backgroundColor: mainColor }])}
        onPress={onMainPress}
        activeOpacity={0.85}
        accessibilityLabel={tooltip ?? actions[0]?.label ?? 'Actions'}
      >
        <Animated.View
          style={{
            transform: [
              {
                rotate: rotateAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '45deg'],
                }),
              },
            ],
          }}
        >
          <Ionicons name={(expanded ? 'close' : mainIcon) as any} size={28} color={colors.white} />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignItems: 'flex-end',
    zIndex: 100,
  },
  backdrop: {
    position: 'absolute',
    top: -2000,
    right: -2000,
    bottom: -200,
    left: -2000,
  },
  actionWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.raised,
  },
  actionButtonSecondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionLabelContainer: {
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    marginRight: 10,
    maxWidth: 200,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  actionDescription: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  hintBubble: {
    backgroundColor: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    marginBottom: 10,
    marginRight: 4,
  },
  hintText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  mainButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.raised,
  },
});
