import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PartyPaymentScreen } from '@/components/PartyPayment';

export default function CustomerPaymentScreen() {
  const { customerId } = useLocalSearchParams<{ customerId?: string }>();
  return <PartyPaymentScreen kind="customer" initialPartyId={customerId} />;
}
