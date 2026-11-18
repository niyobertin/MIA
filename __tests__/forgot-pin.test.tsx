import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApiError } from '@/lib/api';
import { cloudRequestPinHelp, cloudRequestPinReset, cloudResetPin } from '@/services/auth/cloudAuth';
import ForgotPinScreen from '../app/(auth)/forgot-pin';

const mockReplace = jest.fn();

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock('@/stores/toastStore', () => ({ showToast: jest.fn() }));
jest.mock('@/services/auth/cloudAuth', () => ({
  cloudRequestPinReset: jest.fn(),
  cloudRequestPinHelp: jest.fn(),
  cloudResetPin: jest.fn(),
}));
jest.mock('@/repositories/settings', () => ({
  settingsStorage: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));
jest.mock('@/repositories/users/users', () => ({ PinValidationError: class extends Error {} }));

const requestReset = cloudRequestPinReset as jest.Mock;
const resetPin = cloudResetPin as jest.Mock;
const requestHelp = cloudRequestPinHelp as jest.Mock;

async function reachResetStep() {
  const screen = render(<ForgotPinScreen />);
  fireEvent.changeText(screen.getByTestId('reset-identifier'), 'owner@example.test');
  fireEvent.press(screen.getByText('auth.sendResetCode'));
  await screen.findByTestId('reset-code');
  return screen;
}

describe('forgot PIN screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requestReset.mockResolvedValue(undefined);
    resetPin.mockResolvedValue(undefined);
    requestHelp.mockResolvedValue(undefined);
  });

  it('rejects an invalid email or phone without calling the API', async () => {
    const screen = render(<ForgotPinScreen />);
    fireEvent.changeText(screen.getByTestId('reset-identifier'), 'not an email');
    fireEvent.press(screen.getByText('auth.sendResetCode'));
    await screen.findByText('auth.invalidIdentifier');
    expect(requestReset).not.toHaveBeenCalled();
  });

  it('blocks mismatched PINs', async () => {
    const screen = await reachResetStep();
    fireEvent.changeText(screen.getByTestId('reset-code'), '123456');
    fireEvent.changeText(screen.getByTestId('reset-pin'), '7391');
    fireEvent.changeText(screen.getByTestId('reset-pin-confirm'), '7392');
    fireEvent.press(screen.getByText('auth.resetPinSubmit'));
    await screen.findByText('auth.pinMismatch');
    expect(resetPin).not.toHaveBeenCalled();
  });

  it('resets the PIN and returns to sign in', async () => {
    const screen = await reachResetStep();
    fireEvent.changeText(screen.getByTestId('reset-code'), '123456');
    fireEvent.changeText(screen.getByTestId('reset-pin'), '7391');
    fireEvent.changeText(screen.getByTestId('reset-pin-confirm'), '7391');
    fireEvent.press(screen.getByText('auth.resetPinSubmit'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/login'));
    expect(resetPin).toHaveBeenCalledWith('owner@example.test', '123456', '7391');
  });

  it('explains a wrong code and stays on the screen', async () => {
    resetPin.mockRejectedValue(new ApiError('bad', 400, { code: 'RESET_CODE_INVALID' }));
    const screen = await reachResetStep();
    fireEvent.changeText(screen.getByTestId('reset-code'), '123456');
    fireEvent.changeText(screen.getByTestId('reset-pin'), '7391');
    fireEvent.changeText(screen.getByTestId('reset-pin-confirm'), '7391');
    fireEvent.press(screen.getByText('auth.resetPinSubmit'));
    await screen.findByText('auth.resetCodeInvalid');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('asks for internet when offline', async () => {
    requestReset.mockRejectedValue(new Error('OFFLINE'));
    const screen = render(<ForgotPinScreen />);
    fireEvent.changeText(screen.getByTestId('reset-identifier'), 'owner@example.test');
    fireEvent.press(screen.getByText('auth.sendResetCode'));
    await screen.findByText('auth.resetNeedsInternet');
  });

  it('sends a code request for a phone number', async () => {
    const screen = render(<ForgotPinScreen />);
    fireEvent.changeText(screen.getByTestId('reset-identifier'), '0788 123 456');
    fireEvent.press(screen.getByText('auth.sendResetCode'));
    await screen.findByTestId('reset-code');
    expect(requestReset).toHaveBeenCalledWith('0788 123 456');
  });

  it('sends a help request to MIA support with a phone to call', async () => {
    const screen = render(<ForgotPinScreen />);
    fireEvent.changeText(screen.getByTestId('reset-identifier'), '0788123456');
    fireEvent.press(screen.getByText('auth.askSupport'));
    await screen.findByTestId('help-name');
    fireEvent.changeText(screen.getByTestId('help-name'), 'Aline Uwase');
    fireEvent.press(screen.getByText('auth.pinHelpSubmit'));
    await screen.findByText('auth.pinHelpSentTitle');
    expect(requestHelp).toHaveBeenCalledWith({
      identifier: '0788123456',
      name: 'Aline Uwase',
      contactPhone: '0788123456',
      message: '',
    });
  });

  it('asks for a phone support can call', async () => {
    const screen = render(<ForgotPinScreen />);
    fireEvent.changeText(screen.getByTestId('reset-identifier'), 'owner@example.test');
    fireEvent.press(screen.getByText('auth.askSupport'));
    await screen.findByTestId('help-name');
    fireEvent.changeText(screen.getByTestId('help-name'), 'Aline Uwase');
    fireEvent.press(screen.getByText('auth.pinHelpSubmit'));
    await screen.findByText('auth.helpPhoneRequired');
    expect(requestHelp).not.toHaveBeenCalled();
  });
});
