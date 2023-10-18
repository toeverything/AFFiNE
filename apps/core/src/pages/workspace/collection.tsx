import {
  currentCollectionAtom,
  useCollectionManager,
} from '@affine/component/page-list';
import type { Collection } from '@affine/env/filter';
import { FilterIcon, PageIcon, ViewLayersIcon } from '@blocksuite/icons';
import { getCurrentStore } from '@toeverything/infra/atom';
import { useAtomValue } from 'jotai';
import { useCallback } from 'react';
import { type LoaderFunction, redirect, useParams } from 'react-router-dom';

import {
  collectionsCRUDAtom,
  pageCollectionBaseAtom,
} from '../../atoms/collections';
import { useEditCollection } from '../../hooks/affine/use-edit-collection';
import { useNavigateHelper } from '../../hooks/use-navigate-helper';
import { AllPage } from './all-page';
import * as styles from './collection.css';

export const loader: LoaderFunction = async args => {
  const rootStore = getCurrentStore();
  if (!args.params.collectionId) {
    return redirect('/404');
  }
  rootStore.set(currentCollectionAtom, args.params.collectionId);
  return null;
};

export const Component = function CollectionPage() {
  const { collections, loading } = useAtomValue(pageCollectionBaseAtom);
  const navigate = useNavigateHelper();
  const params = useParams();
  if (loading) {
    return null;
  }
  const collection = collections.find(v => v.id === params.collectionId);
  if (!collection) {
    navigate.jumpTo404();
    return null;
  }
  return isEmpty(collection) ? (
    <Placeholder collection={collection} />
  ) : (
    <AllPage />
  );
};

const Placeholder = ({ collection }: { collection: Collection }) => {
  const { node, open } = useEditCollection();
  const { updateCollection } = useCollectionManager(collectionsCRUDAtom);
  const openPageEdit = useCallback(() => {
    open({ ...collection, mode: 'page' }).then(updateCollection);
  }, []);
  const openRuleEdit = useCallback(() => {
    open({ ...collection, mode: 'rule' }).then(updateCollection);
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--affine-text-secondary-color)',
          }}
        >
          <ViewLayersIcon style={{ color: 'var(--affine-icon-color)' }} />
          All Collections
          <div>/</div>
        </div>
        <div
          style={{ fontWeight: 600, color: 'var(--affine-text-primary-color)' }}
        >
          {collection.name}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          alignItems: 'center',
          gap: 64,
        }}
      >
        <div
          style={{
            width: 432,
            marginTop: 118,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 18,
          }}
        >
          {affineShape}
          <div
            style={{
              fontSize: 20,
              lineHeight: '28px',
              fontWeight: 600,
              color: 'var(--affine-text-primary-color)',
            }}
          >
            Empty Collection
          </div>
          <div
            style={{
              fontSize: 12,
              lineHeight: '20px',
              color: 'var(--affine-text-secondary-color)',
            }}
          >
            Collection is a smart folder where you can manually add pages or
            automatically add pages through rules.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <div onClick={openPageEdit} className={styles.placeholderButton}>
              <PageIcon
                style={{
                  width: 20,
                  height: 20,
                  color: 'var(--affine-icon-color)',
                }}
              />
              <span style={{ padding: '0 4px' }}>Add Pages</span>
            </div>
            <div onClick={openRuleEdit} className={styles.placeholderButton}>
              <FilterIcon
                style={{
                  width: 20,
                  height: 20,
                  color: 'var(--affine-icon-color)',
                }}
              />
              <span style={{ padding: '0 4px' }}>Add Rules</span>
            </div>
          </div>
        </div>
        <div
          style={{
            width: 452,
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--affine-background-overlay-panel-color)',
            padding: 10,
            gap: 14,
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: 12,
              lineHeight: '20px',
              color: 'var(--affine-text-secondary-color)',
            }}
          >
            HELP INFO
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              fontSize: 12,
              lineHeight: '20px',
            }}
          >
            <div>
              <span style={{ fontWeight: 600 }}>Add pages:</span> You can freely
              select pages and add them to the collection.
            </div>
            <div>
              <span style={{ fontWeight: 600 }}>Add rules:</span> Rules are
              based on filtering. After adding rules, pages that meet the
              requirements will be automatically added to the current
              collection.
            </div>
          </div>
        </div>
      </div>
      {node}
    </div>
  );
};

