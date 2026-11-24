import { FormScrollView, FormInput, FormPinInput, FormPicker, Button } from '@/components';
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { userRepository } from '@/repositories/users/users';
import { DateRangeBar, rangeLabel, useDateRange } from '@/components/DateRangeFilter';
import { RowActionMenu } from '@/components/RowActionMenu';
import { formatRecordDateTime } from '@/utils/formatters';
import { showToast } from '@/stores/toastStore';
import { queueSync } from '@/services/sync/queue';
import { User, UserRole } from '@/types';
import { getPinProblem } from '@/utils/pin';
import { colors } from '@/theme/tokens';
import { TFunction } from 'i18next';
import { formatPhone, normalizeEmail, normalizePhone } from '@/utils/identity';
import { describeAccountError } from '@/services/auth/pinAuth';

function buildUserFormSchema(t: TFunction) {
  return z.object({
    name: z.string().trim().min(2, t('auth.nameRequired')),
    email: z.string().trim().refine((value) => !value || normalizeEmail(value) !== null, t('auth.invalidEmail')),
    phone: z.string().trim().refine((value) => !value || normalizePhone(value) !== null, t('auth.invalidPhone')),
    password: z.string().optional(),
    role: z.enum(['MANAGER', 'CASHIER', 'STAFF']),
  }).refine((data) => Boolean(data.email || data.phone), {
    message: t('auth.identifierRequired'),
    path: ['phone'],
  });
}

type UserFormValues = z.infer<ReturnType<typeof buildUserFormSchema>>;
type AssignableRole = UserFormValues['role'];

const ROLES: { value: AssignableRole; labelKey: string }[] = [
  { value: 'MANAGER', labelKey: 'users.manager' },
  { value: 'CASHIER', labelKey: 'users.cashier' },
  { value: 'STAFF', labelKey: 'users.staff' },
];

function isAssignableRole(role: UserRole | null | undefined): role is AssignableRole {
  return role === 'MANAGER' || role === 'CASHIER' || role === 'STAFF';
}

export default function UserManagementScreen() {
  const { t } = useTranslation();
  const { business, user: currentUser } = useAuthStore();
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<User | null>(null);
  const [showForm, setShowForm] = React.useState(false);

  const { data: users = [], refetch } = useQuery({
    queryKey: ['users', business?.id],
    queryFn: () => userRepository.findAll(business!.id),
    enabled: !!business?.id,
  });
  const userDates = useDateRange('all');
  const shownUsers = userDates.filter(users, (u) => u.created_at);

  const handleSaved = async () => {
    setShowForm(false);
    setEditing(null);
    await queryClient.invalidateQueries({ queryKey: ['users', business?.id] });
    await refetch();
  };

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    setShowForm(true);
  };

  const handleToggleActive = async (userId: string, active: boolean) => {
    if (!business) return;
    if (userId === currentUser?.id) {
      showToast(t('users.cannotChangeSelf'), 'error');
      return;
    }
    try {
      await userRepository.setActive(userId, business.id, active);
      const updated = await userRepository.findByIdInBusiness(userId, business.id);
      if (updated) {
        await queueSync(
          'users',
          updated.id,
          'update',
          updated as unknown as Record<string, unknown>,
          business.id
        );
      }
      showToast(active ? t('users.userUpdated') : t('users.userDisabled'), 'success');
      await refetch();
    } catch (error) {
      console.error('Failed to toggle user:', error);
      showToast(t('users.userFailed'), 'error');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!business) return;
    if (userId === currentUser?.id) {
      showToast(t('users.cannotChangeSelf'), 'error');
      return;
    }
    Alert.alert(
      t('users.deleteConfirm'),
      t('users.deleteConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await userRepository.delete(userId, business.id);
              await queueSync('users', userId, 'delete', { id: userId }, business.id);
              showToast(t('users.userDeleted'), 'success');
              await refetch();
            } catch (error) {
              const message = error instanceof Error ? error.message : '';
              showToast(
                /constraint|foreign key/i.test(message) ? t('users.cannotDeleteHistory') : t('users.userFailed'),
                'error'
              );
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <FormScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{t('users.users')}</Text>
            {business?.business_code ? (
              <Text style={styles.businessCode}>
                {t('auth.businessCode')}: {business.business_code}
              </Text>
            ) : null}
          </View>
        </View>

        <Button variant="primary" onPress={openCreate} style={styles.createButton}>
          {t('users.addUser')}
        </Button>

        <DateRangeBar
          value={userDates.range}
          onChange={userDates.setRange}
          count={shownUsers.length}
          onExport={() => ({
            title: t('users.users'),
            periodLabel: `${t('common.dateAdded')}: ${rangeLabel(userDates.range, t)}`,
            summary: [
              { label: t('users.users'), value: shownUsers.length },
              { label: t('users.active'), value: shownUsers.filter((u) => u.active).length },
            ],
            columns: [{ header: t('users.name') }, { header: t('users.phone') }, { header: t('users.email') }, { header: t('users.role') }, { header: t('users.active') }, { header: t('common.dateAdded') }],
            rows: shownUsers.map((u) => [
              u.name,
              u.phone ?? '',
              u.email ?? '',
              t(`users.${(u.role ?? 'STAFF').toLowerCase()}` as 'users.owner'),
              u.active ? t('users.active') : t('users.inactive'),
              formatRecordDateTime(u.created_at),
            ]),
          })}
        />
        <View style={styles.usersList}>
          {shownUsers.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              isSelf={user.id === currentUser?.id}
              onEdit={openEdit}
              onToggleActive={handleToggleActive}
              onDelete={handleDeleteUser}
            />
          ))}
          {users.length === 0 ? (
            <Text style={styles.emptyText}>{t('users.noUsers')}</Text>
          ) : null}
        </View>
      </FormScrollView>

      <UserFormModal
        visible={showForm}
        user={editing}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
      />
    </View>
  );
}

