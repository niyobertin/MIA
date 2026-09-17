import React from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, ScrollViewProps, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const FormScrollContext = React.createContext<((input: TextInput | null) => void) | null>(null);

interface FormScrollViewProps extends ScrollViewProps {
  keyboardVerticalOffset?: number;
  avoidKeyboard?: boolean;
}

export const FormScrollView = React.forwardRef<ScrollView, FormScrollViewProps>(({
  children,
  style,
  contentContainerStyle,
  keyboardVerticalOffset,
  avoidKeyboard = true,
  onLayout,
  ...props
}, ref) => {
  const scrollRef = React.useRef<ScrollView>(null);
  const focusedInput = React.useRef<TextInput | null>(null);
  const insets = useSafeAreaInsets();

  React.useImperativeHandle(ref, () => scrollRef.current!);

  const scrollToInput = React.useCallback(() => {
    if (focusedInput.current) {
      scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(focusedInput.current, 24, true);
    }
  }, []);

  const focusInput = React.useCallback((input: TextInput | null) => {
    focusedInput.current = input;
    if (input) requestAnimationFrame(scrollToInput);
  }, [scrollToInput]);

  React.useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      requestAnimationFrame(scrollToInput);
    });
    return () => subscription.remove();
  }, [scrollToInput]);

  return (
    <KeyboardAvoidingView
      style={StyleSheet.flatten([styles.container, style])}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      enabled={avoidKeyboard}
      keyboardVerticalOffset={keyboardVerticalOffset ?? insets.top}
    >
      <FormScrollContext.Provider value={focusInput}>
        <ScrollView
          ref={scrollRef}
          style={styles.container}
          contentContainerStyle={StyleSheet.flatten([styles.content, contentContainerStyle])}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={false}
          onLayout={(event) => {
            onLayout?.(event);
            requestAnimationFrame(scrollToInput);
          }}
          {...props}
        >
          {children}
        </ScrollView>
      </FormScrollContext.Provider>
    </KeyboardAvoidingView>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: 24 },
});
