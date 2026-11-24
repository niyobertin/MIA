import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PartyPaymentScreen } from '@/components/PartyPayment';

export default function SupplierPaymentScreen() {
  const { supplierId } = useLocalSearchParams<{ supplierId?: string }>();
  return <PartyPaymentScreen kind="supplier" initialPartyId={supplierId} />;
}
