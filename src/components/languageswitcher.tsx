/**
 * TrguiNG - next gen remote GUI for transmission torrent daemon
 * Copyright (C) 2023  qu1ck (mail at qu1ck.org)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { ActionIcon, Menu, SegmentedControl } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import React, { useCallback } from 'react';
import * as Icon from 'react-bootstrap-icons';

interface LanguageSwitcherProps {
  variant?: 'icon' | 'segmented';
  size?: 'sm' | 'md' | 'lg';
}

const languages = [
  { value: 'en', label: 'English', flag: '🇺🇸' },
  { value: 'zh', label: '中文', flag: '🇨🇳' },
];

export function LanguageSwitcher({ variant = 'icon', size = 'lg' }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();

  const handleLanguageChange = useCallback((language: string) => {
    i18n.changeLanguage(language);
  }, [i18n]);

  const currentLanguage = languages.find(lang => lang.value === i18n.language) || languages[0];

  if (variant === 'segmented') {
    return (
      <SegmentedControl
        value={i18n.language}
        onChange={handleLanguageChange}
        data={languages.map(lang => ({
          value: lang.value,
          label: `${lang.flag} ${lang.label}`
        }))}
        size={size}
      />
    );
  }

  return (
    <Menu shadow="md" width={200} withinPortal>
      <Menu.Target>
        <ActionIcon
          variant="default"
          size={size}
          title={t('app.language')}
        >
          <Icon.Translate size="1.1rem" />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>{t('app.language')}</Menu.Label>
        {languages.map((language) => (
          <Menu.Item
            key={language.value}
            onClick={() => handleLanguageChange(language.value)}
            icon={<span>{language.flag}</span>}
            rightSection={i18n.language === language.value ? <Icon.Check size="0.8rem" /> : undefined}
          >
            {language.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