function UserRow({
  user,
  isSelf,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  user: User;
  isSelf: boolean;
  onEdit: (user: User) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const role = user.role ?? 'STAFF';
  const locked = role === 'OWNER' || isSelf;

  return (
    <View style={[styles.userCard, !user.active && styles.userCardInactive]}>
      <View style={styles.userAvatar}>
        <Text style={styles.userAvatarText}>{getInitials(user.name)}</Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{user.name}</Text>
        <Text style={styles.userEmail}>{[user.phone ? formatPhone(user.phone) : null, user.email].filter(Boolean).join(' · ')}</Text>
        <View style={[styles.roleBadge, { backgroundColor: getRoleColor(role) }]}>
          <Text style={styles.roleBadgeText}>{t(`users.${role.toLowerCase()}` as 'users.owner')}</Text>
        </View>
        {!user.active ? <Text style={styles.inactiveLabel}>{t('users.inactive')}</Text> : null}
      </View>
      <View style={styles.userActions}>
        <RowActionMenu
          title={user.name}
          actions={[
            { label: t('users.editUser'), icon: 'create-outline', onPress: () => onEdit(user) },
            {
              label: user.active ? t('users.deactivate') : t('users.reactivate'),
              icon: user.active ? 'pause-circle-outline' : 'play-circle-outline',
              hidden: locked,
              onPress: () => onToggleActive(user.id, !user.active),
            },
            { label: t('common.delete'), icon: 'trash-outline', tone: 'danger', hidden: role === 'OWNER' || isSelf, onPress: () => onDelete(user.id) },
          ]}
        />
      </View>
    </View>
  );
}

function UserFormModal({
  visible,
  user,
  onClose,
  onSaved,
}: {
  visible: boolean;
  user: User | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { business } = useAuthStore();
  const isEdit = !!user;
  const userFormSchema = React.useMemo(() => buildUserFormSchema(t), [t]);
  const { control, handleSubmit, reset, setError, formState: { isSubmitting } } = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: { name: '', email: '', phone: '', password: '', role: 'STAFF' },
  });

  React.useEffect(() => {
    if (!visible) return;
    reset({
      name: user?.name ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      password: '',
      role: isAssignableRole(user?.role) ? user.role : 'STAFF',
    });
  }, [visible, user, reset]);

  const onSubmit = async (data: UserFormValues) => {
    if (!business) return;
    const password = data.password?.trim() ?? '';
    if (!isEdit || password.length > 0) {
      const problem = getPinProblem(password);
      if (problem) {
        setError('password', { message: t(`auth.${problem}`) });
        return;
      }
    }
    try {
      if (isEdit && user) {
        const updated = await userRepository.updateBusinessUser(user.id, business.id, {
          name: data.name,
          email: data.email || null,
          phone: data.phone || null,
          role: user.role === 'OWNER' ? 'OWNER' : data.role,
          password: password || undefined,
          active: user.active,
        });
        const passwordHash = await userRepository.getPasswordHash(updated.id);
        await queueSync(
          'users',
          updated.id,
          'update',
          {
            ...(updated as unknown as Record<string, unknown>),
            ...(passwordHash ? { password_hash: passwordHash } : {}),
          },
          business.id
        );
        showToast(t('users.userUpdated'), 'success');
      } else {
        const created = await userRepository.createBusinessUser({
          name: data.name,
          email: data.email || null,
          phone: data.phone || null,
          password,
          role: data.role,
          businessId: business.id,
        });
        const passwordHash = await userRepository.getPasswordHash(created.id);
        await queueSync(
          'users',
          created.id,
          'insert',
          {
            ...(created as unknown as Record<string, unknown>),
            ...(passwordHash ? { password_hash: passwordHash } : {}),
          },
          business.id
        );
        showToast(t('users.userAdded'), 'success');
      }
      await onSaved();
    } catch (error) {
      const known = describeAccountError(error);
      const message = known ?? (error instanceof Error && error.message !== 'OWNER_LOCKED' ? error.message : t('users.userFailed'));
      showToast(message, 'error');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{isEdit ? t('users.editUser') : t('users.addUser')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <FormInput control={control} name="name" label={t('auth.name')} required />
            <Text style={styles.contactHint}>{t('users.contactHint')}</Text>
            <FormInput
              control={control}
              name="phone"
              label={t('auth.phone')}
              placeholder="0788 123 456"
              keyboardType="phone-pad"
            />
            <FormInput
              control={control}
              name="email"
              label={t('auth.emailOptional')}
              placeholder="name@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <FormPinInput
              control={control}
              name="password"
              label={isEdit ? t('users.pinOptional') : t('auth.pinLabel')}
              helperText={t('users.staffPinHelper')}
            />
            {user?.role === 'OWNER' ? null : (
              <FormPicker control={control} name="role" label={t('users.role')}>
                {ROLES.map((r) => (
                  <Picker.Item
                    key={r.value}
                    label={t(r.labelKey)}
                    value={r.value}
                  />
                ))}
              </FormPicker>
            )}
          </ScrollView>

          <View style={styles.modalActions}>
            <Button variant="outline" onPress={onClose} disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onPress={() => handleSubmit(onSubmit)()}
              loading={isSubmitting}
            >
              {t('common.save')}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function getRoleColor(role: string) {
  switch (role) {
    case 'OWNER':
      return '#f59e0b';
    case 'MANAGER':
      return '#0ea5e9';
    case 'CASHIER':
      return '#22c55e';
    case 'STAFF':
      return '#8b5cf6';
    default:
      return '#6b7280';
  }
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const styles = StyleSheet.create({
  contactHint: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    marginBottom: 12,
  },
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
  businessCode: {
    marginTop: 4,
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButton: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  usersList: {
    gap: 12,
  },
  emptyText: {
    textAlign: 'center',
    color: '#9ca3af',
    marginTop: 24,
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
  userCardInactive: {
    opacity: 0.55,
  },
  inactiveLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#b45309',
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
    color: colors.primary,
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
    alignSelf: 'flex-start',
    marginTop: 6,
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
    height: '88%',
  },
  formScroll: {
    flex: 1,
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
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
});
