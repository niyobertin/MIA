import React from 'react';
import {
  findNodeHandle,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  TextInput,
  UIManager,
} from 'react-native';
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
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);

  React.useImperativeHandle(ref, () => scrollRef.current!);

  const scrollToInput = React.useCallback(() => {
    const input = focusedInput.current;
    const scroll = scrollRef.current;
    if (!input || !scroll) return;

    const extraOffset = 48;
    // Prefer RN's built-in scroll-to-keyboard helper when available
    const responder = scroll as ScrollView & {
      scrollResponderScrollNativeHandleToKeyboard?: (
        node: number | TextInput,
        offset: number,
        animated: boolean
      ) => void;
    };

    if (typeof responder.scrollResponderScrollNativeHandleToKeyboard === 'function') {
      responder.scrollResponderScrollNativeHandleToKeyboard(input, extraOffset, true);
      return;
    }

    const inputHandle = findNodeHandle(input);
    const scrollHandle = findNodeHandle(scroll);
    if (!inputHandle || !scrollHandle || !UIManager.measureLayout) return;

    UIManager.measureLayout(
      inputHandle,
      scrollHandle,
      () => {},
      (_x, y, _width, height) => {
        const targetY = Math.max(0, y - extraOffset);
        scroll.scrollTo({ y: targetY, animated: true });
        // If field sits low on screen, nudge further so it clears the keyboard
        if (keyboardHeight > 0) {
          scroll.scrollTo({
            y: Math.max(0, y + height + extraOffset - 80),
            animated: true,
          });
        }
      }
    );
  }, [keyboardHeight]);

  const focusInput = React.useCallback((input: TextInput | null) => {
    focusedInput.current = input;
    if (input) {
      requestAnimationFrame(() => {
        setTimeout(scrollToInput, Platform.OS === 'ios' ? 50 : 100);
      });
    }
  }, [scrollToInput]);

  React.useEffect(() => {
    if (!avoidKeyboard) return;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
      requestAnimationFrame(() => {
        setTimeout(scrollToInput, Platform.OS === 'ios' ? 60 : 120);
      });
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [avoidKeyboard, scrollToInput]);

  const bottomPad = 24 + (keyboardHeight > 0 ? Math.min(keyboardHeight * 0.35, 160) : 0);

  return (
    <KeyboardAvoidingView
      style={StyleSheet.flatten([styles.container, style])}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      enabled={avoidKeyboard}
      keyboardVerticalOffset={keyboardVerticalOffset ?? (insets.top + (Platform.OS === 'ios' ? 8 : 0))}
    >
      <FormScrollContext.Provider value={focusInput}>
        <ScrollView
          ref={scrollRef}
          style={styles.container}
          contentContainerStyle={StyleSheet.flatten([
            styles.content,
            { paddingBottom: bottomPad },
            contentContainerStyle,
          ])}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
          onLayout={(event) => {
            onLayout?.(event);
            if (focusedInput.current) {
              requestAnimationFrame(scrollToInput);
            }
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
  content: { flexGrow: 1 },
});