const affineShape = (
  <svg
    width="200"
    height="174"
    viewBox="0 0 200 174"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="200" height="173.475" fill="white" />
    <rect
      x="51.7242"
      y="38.4618"
      width="96.5517"
      height="96.5517"
      stroke="#D2D2D2"
      strokeWidth="0.530504"
    />
    <path
      d="M51.8341 86.7377L100 38.5717L148.166 86.7377L100 134.904L51.8341 86.7377Z"
      stroke="#D2D2D2"
      strokeWidth="0.530504"
    />
    <path
      d="M99.6055 38.1965C107.662 33.4757 117.043 30.7695 127.056 30.7695C157.087 30.7695 181.432 55.1147 181.432 85.1461C181.432 107.547 167.887 126.783 148.541 135.113"
      stroke="#D2D2D2"
      strokeWidth="0.530504"
    />
    <path
      d="M148.375 86.4724C153.096 94.5294 155.802 103.91 155.802 113.923C155.802 143.954 131.457 168.299 101.426 168.299C79.0252 168.299 59.7883 154.754 51.4585 135.408"
      stroke="#D2D2D2"
      strokeWidth="0.530504"
    />
    <path
      d="M100.395 135.113C92.3376 139.834 82.957 142.54 72.9444 142.54C42.913 142.54 18.5677 118.195 18.5677 88.1636C18.5677 65.7632 32.1126 46.5264 51.459 38.1965"
      stroke="#D2D2D2"
      strokeWidth="0.530504"
    />
    <path
      d="M51.4588 87.1319C46.7379 79.0749 44.0317 69.6944 44.0317 59.6818C44.0317 29.6504 68.377 5.3051 98.4084 5.30509C120.809 5.30509 140.046 18.85 148.375 38.1963"
      stroke="#D2D2D2"
      strokeWidth="0.530504"
    />
    <path
      d="M51.459 38.1965L148.541 135.279"
      stroke="#D2D2D2"
      strokeWidth="0.530504"
    />
    <path
      d="M148.541 38.1965L51.459 135.279"
      stroke="#D2D2D2"
      strokeWidth="0.530504"
    />
    <path
      d="M99.9995 38.1965V135.279"
      stroke="#D2D2D2"
      strokeWidth="0.530504"
    />
    <path
      d="M148.541 86.7376L51.4588 86.7376"
      stroke="#D2D2D2"
      strokeWidth="0.530504"
    />
    <ellipse
      cx="148.276"
      cy="38.4618"
      rx="3.97878"
      ry="3.97878"
      fill="#5B5B5B"
    />
    <ellipse
      cx="148.276"
      cy="135.014"
      rx="3.97878"
      ry="3.97878"
      fill="#5B5B5B"
    />
    <ellipse
      cx="148.276"
      cy="86.7377"
      rx="3.97878"
      ry="3.97878"
      fill="#5B5B5B"
    />
    <ellipse
      cx="51.7239"
      cy="38.4618"
      rx="3.97878"
      ry="3.97878"
      fill="#5B5B5B"
    />
    <ellipse
      cx="51.7239"
      cy="135.014"
      rx="3.97878"
      ry="3.97878"
      fill="#5B5B5B"
    />
    <ellipse
      cx="51.7239"
      cy="86.7377"
      rx="3.97878"
      ry="3.97878"
      fill="#5B5B5B"
    />
    <ellipse
      cx="99.9998"
      cy="38.4618"
      rx="3.97878"
      ry="3.97878"
      transform="rotate(-90 99.9998 38.4618)"
      fill="#5B5B5B"
    />
    <ellipse
      cx="99.9998"
      cy="86.2071"
      rx="3.97878"
      ry="3.97878"
      transform="rotate(-90 99.9998 86.2071)"
      fill="#5B5B5B"
    />
    <ellipse
      cx="99.9998"
      cy="135.014"
      rx="3.97878"
      ry="3.97878"
      transform="rotate(-90 99.9998 135.014)"
      fill="#5B5B5B"
    />
  </svg>
);

const isEmpty = (collection: Collection) => {
  return (
    (collection.mode === 'page' && collection.pages.length === 0) ||
    (collection.mode === 'rule' &&
      collection.allowList.length === 0 &&
      collection.filterList.length === 0)
  );
};
