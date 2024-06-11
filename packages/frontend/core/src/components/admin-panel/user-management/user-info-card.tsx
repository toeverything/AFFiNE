import {
  Avatar,
  Button,
  Input,
  Scrollable,
  Switch,
  useConfirmModal,
} from '@affine/component';
import { FeatureType } from '@affine/graphql';
import { useCallback, useMemo, useState } from 'react';

import type { User } from '../types';
import * as styles from './user-info-card.css';

const WorkspaceFeatures = [FeatureType.Copilot, FeatureType.UnlimitedWorkspace];

const Description = ({
  feature,
  checked,
  userName,
  userEmail,
}: {
  feature: string;
  checked: boolean;
  userName: string;
  userEmail: string;
}) => (
  <div>
    This action will <strong>{checked ? 'enable' : 'disable'}</strong> the{' '}
    <strong>{feature}</strong> feature for{' '}
    <span className={styles.userNameAndEmail}>
      {userName} ({userEmail})
    </span>
  </div>
);

export const UserInfoCard = ({ user }: { user: User }) => {
  const [userName, setUserName] = useState(user.name);
  const [userEmail, setUserEmail] = useState(user.email);

  const { openConfirmModal } = useConfirmModal();

  const onChangeName = useCallback((value: string) => {
    setUserName(value);
  }, []);
  const onChangeEmail = useCallback((value: string) => {
    setUserEmail(value);
  }, []);

  const featureItems = useMemo(() => {
    return Object.values(FeatureType)
      .filter(feature => !WorkspaceFeatures.includes(feature))
      .map(feature => {
        const checked = user.features.includes(feature);
        const handleChange = (checked: boolean) => {
          openConfirmModal({
            title: checked ? `Enable ${feature}?` : `Disable ${feature}?`,
            description: (
              <Description
                feature={feature}
                checked={checked}
                userEmail={user.email}
                userName={user.name}
              />
            ),
            onConfirm: () => {
              console.log('update feature', feature, checked);
            },
            confirmButtonOptions: {
              children: checked ? 'Enable' : 'Disable',
              type: 'primary',
            },
          });
        };
        return (
          <div key={feature} className={styles.featureContainer}>
            <div> {feature}</div>
            <Switch checked={checked} onChange={handleChange} />
          </div>
        );
      });
  }, [openConfirmModal, user.email, user.features, user.name]);

  return (
    <Scrollable.Root>
      <Scrollable.Viewport>
        <div className={styles.root}>
          <Avatar name={user.name} url={user.avatarUrl} size={64} />
          <div className={styles.infoTitle}>
            Name <Button>Change Name</Button>
          </div>
          <Input
            className={styles.profileInput}
            defaultValue={userName}
            onChange={onChangeName}
          />
          <div className={styles.infoTitle}>
            Email <Button>Change Email</Button>
          </div>
          <Input
            className={styles.profileInput}
            defaultValue={userEmail}
            onChange={onChangeEmail}
          />
          <div className={styles.infoTitle}>
            Password <Button>Change Password</Button>
          </div>

          <div className={styles.infoTitle}>Features</div>
          <div className={styles.featureList}> {featureItems}</div>
        </div>
      </Scrollable.Viewport>
      <Scrollable.Scrollbar />
    </Scrollable.Root>
  );
};
