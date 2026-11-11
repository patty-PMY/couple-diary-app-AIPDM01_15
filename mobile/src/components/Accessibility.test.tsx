import React from 'react';
import * as Native from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { Button, Field, Heading, Page } from './UI';
import { colors } from '../lib/theme';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

it('所有主要、次要文字及按鈕文案達到一般文字 4.5:1 對比', () => {
  for (const foreground of [colors.ink, colors.muted, colors.green]) {
    for (const background of [colors.background, colors.surface, colors.greenLight, colors.yellow, colors.peach]) {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  }
  expect(contrast(colors.white, colors.green)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(colors.danger, colors.surface)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(colors.controlBorder, colors.surface)).toBeGreaterThanOrEqual(3);
});

describe.each(['ios', 'android'] as const)('%s 可讀性與無障礙語意', (platform) => {
  afterEach(() => jest.restoreAllMocks());
  it.each([[320, 2], [390, 1], [768, 1]])('在 %ipx／%i 倍字體仍提供標題、欄位與狀態標籤', async (width, fontScale) => {
    jest.replaceProperty(Native.Platform, 'OS', platform);
    jest.spyOn(Native, 'useWindowDimensions').mockReturnValue({ width, height: 740, scale: 1, fontScale });
    await render(<Page><Heading title="測試標題" /><Field label="行程名稱" helper="最多 120 字" /><Button loading>儲存行程</Button></Page>);
    expect(screen.getByRole('header', { name: '測試標題' })).toBeTruthy();
    expect(screen.getByLabelText('行程名稱').props.accessibilityHint).toBe('最多 120 字');
    expect(screen.getByRole('button', { name: '儲存行程' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '儲存行程' }).props.accessibilityState.busy).toBe(true);
    expect(screen.getByLabelText('行程名稱').props.allowFontScaling).not.toBe(false);
  });
});
