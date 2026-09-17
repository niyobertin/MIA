import { KeyboardAvoidingView, Platform } from 'react-native';
import { FormScrollView } from '@/components';
import { FormInput, FormPicker } from '@/components';
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Button, Input } from '@/components';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { generateUUID } from '@/utils/uuid';
import { useAuthStore } from '@/stores/authStore';
import { userRepository } from '@/repositories/users/users';
import { showToast } from '@/stores/toastStore';

const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  role: z.enum(['OWNER', 'MANAGER', 'CASHIER', 'STAFF']),
});

type CreateUserForm = z.infer<typeof createUserSchema>;

const ROLES = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'CASHIER', label: 'Cashier' },
  { value: 'STAFF', label: 'Staff' },
];

export default function UserManagementScreen() {
  const { t } = useTranslation();
  const { business } = useAuthStore();
  const [showAddUser, setShowAddUser] = React.useState(false);
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: '', email: '', phone: '', role: 'STAFF' },
  });

  const onSubmit = async (data: CreateUserForm) => {
    if (!business) return;
    try {
      await userRepository.create({
        id: generateUUID(),
        business_id: business.id,
        ...data,
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setShowAddUser(false);
      showToast(t('users.userAdded'), 'success');
    } catch (error) {
      console.error('Failed to create user:', error);
      showToast(t('users.userFailed'), 'error');
    }
  };

  const handleToggleActive = async (userId: string, active: boolean) => {
    try {
      await userRepository.setActive(userId, business!.id, !active);
      showToast(t('users.userUpdated'), 'success');
    } catch (error) {
      console.error('Failed to toggle user:', error);
      showToast(t('users.userFailed'), 'error');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    Alert.alert(
      t('users.deleteConfirm'),
      t('users.deleteConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: async () => {
          try {
            await userRepository.delete(userId, business!.id);
            showToast(t('users.userDeleted'), 'success');
          } catch (error) {
            console.error('Failed to delete user:', error);
            showToast(t('users.userFailed'), 'error');
          }
        }},
      ]
    );
  };

  return (
    <FormScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{t('users.users')}</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddUser(true)}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.usersList}>
        {[
          { id: '1', name: 'Demo Owner', email: 'demo@mia.app', role: 'OWNER', active: true },
          { id: '2', name: 'John Manager', email: 'manager@mia.app', role: 'MANAGER', active: true },
          { id: '3', name: 'Jane Cashier', email: 'cashier@mia.app', role: 'CASHIER', active: true },
        ].map((user) => (
          <View key={user.id} style={styles.userCard}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>{getInitials(user.name)}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user.name}</Text>
              <Text style={styles.userEmail}>{user.email}</Text>
            </View>
            <View style={styles.userActions}>
              <View style={[styles.roleBadge, { backgroundColor: getRoleColor(user.role) }]}>
                <Text style={styles.roleBadgeText}>{t(`users.${user.role.toLowerCase()}`)}</Text>
              </View>
              <Switch
                value={user.active}
                onValueChange={(v) => handleToggleActive(user.id, v)}
                trackColor={{ false: '#e5e7eb', true: '#0ea5e9' }}
              />
            </View>
          </View>
        ))}
      </View>

      {showAddUser && (
        <AddUserModal
          visible={showAddUser}
          onClose={() => setShowAddUser(false)}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
          errors={errors}
        />
      )}
    </FormScrollView>
  );
}

function AddUserModal({ visible, onClose, onSubmit, isSubmitting, errors }: any) {
  const { t } = useTranslation();
  const { control, handleSubmit, formState: { errors: formErrors } } = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: '', email: '', phone: '', role: 'STAFF' },
  });

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('users.addUser')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>
          
          <FormScrollView contentContainerStyle={styles.modalContent} avoidKeyboard={false}>
            <FormInput control={control} name="name"
            label={t('auth.name')}
            required
          />
            <FormInput control={control} name="email"
            label={t('auth.email')}
            keyboardType="email-address"
            autoCapitalize="none"
            required
          />
            <FormInput control={control} name="phone"
            label={t('auth.phone')}
          />
            <FormPicker control={control} name="role" label={t('users.role')}>{ROLES.map((r) => <Picker.Item key={r.value} label={t(`users.${r.value.toLowerCase()}`)} value={r.value} />)}</FormPicker>
          </FormScrollView>
          
          <View style={styles.modalActions}>
            <Button variant="outline" onPress={onClose} disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onPress={() => handleSubmit(onSubmit)()} loading={isSubmitting}>
              {t('common.save')}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function getRoleColor(role: string) {
  switch (role) {
    case 'OWNER': return '#f59e0b';
    case 'MANAGER': return '#0ea5e9';
    case 'CASHIER': return '#22c55e';
    case 'STAFF': return '#8b5cf6';
    default: return '#6b7280';
  }
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  usersList: {
    gap: 12,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0ea5e9',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  userEmail: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  userActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalContent: {
    padding: 20,
    gap: 16,
  },
  fieldGroup: {
    position: 'relative',
  },
  picker: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
});

import { Modal, Switch } from 'react-native';
import { Picker } from '@react-native-picker/picker';
